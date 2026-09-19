import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';

import 'package:appwrite/appwrite.dart';
import 'package:crypto/crypto.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

import '../models/types.dart';
import '../stores/auth_store.dart';
import '../stores/grades_store.dart' show normalizeGradeEntries;
import '../stores/registry.dart';
import '../stores/studyroom_store.dart';
import 'client.dart';

/// Sync model: **the cloud is the source of truth on page load.**
///
///  - On signed-in load, every store is replaced by its cloud snapshot
///    ("load from the db first").
///  - Afterwards each local change marks the store dirty and is pushed
///    (debounced) — "write afterwards".
///  - The only exception: local edits that never made it up (offline push
///    failure) keep their dirty flag and win over the cloud on the next load,
///    so offline work is never silently clobbered.
///
/// Layout: subjects/todos/homework/grades/events/timetable + the study-room
/// selection live as one snapshot document per store in `snapshots`; chats
/// live in `chats` (one doc per user) and decks in `decks` (one doc per deck).
/// All are per-user documents; permissions restrict them to their owner.
/// Identical document IDs and payloads as the web app's `src/lib/auth/sync.ts`.

const PUSH_DEBOUNCE_MS = 1200;
const MAX_CHAT_MESSAGES = 120;

Future<String> snapshotDocId(String userId, String collection, String key) async {
  final digest = sha256.convert(utf8.encode('$userId:$collection:$key'));
  return digest.toString().substring(0, 32);
}

class _KeyOps {
  final String key;
  final String? collection; // null → snapshots
  final Map<String, dynamic> Function() read;
  final void Function(Map<String, dynamic> doc) apply;
  final bool Function() isEmpty;
  final bool omitKey;

  const _KeyOps({
    required this.key,
    this.collection,
    required this.read,
    required this.apply,
    required this.isEmpty,
    this.omitKey = false,
  });
}

StudyroomStore get _room => Stores.I.studyroom;

Map<String, dynamic> _listPayload(String field, List<Map<String, dynamic>> items) =>
    {'data': jsonEncode({field: items})};

List<Map<String, dynamic>> _listFromDoc(Map<String, dynamic> doc, String field) {
  try {
    final data = jsonDecode((doc['data'] as String?) ?? '{}');
    if (data is Map && data[field] is List) {
      return (data[field] as List)
          .whereType<Map>()
          .map((e) => Map<String, dynamic>.from(e))
          .toList();
    }
  } catch (_) {}
  return [];
}

