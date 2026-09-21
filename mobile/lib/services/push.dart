import 'dart:convert';

import 'package:crypto/crypto.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../appwrite/client.dart';
import '../navigation.dart' show AppNav;
import '../stores/auth_store.dart' show SyncStatus;
import '../stores/registry.dart';

/// Push messages through Appwrite Messaging.
///
/// Setup (one-time, see mobile/PUSH_SETUP.md):
///   1. create a Firebase project with an Android app (package
///      `app.semester.mobile`), drop `google-services.json` into `android/app/`
///      and add the google-services plugin to `android/app/build.gradle.kts`
///   2. add the FCM provider credentials in the Appwrite console
///      (Messaging → Add provider → FCM)
///   3. add an Android platform `app.semester.mobile` to the Appwrite project
///
/// Without `google-services.json` the app builds and runs normally — push is
/// simply unavailable (every Firebase call is guarded).

final FlutterLocalNotificationsPlugin _localNotifications =
    FlutterLocalNotificationsPlugin();

const AndroidNotificationChannel _channel = AndroidNotificationChannel(
  'semester_push',
  'Semester',
  description: 'Sync and study reminders from your Semester cloud',
  importance: Importance.defaultImportance,
);

@pragma('vm:entry-point')
Future<void> semesterFirebaseMessagingHandler(RemoteMessage message) async {
  await Firebase.initializeApp();
  // while the app is backgrounded/terminated, Android already displays
  // messages that carry a notification payload — showing a local one here
  // too made every push arrive twice. Only data-only messages need us.
  if (message.notification != null) return;
  await _showNotification(message);
}

Future<void> _showNotification(RemoteMessage message) async {
  final notification = message.notification;
  final title = notification?.title ?? message.data['title'] as String? ?? 'Semester';
  final body = notification?.body ?? message.data['body'] as String? ?? '';
  await _localNotifications.show(
    id: message.messageId?.hashCode ?? DateTime.now().millisecondsSinceEpoch % 0x7fffffff,
    title: title,
    body: body,
    payload: message.data['route'] as String?,
    notificationDetails: NotificationDetails(
      android: AndroidNotificationDetails(
        _channel.id,
        _channel.name,
        channelDescription: _channel.description,
        importance: Importance.defaultImportance,
        priority: Priority.defaultPriority,
      ),
    ),
  );
}

class PushService {
  static bool available = false;
  static bool registered = false;
  static bool _initialized = false;
  static SyncStatus? _lastAuthStatus;
  static String? _token;

  /// where a tapped push should land — the functions tag messages with
  /// data.route ('timetable' · 'homework' · 'calendar'); AppNav resolves it
  static void _navigate(String? route) {
    if (route == null || route.isEmpty) return;
    AppNav.I.handle(route);
  }
  /// Appwrite push-target id of the currently signed-in user on this device —
  /// derived per install AND per user, so account switches never collide with
  /// a target owned by a different user (target ids are globally unique)
  static String? _targetId;
  static String? _targetUserId;

