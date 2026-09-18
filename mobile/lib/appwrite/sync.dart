import 'dart:async';
import 'dart:convert';

import 'package:appwrite/appwrite.dart';
import 'package:crypto/crypto.dart';

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

Future<void> _upsertDocument(
    String collection, String docId, Map<String, dynamic> payload, String userId) async {
  final permissions = [
    Permission.read(Role.user(userId)),
    Permission.write(Role.user(userId)),
  ];
  try {
    await databases.updateDocument(
      databaseId: kDatabaseId,
      collectionId: collection,
      documentId: docId,
      data: payload,
    );
  } catch (_) {
    await databases.createDocument(
      databaseId: kDatabaseId,
      collectionId: collection,
      documentId: docId,
      data: payload,
      permissions: permissions,
    );
  }
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
    final doc = await databases.getDocument(
      databaseId: kDatabaseId,
      collectionId: _collectionFor(key),
      documentId: docId,
    );
    final remoteRaw = doc.data['data'];
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
    final attributes = <String, dynamic>{
      'userId': user.id,
      ...ops.read(),
      'updatedAt': DateTime.now().millisecondsSinceEpoch,
    };
    if (!ops.omitKey) attributes['key'] = key;
    final payload = {'data': attributes};

    if (_guardedKeys.contains(key) && await _wouldWipeRemote(user, key, attributes)) {
      // keep the cloud copy; clear the dirty flag so we don't retry forever —
      // the next reconcile will pull the cloud state back onto this device
      Stores.I.syncMeta.clearDirty(key);
      _scheduledAt.remove(key);
      auth.setSyncing(false);
      return;
    }

    await _upsertDocument(_collectionFor(key), docId, payload, user.id);
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
    final doc = await databases.getDocument(
      databaseId: kDatabaseId,
      collectionId: kDecksCollectionId,
      documentId: docId,
    );
    return _docToDeck(doc.data);
  } catch (_) {
    return null;
  }
}

Future<void> _pushDeck(AuthUser user, Deck deck) async {
  final docId = await snapshotDocId(user.id, kDecksCollectionId, deck.id);
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
        'updatedAt': DateTime.now().millisecondsSinceEpoch,
      },
    },
    user.id,
  );
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
        await databases.deleteDocument(
          databaseId: kDatabaseId,
          collectionId: kDecksCollectionId,
          documentId: docId,
        );
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

Future<void> reconcile(AuthUser user) async {
  applyingRemote = true;
  final auth = Stores.I.auth;
  try {
    for (final entry in _keys.entries) {
      final ops = entry.value;
      // load from the db first…
      Map<String, dynamic>? remote;
      try {
        final docId = await snapshotDocId(user.id, _collectionFor(entry.key), entry.key);
        final doc = await databases.getDocument(
          databaseId: kDatabaseId,
          collectionId: _collectionFor(entry.key),
          documentId: docId,
        );
        remote = doc.data;
      } catch (_) {
        remote = null;
      }

      // …unless this device holds local edits that never made it up
      final dirtyAt = Stores.I.syncMeta.dirtyAt[entry.key];
      final remoteUpdatedAt = (remote?['updatedAt'] as num?)?.toInt() ?? 0;
      final hasUnsyncedEdits =
          dirtyAt != null && (remote == null || dirtyAt > remoteUpdatedAt);

      if (remote != null && !hasUnsyncedEdits) {
        ops.apply(remote);
        Stores.I.syncMeta.clearDirty(entry.key);
        continue;
      }
      if (remote == null && ops.isEmpty()) continue;
      // write afterwards: unsynced edits, or fresh local data with no snapshot yet
      await _pushSnapshot(user, entry.key);
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

/// restores the Appwrite session (if any) and reconciles — run once on startup
Future<void> initSync() async {
  final auth = Stores.I.auth;
  if (!appwriteConfigured) {
    auth.setAuth(null, SyncStatus.unconfigured);
    return;
  }
  auth.setAuth(null, SyncStatus.loading);

  final user = await getCurrentUser();
  if (user == null) {
    auth.setAuth(null, SyncStatus.signedOut);
    return;
  }
  auth.setAuth(user, SyncStatus.signedIn);
  _subscribeStores();
  await reconcile(user);
}

Future<void> signIn(String email, String password) async {
  await account.createEmailPasswordSession(email: email, password: password);
  final user = await getCurrentUser();
  if (user == null) {
    // belt & suspenders failed — the session exists but the profile doesn't load
    Stores.I.auth.setAuth(AuthUser('', email, email), SyncStatus.signedIn);
    _subscribeStores();
    return;
  }
  Stores.I.auth.setAuth(user, SyncStatus.signedIn);
  _subscribeStores();
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
  invalidateJwtCache();
  Stores.I.auth.setAuth(null, SyncStatus.signedOut);
}

/// manual push of everything (used by the "Sync now" button)
Future<void> syncNow() async {
  final auth = Stores.I.auth;
  final user = auth.user;
  if (auth.status != SyncStatus.signedIn || user == null) return;
  for (final key in _keys.keys) {
    await _pushSnapshot(user, key);
  }
  await _syncDecks(user);
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