final _keys = <String, _KeyOps>{
  'subjects': _KeyOps(
    key: 'subjects',
    read: () => _listPayload(
        'subjects', Stores.I.subjects.subjects.map((s) => s.toJson()).toList()),
    apply: (doc) => Stores.I.subjects
        .replaceAll(_listFromDoc(doc, 'subjects').map(Subject.fromJson).toList()),
    isEmpty: () => Stores.I.subjects.subjects.isEmpty,
  ),
  'todos': _KeyOps(
    key: 'todos',
    read: () =>
        _listPayload('todos', Stores.I.todos.todos.map((t) => t.toJson()).toList()),
    apply: (doc) =>
        Stores.I.todos.replaceAll(_listFromDoc(doc, 'todos').map(Todo.fromJson).toList()),
    isEmpty: () => Stores.I.todos.todos.isEmpty,
  ),
  'homework': _KeyOps(
    key: 'homework',
    read: () => _listPayload(
        'homeworks', Stores.I.homework.homeworks.map((h) => h.toJson()).toList()),
    apply: (doc) => Stores.I.homework
        .replaceAll(_listFromDoc(doc, 'homeworks').map(Homework.fromJson).toList()),
    isEmpty: () => Stores.I.homework.homeworks.isEmpty,
  ),
  'timetable': _KeyOps(
    key: 'timetable',
    read: () => _listPayload(
        'entries', Stores.I.timetable.entries.map((e) => e.toJson()).toList()),
    apply: (doc) => Stores.I.timetable
        .replaceEntries(_listFromDoc(doc, 'entries').map(TimetableEntry.fromJson).toList()),
    isEmpty: () => Stores.I.timetable.entries.isEmpty,
  ),
  'grades': _KeyOps(
    key: 'grades',
    read: () => _listPayload(
        'entries', Stores.I.grades.entries.map((e) => e.toJson()).toList()),
    apply: (doc) => Stores.I.grades
        .replaceEntries(normalizeGradeEntries(_listFromDoc(doc, 'entries'))),
    isEmpty: () => Stores.I.grades.entries.isEmpty,
  ),
  'events': _KeyOps(
    key: 'events',
    read: () => _listPayload(
        'events', Stores.I.events.events.map((e) => e.toJson()).toList()),
    apply: (doc) => Stores.I.events
        .replaceAll(_listFromDoc(doc, 'events').map(StudyEvent.fromJson).toList()),
    isEmpty: () => Stores.I.events.events.isEmpty,
  ),
  'studyroom': _KeyOps(
    key: 'studyroom',
    read: () => {
          'data': jsonEncode({
            'selectedDocIds': _room.selectedDocIds,
            'deckIds': _room.decks.map((d) => d.id).toList(),
          }),
        },
    apply: (doc) {
      Object? parsed;
      try {
        parsed = jsonDecode((doc['data'] as String?) ?? '{}');
      } catch (_) {}
      final map = parsed is Map ? parsed : <String, dynamic>{};
      appliedDeckIds = ((map['deckIds'] as List?) ?? [])
          .map((e) => e as String)
          .toList();
      _room.replaceSelectedDocIds(((map['selectedDocIds'] as List?) ?? [])
          .map((e) => e as String)
          .toList());
    },
    isEmpty: () => false,
  ),
  'chats': _KeyOps(
    key: 'chats',
    collection: kChatsCollectionId,
    omitKey: true,
    read: () => {
          'messages': jsonEncode(
              _room.chat.take(MAX_CHAT_MESSAGES).map((m) => m.toJson()).toList()),
        },
    apply: (doc) {
      List<dynamic> list = const [];
      try {
        list = (jsonDecode((doc['messages'] as String?) ?? '[]') as List? ?? []);
      } catch (_) {}
      _room.replaceChat(
          list.whereType<Map>().map((e) => ChatMessage.fromJson(Map<String, dynamic>.from(e))).toList());
    },
    isEmpty: () => _room.chat.isEmpty,
  ),
};

String _collectionFor(String key) => _keys[key]!.collection ?? kSnapshotsCollectionId;

/// set while the sync engine writes remote data into the stores, so those
/// writes don't schedule pushes back to the cloud
bool applyingRemote = false;
bool subscribed = false;
List<String>? appliedDeckIds;

/// our own document writes, by Appwrite document id → the updatedAt we wrote;
/// realtime events with the same stamp are our own echoes, not remote changes
final _lastPushedAt = <String, int>{};
RealtimeSubscription? _realtimeSub;


/* ---------------- raw REST document calls ----------------
 * The Dart SDK's typed Document parser crashes on our collections (the new
 * API returns the row under a `data` key while our schema also has a string
 * attribute named `data` — "type 'String' is not a subtype of type
 * 'Map<String, dynamic>'"). The web SDK is dynamically typed and unaffected.
 * These calls mirror the digest function: plain REST + Appwrite JWT. */

Future<Map<String, String>> _restHeaders() async {
  final jwt = await getJwt();
  return {
    'X-Appwrite-Project': kAppwriteProjectId,
    if (jwt != null) 'X-Appwrite-JWT': jwt,
    'content-type': 'application/json',
  };
}

Uri _docUri(String collection, String docId) => Uri.parse(
    '$kAppwriteEndpoint/databases/$kDatabaseId/collections/$collection/documents/$docId');

/// GET a document → flat attribute map; null when it does not exist
Future<Map<String, dynamic>?> restGetDocument(String collection, String docId) async {
  final res = await http
      .get(_docUri(collection, docId), headers: await _restHeaders())
      .timeout(const Duration(seconds: 20));
  if (res.statusCode == 404) return null;
  if (res.statusCode != 200) {
    throw Exception('get $collection/$docId → ${res.statusCode}: ${res.body}');
  }
  return jsonDecode(res.body) as Map<String, dynamic>;
}

