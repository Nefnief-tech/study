import 'dart:convert';

import 'package:crypto/crypto.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../appwrite/client.dart';
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
  static String? _token;
  /// deterministic per-install Appwrite push-target id, so re-registering
  /// replaces this device's target instead of piling up duplicates
  static String? _targetId;

  static Future<void> init() async {
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

    FirebaseMessaging.instance.onTokenRefresh.listen((token) {
      _token = token;
      _syncTarget();
    });

    try {
      _token = await FirebaseMessaging.instance.getToken();
    } catch (e) {
      if (kDebugMode) debugPrint('[push] no FCM token: $e');
      return;
    }
    await _syncTarget();
  }

  /// stable per-install target id derived from an install random value
  static Future<String> _ensureTargetId() async {
    if (_targetId != null) return _targetId!;
    final prefs = await SharedPreferences.getInstance();
    var seed = prefs.getString('semester.pushtargetseed');
    if (seed == null) {
      seed = DateTime.now().microsecondsSinceEpoch.toString() +
          _token.hashCode.toString();
      await prefs.setString('semester.pushtargetseed', seed);
    }
    final digest = sha256.convert(utf8.encode('pushtarget:$seed'));
    _targetId = digest.toString().substring(0, 32);
    return _targetId!;
  }

  /// registers (or refreshes) the signed-in user's Appwrite push target.
  /// appwrite ≥ 1.7 scopes targets to the current session's user.
  static Future<void> _syncTarget() async {
    final auth = Stores.I.auth;
    final token = _token;
    if (!available || auth.status != SyncStatus.signedIn || token == null) return;
    try {
      final targetId = await _ensureTargetId();
      try {
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