  static Future<void> init() async {
    // main() and AppShell.initState both call init() — run once, or the
    // permission dialog and target sync race each other
    if (_initialized) return;
    _initialized = true;
    try {
      await Firebase.initializeApp();
    } catch (_) {
      available = false;
      return;
    }
    available = true;

    // every step is individually guarded — a failure here must never break
    // the app or skip the remaining steps
    try {
      await _localNotifications.initialize(
        settings: const InitializationSettings(
          android: AndroidInitializationSettings('@mipmap/ic_launcher'),
        ),
        onDidReceiveNotificationResponse: (response) => _navigate(response.payload),
      );
      await _localNotifications
          .resolvePlatformSpecificImplementation<
              AndroidFlutterLocalNotificationsPlugin>()
          ?.createNotificationChannel(_channel);
    } catch (e) {
      if (kDebugMode) debugPrint('[push] local notifications unavailable: $e');
    }

    try {
      await FirebaseMessaging.instance
          .requestPermission(alert: true, badge: true, sound: true);
    } catch (e) {
      // e.g. "a request for permissions is already running" when the system
      // dialog from a previous session is still pending — notifications work
      // once the user grants it from that prompt
      if (kDebugMode) debugPrint('[push] permission request skipped: $e');
    }

    FirebaseMessaging.onMessage.listen((message) {
      // foreground: FCM does not surface the system notification
      // automatically, so show it through the local plugin
      _showNotification(message);
    });

    // taps on a notification that opened/resumed the app → land on the
    // page the push is about (the functions tag messages with data.route)
    FirebaseMessaging.instance.getInitialMessage().then((message) {
      _navigate(message?.data['route'] as String?);
    }).catchError((_) {});
    FirebaseMessaging.onMessageOpenedApp.listen((message) {
      _navigate(message.data['route'] as String?);
    });

    FirebaseMessaging.instance.onTokenRefresh.listen((token) {
      _token = token;
      _syncTarget();
    });

    // the session is NOT persisted — auth status flips to signedIn only after
    // initSync()'s network restore, long after this init() ran, so the plain
    // _syncTarget() below would silently skip on every signed-in cold start.
    // Re-arm on the transition INTO signedIn (covers startup restore and
    // explicit sign-ins; sign-out cleanup keeps its own hook)
    Stores.I.auth.addListener(_onAuthChanged);

    try {
      _token = await FirebaseMessaging.instance.getToken();
    } catch (e) {
      if (kDebugMode) debugPrint('[push] no FCM token: $e');
      return;
    }
    await _syncTarget();
  }

  static void _onAuthChanged() {
    final status = Stores.I.auth.status;
    final becameSignedIn =
        status == SyncStatus.signedIn && _lastAuthStatus != SyncStatus.signedIn;
    _lastAuthStatus = status;
    if (becameSignedIn) _syncTarget();
  }

  /// stable per-user, per-install target id: same user + same install keeps
  /// one target (re-registration refreshes it), a different account on this
  /// device gets its own — no 409s against targets owned by someone else
  static Future<String> _ensureTargetId(String userId) async {
    if (_targetId != null && _targetUserId == userId) return _targetId!;
    final prefs = await SharedPreferences.getInstance();
    final key = 'semester.pushtarget.$userId';
    var id = prefs.getString(key);
    if (id == null) {
      var seed = prefs.getString('semester.pushtargetseed');
      if (seed == null) {
        seed = DateTime.now().microsecondsSinceEpoch.toString() +
            _token.hashCode.toString();
        await prefs.setString('semester.pushtargetseed', seed);
      }
      final digest = sha256.convert(utf8.encode('pushtarget:$seed:$userId'));
      id = digest.toString().substring(0, 32);
      await prefs.setString(key, id);
    }
    _targetId = id;
    _targetUserId = userId;
    return id;
  }

  /// registers (or refreshes) the signed-in user's Appwrite push target.
  /// appwrite ≥ 1.7 scopes targets to the current session's user.
  static Future<void> _syncTarget() async {
    final auth = Stores.I.auth;
    final token = _token;
    final userId = auth.user?.id;
    if (!available ||
        auth.status != SyncStatus.signedIn ||
        token == null ||
        userId == null ||
        userId.isEmpty) {
      return;
    }
    try {
      final targetId = await _ensureTargetId(userId);
      try {
        // refresh: drop this user's stale target (old FCM token) first
        await account.deletePushTarget(targetId: targetId);
      } catch (_) {
        // no target yet — fine
      }
      await account.createPushTarget(targetId: targetId, identifier: token);
      registered = true;
    } catch (e) {
      registered = false;
      if (kDebugMode) debugPrint('[push] target registration failed: $e');
    }
  }

  /// called after sign-in — registers this device for the user
  static Future<void> onSignIn() => _syncTarget();

  /// called on sign-out — removes this device's push target
  static Future<void> onSignOut() async {
    registered = false;
    if (!available || _targetId == null) return;
    try {
      await account.deletePushTarget(targetId: _targetId!);
    } catch (_) {}
  }
}