/// PATCH the document; creates it (owner-only permissions) when missing
Future<void> restUpsertDocument(String collection, String docId,
    Map<String, dynamic> attributes, String userId) async {
  final headers = await _restHeaders();
  var res = await http
      .patch(_docUri(collection, docId),
          headers: headers, body: jsonEncode({'data': attributes}))
      .timeout(const Duration(seconds: 20));
  if (res.statusCode == 404) {
    final createUri = Uri.parse(
        '$kAppwriteEndpoint/databases/$kDatabaseId/collections/$collection/documents');
    res = await http
        .post(createUri,
            headers: headers,
            body: jsonEncode({
              'documentId': docId,
              'data': attributes,
              'permissions': [
                'read("user:$userId")',
                'write("user:$userId")',
              ],
            }))
        .timeout(const Duration(seconds: 20));
  }
  if (res.statusCode >= 400) {
    throw Exception('upsert $collection/$docId → ${res.statusCode}: ${res.body}');
  }
}

Future<void> restDeleteDocument(String collection, String docId) async {
  await http
      .delete(_docUri(collection, docId), headers: await _restHeaders())
      .timeout(const Duration(seconds: 20)); // 404 is fine — already gone
}

Future<void> _upsertDocument(
    String collection, String docId, Map<String, dynamic> payload, String userId) async {
  await restUpsertDocument(collection, docId, payload['data'] as Map<String, dynamic>, userId);
}

/// best-effort "was this an offline failure?" — the change stays dirty either
/// way and is retried on the next sync; this only suppresses the error banner
bool _isOfflineError(Object e) {
  final s = e.toString();
  return s.contains('SocketException') ||
      s.contains('Failed host lookup') ||
      s.contains('Connection refused') ||
      s.contains('Network is unreachable') ||
      s.contains('Connection closed');
}

/// store keys where an empty local list must never overwrite non-empty cloud
/// data — protects against wiping the cloud from a device that never loaded
/// it (fresh install, offline reconcile, cleared storage). studyroom/chats
/// are exempt: clearing the chat or the selection is a legitimate empty sync.
const _guardedKeys = {'subjects', 'todos', 'homework', 'grades', 'events', 'timetable'};

/// true when [payload] holds an empty list while the cloud document still has
/// items — pushing it would destroy cloud data
Future<bool> _wouldWipeRemote(AuthUser user, String key, Map<String, dynamic> attributes) async {
  final localData = attributes['data'];
  if (localData is! String) return false;
  Object? local;
  try {
    local = jsonDecode(localData);
  } catch (_) {
    return false;
  }
  if (local is! Map || local.values.any((v) => v is! List || v.isNotEmpty)) return false;

  try {
    final docId = await snapshotDocId(user.id, _collectionFor(key), key);
    final doc = await restGetDocument(_collectionFor(key), docId);
    if (doc == null) return false;
    final remoteRaw = doc['data'];
    if (remoteRaw is! String) return false;
    final remote = jsonDecode(remoteRaw);
    if (remote is! Map) return false;
    return remote.values.any((v) => v is List && v.isNotEmpty);
  } catch (_) {
    return false; // remote unreadable → don't block the push
  }
}

Future<void> _pushSnapshot(AuthUser user, String key) async {
  final ops = _keys[key]!;
  final auth = Stores.I.auth;
  auth.setSyncing(true);
  try {
    final docId = await snapshotDocId(user.id, _collectionFor(key), key);
    // new Appwrite API: `data` is the attributes object (was: a JSON string
    // per attribute — the old flat shape now fails with "Unknown attribute")
    final updatedAt = DateTime.now().millisecondsSinceEpoch;
    final attributes = <String, dynamic>{
      'userId': user.id,
      ...ops.read(),
      'updatedAt': updatedAt,
    };
    if (!ops.omitKey) attributes['key'] = key;
    final payload = {'data': attributes};

    // baseline rule: a device that has never observed this store's cloud state
    // (fresh install, reconcile failed offline) must not push — it could wipe
    // data it has never seen. Dirty stays; the next reconcile sets the baseline
    // and this change is re-evaluated against the loaded cloud state.
    if (_guardedKeys.contains(key) && !Stores.I.syncMeta.isLoaded(key)) {
      auth.setSyncing(false);
      return;
    }

    if (_guardedKeys.contains(key) && await _wouldWipeRemote(user, key, attributes)) {
      // keep the cloud copy; clear the dirty flag so we don't retry forever —
      // the next reconcile will pull the cloud state back onto this device
      Stores.I.syncMeta.clearDirty(key);
      _scheduledAt.remove(key);
      auth.setSyncing(false);
      return;
    }

    await _upsertDocument(_collectionFor(key), docId, payload, user.id);
    _lastPushedAt[docId] = updatedAt; // own echo — ignore in realtime
    Stores.I.syncMeta.clearDirty(key);
    auth.setSynced(DateTime.now().millisecondsSinceEpoch);
  } catch (e) {
    // offline: the change stays dirty and uploads on the next sync
    auth.setSyncing(false);
    if (_isOfflineError(e)) return;
    auth.setSyncError(e.toString());
  }
}

/* ---------------- decks (one document per deck, fetched by id) ---------------- */

Deck _docToDeck(Map<String, dynamic> doc) => Deck(
      id: '${doc['deckId']}',
      title: (doc['title'] as String?) ?? 'Deck',
      documentIds: _decodeStringList(doc['documentIds'] as String?),
      createdAt: (doc['createdAt'] as num?)?.toInt() ?? 0,
      updatedAt: (doc['updatedAt'] as num?)?.toInt() ?? 0,
      cards: _decodeCards(doc['cards'] as String?),
    );

List<String> _decodeStringList(String? json) {
  try {
    return ((jsonDecode(json ?? '[]') as List?) ?? []).map((e) => e as String).toList();
  } catch (_) {
    return [];
  }
}

List<Flashcard> _decodeCards(String? json) {
  try {
    return ((jsonDecode(json ?? '[]') as List?) ?? [])
        .whereType<Map>()
        .map((e) => Flashcard.fromJson(Map<String, dynamic>.from(e)))
        .toList();
  } catch (_) {
    return [];
  }
}

Future<Deck?> _getDeckDoc(AuthUser user, String deckId) async {
  try {
    final docId = await snapshotDocId(user.id, kDecksCollectionId, deckId);
    final doc = await restGetDocument(kDecksCollectionId, docId);
    return doc == null ? null : _docToDeck(doc);
  } catch (_) {
    return null;
  }
}

Future<void> _pushDeck(AuthUser user, Deck deck) async {
  final docId = await snapshotDocId(user.id, kDecksCollectionId, deck.id);
  final updatedAt = DateTime.now().millisecondsSinceEpoch;
  await _upsertDocument(
    kDecksCollectionId,
    docId,
    {
      'data': {
        'userId': user.id,
        'deckId': deck.id,
        'title': deck.title,
        'documentIds': jsonEncode(deck.documentIds),
        'cards': jsonEncode(deck.cards.map((c) => c.toJson()).toList()),
        'createdAt': deck.createdAt,
        'updatedAt': updatedAt,
      },
    },
    user.id,
  );
  _lastPushedAt[docId] = updatedAt; // own echo — ignore in realtime
}

Future<void> _syncDecks(AuthUser user) async {
  final auth = Stores.I.auth;
  auth.setSyncing(true);
  try {
    final room = _room;
    final local = room.decks;

    // 1. deletions recorded while offline/pending → apply them in the cloud
    final deletedIds = [...room.deletedDeckIds];
    for (final id in deletedIds) {
      final docId = await snapshotDocId(user.id, kDecksCollectionId, id);
      try {
        await restDeleteDocument(kDecksCollectionId, docId);
      } catch (_) {
        // already gone
      }
    }
    if (deletedIds.isNotEmpty) room.clearDeletedDeckIds(deletedIds);

    // 2. push every local deck (few, small — upsert)
    for (final deck in local) {
      await _pushDeck(user, deck);
    }

    // 3. restore decks that the snapshot lists but this device doesn't have
    //    (fresh device / cleared storage). Decks deleted on another device are
    //    already gone from the cloud, so nothing is resurrected.
    for (final id in appliedDeckIds ?? const <String>[]) {
      if (local.any((d) => d.id == id) || deletedIds.contains(id)) continue;
      final remoteDeck = await _getDeckDoc(user, id);
      if (remoteDeck != null) {
        room.upsertDeck(remoteDeck);
      }
    }
    auth.setSynced(DateTime.now().millisecondsSinceEpoch);
  } catch (e) {
    auth.setSyncing(false);
    if (_isOfflineError(e)) return; // queued — pushes retry when back online
    auth.setSyncError(e.toString());
  }
}

/* ---------------- debounce drain ---------------- */

/// store key → moment the debounced push fires
final _scheduledAt = <String, DateTime>{};
Timer? _drainTimer;

void _ensureDrainLoop() {
  if (_drainTimer != null) return;
  _drainTimer = Timer.periodic(const Duration(milliseconds: 300), (_) {
    if (applyingRemote) return;
    final auth = Stores.I.auth;
    final user = auth.user;
    if (auth.status != SyncStatus.signedIn || user == null) return;
    final now = DateTime.now();
    final due = <String>[];
    _scheduledAt.removeWhere((key, at) {
      if (now.isBefore(at)) return false;
      due.add(key);
      return true;
    });
    for (final key in due) {
      if (key == 'decks') {
        _syncDecks(user);
      } else if (_keys.containsKey(key)) {
        _pushSnapshot(user, key);
      }
    }
  });
}

void _schedule(String key) {
  if (applyingRemote) return;
  final auth = Stores.I.auth;
  if (auth.status != SyncStatus.signedIn || auth.user == null) return;
  Stores.I.syncMeta.markDirty(key, DateTime.now().millisecondsSinceEpoch);
  _scheduledAt[key] = DateTime.now().add(const Duration(milliseconds: PUSH_DEBOUNCE_MS));
}

void _scheduleDecks() => _schedule('decks');

/* ---------------- init / auth actions ---------------- */

void _subscribeStores() {
  if (subscribed) return;
  subscribed = true;

  Stores.I.subjects.addListener(() => _schedule('subjects'));
  Stores.I.todos.addListener(() => _schedule('todos'));
  Stores.I.homework.addListener(() => _schedule('homework'));
  Stores.I.grades.addListener(() => _schedule('grades'));
  Stores.I.events.addListener(() => _schedule('events'));
  Stores.I.timetable.addListener(() => _schedule('timetable'));
  _room.addListener(() => _schedule('studyroom'));
  // decks live in the study-room store too, but sync as their own documents
  _room.addListener(_scheduleDecks);
  _ensureDrainLoop();
}

/// observes one key's cloud state and reconciles it — returns true when the
/// cloud was actually observed (false = network failure, retry worthwhile)
Future<bool> _observeAndReconcileKey(AuthUser user, String key) async {
  final ops = _keys[key]!;
  Map<String, dynamic>? remote;
  var observedCloud = false; // 404 (empty cloud) counts as observed
  try {
    final docId = await snapshotDocId(user.id, _collectionFor(key), key);
    remote = await restGetDocument(_collectionFor(key), docId);
    observedCloud = true;
  } on AppwriteException catch (e) {
    remote = null;
    observedCloud = e.code == 404;
    if (e.code != 404) debugPrint('[sync] observe $key failed: ${e.type} ${e.code} ${e.message}');
  } catch (e) {
    remote = null;
    observedCloud = false; // offline etc. — cloud state unknown
    debugPrint('[sync] observe $key failed: $e');
  }
  if (observedCloud) Stores.I.syncMeta.markLoaded(key);
  debugPrint('[sync] observe $key → observed:$observedCloud remote:${remote != null}');

  // …unless this device holds local edits that never made it up
  final dirtyAt = Stores.I.syncMeta.dirtyAt[key];
  final remoteUpdatedAt = (remote?['updatedAt'] as num?)?.toInt() ?? 0;
  final hasUnsyncedEdits =
      dirtyAt != null && (remote == null || dirtyAt > remoteUpdatedAt);

  if (remote != null && !hasUnsyncedEdits) {
    ops.apply(remote);
    Stores.I.syncMeta.clearDirty(key);
    return true;
  }
  if (remote == null && ops.isEmpty()) return true;
  // write afterwards: unsynced edits, or fresh local data with no snapshot yet
  await _pushSnapshot(user, key);
  return true;
}

/// serializes reconciles — startup, resume and "Sync now" must never race
/// each other (a concurrent run flips `applyingRemote` mid-loop and silently
/// aborts the other run's key loop)
Future<void> _reconcileInFlight = Future.value();
Timer? _retryTimer;

/// while the sync is incomplete, keep retrying every 30 s — flaky-DNS windows
/// come and go, and the app should heal on its own without user action
void _scheduleRetryLoop() {
  _retryTimer?.cancel();
  _retryTimer = Timer.periodic(const Duration(seconds: 30), (timer) {
    final auth = Stores.I.auth;
    if (auth.status != SyncStatus.signedIn || auth.syncError == null) {
      timer.cancel();
      return;
    }
    final user = auth.user;
    if (user != null) resync();
    if (timer.tick > 120) timer.cancel(); // give up after ~1 h of failures
  });
}
Future<void> reconcile(AuthUser user) {
  return _reconcileInFlight = _reconcileInFlight
      .then((_) => _runReconcile(user))
      .whenComplete(() => _reconcileInFlight = Future.value());
}

Future<void> _runReconcile(AuthUser user) async {
  applyingRemote = true;
  final auth = Stores.I.auth;
  try {
    // flaky networks kill individual requests — retry every key that wasn't
    // observed until all stores are covered or the attempts run out
    var remaining = _keys.keys.toList();
    for (var attempt = 0; attempt < 3 && remaining.isNotEmpty; attempt++) {
      if (attempt > 0) await Future.delayed(const Duration(milliseconds: 1500));
      final failed = <String>[];
      for (final key in remaining) {
        if (!await _observeAndReconcileKey(user, key)) failed.add(key);
      }
      remaining = failed;
    }

    if (remaining.isNotEmpty) {
      auth.setSyncError(
          'sync incomplete — ${remaining.join(", ")} could not be loaded; check your connection and tap Sync now');
      _scheduleRetryLoop();
      return;
    }

    // decks reconcile: fresh device loads everything, otherwise merge per deck
    await _syncDecks(user);

    auth.setSynced(DateTime.now().millisecondsSinceEpoch);
  } catch (e) {
    auth.setSyncError(e.toString());
  } finally {
    applyingRemote = false;
  }
}

/* ---------------- session persistence ----------------
 * The Dart SDK's cookie jar keeps the session in memory only on this setup —
 * without this, every cold app start is signed out and nothing ever syncs.
 * The secret is device-local (same trust level as the browser cookie). */

const _kSessionSecretKey = 'semester.appwritesession';
const _kUserIdKey = 'semester.appwriteuserid';
const _kUserEmailKey = 'semester.appwriteuseremail';

/// signed-in identity, persisted alongside the session secret so the app can
/// start optimistically even before the network confirms the session
String? _storedUserId;
String? _storedUserEmail;

Future<void> _persistUserId(AuthUser user) async {
  final prefs = await SharedPreferences.getInstance();
  await prefs.setString(_kUserIdKey, user.id);
  await prefs.setString(_kUserEmailKey, user.email);
  _storedUserId = user.id;
  _storedUserEmail = user.email;
}

Future<void> _persistSessionSecret(String secret) async {
  final prefs = await SharedPreferences.getInstance();
  await prefs.setString(_kSessionSecretKey, secret);
}

Future<void> _clearSessionSecret() async {
  final prefs = await SharedPreferences.getInstance();
  await prefs.remove(_kSessionSecretKey);
}

/// restores the Appwrite session (if any) and reconciles — run once on startup
Future<void> initSync() async {
  final auth = Stores.I.auth;
  if (!appwriteConfigured) {
    auth.setAuth(null, SyncStatus.unconfigured);
    return;
  }
  auth.setAuth(null, SyncStatus.loading);

  // restore the persisted session (setSession adds the X-Appwrite-Session header)
  final prefs = await SharedPreferences.getInstance();
  final savedSecret = prefs.getString(_kSessionSecretKey);
  _storedUserId = prefs.getString(_kUserIdKey);
  _storedUserEmail = prefs.getString(_kUserEmailKey);
  debugPrint('[sync] init: stored session secret present: ${savedSecret != null}');
  if (savedSecret != null && savedSecret.isNotEmpty) {
    appwriteClient.setSession(savedSecret);
  }

  // distinguish "no valid session" (401) from network failures — a flaky DNS
  // window at startup must not sign the app out
  AuthUser? user;
  Object? lastError;
  for (var attempt = 0; attempt < 4; attempt++) {
    try {
      user = await getCurrentUserStrict();
      lastError = null;
      break;
    } on AppwriteException catch (e) {
      if (e.code == 401) {
        lastError = null; // genuinely no valid session
        break;
      }
      lastError = e;
    } catch (e) {
      lastError = e;
    }
    if (attempt < 3) {
      await Future.delayed(Duration(seconds: 3 * (attempt + 1)));
    }
  }

  if (user == null && lastError != null && (savedSecret?.isNotEmpty ?? false)) {
    // network failed with a stored session — stay signed in optimistically
    // using the persisted identity; reconcile retries will surface errors
    debugPrint('[sync] init: network failed, optimistic sign-in');
    user = AuthUser(_storedUserId ?? '', _storedUserEmail ?? '', _storedUserEmail ?? '');
  }

  if (user == null) {
    auth.setAuth(null, SyncStatus.signedOut);
    return;
  }
  if (_storedUserId == null) {
    await _persistUserId(user);
  }
  auth.setAuth(user, SyncStatus.signedIn);
  _subscribeStores();
  _startRealtime(user);
  await reconcile(user);

  // flaky networks: if the first reconcile failed (DNS, WiFi handoff…), keep
  // retrying — an empty-looking app that never pulls is worse than a delay
  for (var attempt = 0;
      attempt < 4 && auth.status == SyncStatus.signedIn && auth.syncError != null;
      attempt++) {
    await Future.delayed(const Duration(seconds: 10));
    if (auth.status != SyncStatus.signedIn) return;
    await reconcile(user);
  }
}

Future<void> signIn(String email, String password) async {
  final session = await account.createEmailPasswordSession(email: email, password: password);
  if (session.secret.isNotEmpty) {
    await _persistSessionSecret(session.secret);
    appwriteClient.setSession(session.secret);
  }
  final user = await getCurrentUser();
  if (user == null) {
    // belt & suspenders failed — the session exists but the profile doesn't load
    Stores.I.auth.setAuth(AuthUser('', email, email), SyncStatus.signedIn);
    _subscribeStores();
    return;
  }
  await _persistUserId(user);
  Stores.I.auth.setAuth(user, SyncStatus.signedIn);
  _subscribeStores();
  _startRealtime(user);
  await reconcile(user);
}

Future<void> signUp(String name, String email, String password) async {
  await account.create(userId: ID.unique(), email: email, password: password, name: name);
  await signIn(email, password);
}

/// signs out; local data deliberately stays on the device
Future<void> signOut() async {
  try {
    await account.deleteSession(sessionId: 'current');
  } catch (_) {}
  _stopRealtime();
  _lastPushedAt.clear();
  await _clearSessionSecret();
  final p2 = await SharedPreferences.getInstance();
  await p2.remove(_kUserIdKey);
  await p2.remove(_kUserEmailKey);
  _storedUserId = null;
  _storedUserEmail = null;
  invalidateJwtCache();
  Stores.I.auth.setAuth(null, SyncStatus.signedOut);
}

/* ---------------- realtime (cross-device pulls) ---------------- */

void _startRealtime(AuthUser user) {
  _stopRealtime();
  _realtimeSub = Realtime(appwriteClient).subscribe([
    'databases.$kDatabaseId.collections.$kSnapshotsCollectionId.documents',
    'databases.$kDatabaseId.collections.$kChatsCollectionId.documents',
    'databases.$kDatabaseId.collections.$kDecksCollectionId.documents',
  ]);
  _realtimeSub!.stream.listen(
    (msg) {
      try {
        _onRealtimeEvent(msg);
      } catch (_) {
        // a malformed event must never crash the app
      }
    },
    onError: (_) {},
  );
}

void _stopRealtime() {
  _realtimeSub?.close();
  _realtimeSub = null;
}

void _onRealtimeEvent(RealtimeMessage msg) {
  final auth = Stores.I.auth;
  final user = auth.user;
  if (auth.status != SyncStatus.signedIn || user == null) return;
  final doc = msg.payload;
  if (doc['userId'] is String && doc['userId'] != user.id) return; // another user's doc

  // deletions only matter for decks (snapshots are upserted, never deleted)
  if (msg.events.any((e) => e.endsWith('.delete'))) {
    final deckId = doc['deckId'];
    if (deckId is String && doc['userId'] == user.id) {
      applyingRemote = true;
      _room.removeDeckSilently(deckId);
      applyingRemote = false;
    }
    return;
  }

  // ignore echoes of our own writes
  final docId = doc[r'$id'] as String?;
  final updatedAt = (doc['updatedAt'] as num?)?.toInt() ?? 0;
  if (docId != null && _lastPushedAt[docId] == updatedAt) return;

  applyingRemote = true;
  try {
    final key = doc['key'] as String?;
    if (key != null && _keys.containsKey(key)) {
      Stores.I.syncMeta.markLoaded(key); // the event IS the cloud state
      _keys[key]!.apply(doc);
    } else if (doc['deckId'] is String) {
      _room.upsertDeck(_docToDeck(doc));
    } else if (doc['messages'] is String) {
      Stores.I.syncMeta.markLoaded('chats');
      _keys['chats']!.apply(doc);
    }
  } finally {
    applyingRemote = false;
  }
}

/// pulls the cloud state again — called when the app returns to the foreground,
/// so changes missed while the process was suspended are not lost
Future<void> resync() async {
  final auth = Stores.I.auth;
  final user = auth.user;
  if (auth.status != SyncStatus.signedIn || user == null) return;
  if (applyingRemote) return;
  await reconcile(user);
}

/// manual push of everything (used by the "Sync now" button)
/// "Sync now" — full round-trip: pull the cloud state (reconcile) and push
/// whatever is still unsynced locally. Also the manual retry for a reconcile
/// that failed on a flaky connection.
Future<void> syncNow() async {
  final auth = Stores.I.auth;
  final user = auth.user;
  if (auth.status != SyncStatus.signedIn || user == null) return;
  await reconcile(user);
}

/// Mirrors the fetched substitute plan (plan ONLY — portal credentials never
/// leave this device) into a `portal` snapshot document, so the daily-digest
/// Appwrite function can respect cancellations and substitutions.
Future<void> mirrorPortal(PortalPlan plan) async {
  final auth = Stores.I.auth;
  final user = auth.user;
  if (auth.status != SyncStatus.signedIn || user == null) return;
  try {
    final docId = await snapshotDocId(user.id, kSnapshotsCollectionId, 'portal');
    await _upsertDocument(
      kSnapshotsCollectionId,
      docId,
      {
        'userId': user.id,
        'key': 'portal',
        'data': jsonEncode({
          'days': plan.days.map((d) => d.toJson()).toList(),
          'courses': plan.courses,
        }),
        'updatedAt': DateTime.now().millisecondsSinceEpoch,
      },
      user.id,
    );
  } catch (_) {
    // mirroring is best-effort — the digest just falls back to plain classes
  }
}
