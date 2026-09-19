import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';

import 'package:appwrite/appwrite.dart';
import 'package:crypto/crypto.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

import '../models/types.dart';
import '../stores/auth_store.dart';
import '../stores/portal_store.dart';
import '../stores/registry.dart';
import '../stores/studyroom_store.dart';
import '../stores/timetable_store.dart';
import '../utils/utils.dart';
import 'client.dart';

/// Sync model — one structured layer:
///
/// EVERYTHING syncs as rows in Appwrite tables (subjects · todos · homeworks ·
/// grades · events · timetable_entries · chat_messages · decks · flashcards ·
/// study_selection · portal_entries · portal_courses). One row per entity,
/// rowId = the entity id (or a content hash for id-less entities):
///
///   push  = diff the local store against the last-synced row digests and
///           upsert changed rows / soft-delete (deleted=true) removed rows
///   pull  = fetch all rows of the user and merge — rows with pending local
///           edits win, remote rows otherwise, deleted rows remove locally
///   realtime = single-row events through the same merge
///
/// A device can therefore never wipe data it hasn't seen: with no local
/// entities and no stored digests the push phase has nothing to do, so a
/// fresh device's first sync is a pure pull.

const PUSH_DEBOUNCE_MS = 1200;
const MAX_CHAT_MESSAGES = 120;

StudyroomStore get _room => Stores.I.studyroom;
PortalStore get _portal => Stores.I.portal;

/* ---------------- structured row collections ----------------
 * subjects/todos/homeworks/grades/events live as one row per entity in
 * Appwrite tables (rowId = the entity UUID, deleted = tombstone). */

final tablesDB = TablesDB(appwriteClient);

const _rowTables = {
  'subjects': 'subjects',
  'todos': 'todos',
  'homework': 'homeworks',
  'grades': 'grades',
  'events': 'events',
  'timetable': 'timetable_entries',
  'chat': 'chat_messages',
  'decks': 'decks',
  'flashcards': 'flashcards',
  'selection': 'study_selection',
  'portalEntries': 'portal_entries',
  'portalCourses': 'portal_courses',
};

String _rowDigestOf(Map<String, dynamic> row) {
  final canonical = Map<String, dynamic>.from(row)
    ..remove('userId')
    ..remove('deleted')
    // server fields ($createdAt/$updatedAt/…) leak into Row.data when the
    // response is flat — they change on every write and would break digests
    ..removeWhere((k, _) => k.startsWith(r'$'));
  return sha256.convert(utf8.encode(jsonEncode(canonical))).toString();
}

/// adapter: how a row store maps between entities and table rows
/// type-erased on purpose: the list holds every adapter as the same class,
/// so the entity params are dynamic and dispatch happens inside the closures
class _RowAdapter {
  final String storeKey;
  final String table;
  final List<dynamic> Function() list;
  final String Function(dynamic entity) idOf;
  final Map<String, dynamic> Function(dynamic entity) toRow;
  final dynamic Function(String id, Map<String, dynamic> row) fromRow;
  final void Function(dynamic entity) upsert;
  final void Function(String id) remove;

  const _RowAdapter({
    required this.storeKey,
    required this.table,
    required this.list,
    required this.idOf,
    required this.toRow,
    required this.fromRow,
    required this.upsert,
    required this.remove,
  });
}

final _rowAdapters = <_RowAdapter>[
  _RowAdapter(
    storeKey: 'subjects',
    table: 'subjects',
    list: () => Stores.I.subjects.subjects,
    idOf: (s) => s.id,
    toRow: (s) => {'name': s.name, 'color': s.color},
    fromRow: (id, row) => Subject(
      id: id,
      name: (row['name'] as String?) ?? '',
      color: (row['color'] as String?) ?? '#3E6B4F',
    ),
    upsert: (s) => Stores.I.subjects.upsertOne(s),
    remove: (id) => Stores.I.subjects.removeOne(id),
  ),
  _RowAdapter(
    storeKey: 'todos',
    table: 'todos',
    list: () => Stores.I.todos.todos,
    idOf: (t) => t.id,
    toRow: (t) => {
      'title': t.title,
      'notes': t.notes ?? '',
      'due': t.due ?? '',
      'priority': _enumName(t.priority),
      'subjectId': t.subjectId ?? '',
      'done': t.done,
      'createdAt': t.createdAt,
    },
    fromRow: (id, row) => Todo(
      id: id,
      title: (row['title'] as String?) ?? '',
      notes: (row['notes'] as String?)?.isEmpty == false
          ? row['notes'] as String
          : null,
      due: (row['due'] as String?)?.isEmpty == false
          ? row['due'] as String
          : null,
      priority: priorityFromJson(row['priority'] as String?),
      subjectId: (row['subjectId'] as String?)?.isEmpty == false
          ? row['subjectId'] as String
          : null,
      done: row['done'] == true,
      createdAt: (row['createdAt'] as num?)?.toInt() ?? 0,
    ),
    upsert: (t) => Stores.I.todos.upsertOne(t),
    remove: (id) => Stores.I.todos.removeOne(id),
  ),
  _RowAdapter(
    storeKey: 'homework',
    table: 'homeworks',
    list: () => Stores.I.homework.homeworks,
    idOf: (h) => h.id,
    toRow: (h) => {
      'title': h.title,
      'notes': h.notes ?? '',
      'due': h.due ?? '',
      'priority': _enumName(h.priority),
      'subjectId': h.subjectId ?? '',
      'done': h.done,
      'createdAt': h.createdAt,
    },
    fromRow: (id, row) => Homework(
      id: id,
      title: (row['title'] as String?) ?? '',
      notes: (row['notes'] as String?)?.isEmpty == false
          ? row['notes'] as String
          : null,
      due: (row['due'] as String?)?.isEmpty == false
          ? row['due'] as String
          : null,
      priority: priorityFromJson(row['priority'] as String?),
      subjectId: (row['subjectId'] as String?)?.isEmpty == false
          ? row['subjectId'] as String
          : null,
      done: row['done'] == true,
      createdAt: (row['createdAt'] as num?)?.toInt() ?? 0,
    ),
    upsert: (h) => Stores.I.homework.upsertOne(h),
    remove: (id) => Stores.I.homework.removeOne(id),
  ),
  _RowAdapter(
    storeKey: 'grades',
    table: 'grades',
    list: () => Stores.I.grades.entries,
    idOf: (g) => g.id,
    toRow: (g) => {
      'subjectId': g.subjectId ?? '',
      'title': g.title,
      'points': g.points.toInt(),
      'weight': g.weight.toDouble(),
      'date': g.date ?? '',
    },
    fromRow: (id, row) => GradeEntry(
      id: id,
      subjectId: (row['subjectId'] as String?)?.isEmpty == false
          ? row['subjectId'] as String
          : null,
      title: (row['title'] as String?) ?? '',
      points: (row['points'] as num?)?.toInt() ?? 0,
      weight: (row['weight'] as num?) ?? 1,
      date: (row['date'] as String?)?.isEmpty == false
          ? row['date'] as String
          : null,
    ),
    upsert: (g) => Stores.I.grades.upsertOne(g),
    remove: (id) => Stores.I.grades.removeOne(id),
  ),
  _RowAdapter(
    storeKey: 'events',
    table: 'events',
    list: () => Stores.I.events.events,
    idOf: (e) => e.id,
    toRow: (e) => {
      'title': e.title,
      'date': e.date,
      'time': e.time ?? '',
      'type': _enumName(e.type),
      'subjectId': e.subjectId ?? '',
      'notes': e.notes ?? '',
    },
    fromRow: (id, row) => StudyEvent(
      id: id,
      title: (row['title'] as String?) ?? '',
      date: (row['date'] as String?) ?? '',
      time: (row['time'] as String?)?.isEmpty == false
          ? row['time'] as String
          : null,
      type: eventTypeFromJson(row['type'] as String?),
      subjectId: (row['subjectId'] as String?)?.isEmpty == false
          ? row['subjectId'] as String
          : null,
      notes: (row['notes'] as String?)?.isEmpty == false
          ? row['notes'] as String
          : null,
    ),
    upsert: (e) => Stores.I.events.upsertOne(e),
    remove: (id) => Stores.I.events.removeOne(id),
  ),
  _RowAdapter(
    storeKey: 'timetable',
    table: 'timetable_entries',
    // entries have no natural id — the row id is the content hash
    list: () => Stores.I.timetable.entries
        .map((e) => {...e.toJson(), 'id': timetableRowId(e)})
        .toList(),
    idOf: (e) => e['id'] as String,
    toRow: (e) => {
      'day': e['day'],
      'period': e['period'],
      'time': e['time'] ?? '',
      'subject': e['subject'],
      'teacher': e['teacher'] ?? '',
      'room': e['room'] ?? '',
    },
    fromRow: (id, row) => {
      // map-based adapter: toRow()/upsert() below read map keys, and the pull
      // phase feeds fromRow()'s result straight back into both
      'day': (row['day'] as String?) ?? 'Mon',
      'period': (row['period'] as num?)?.toInt() ?? 1,
      'time': (row['time'] as String?)?.isEmpty == false ? row['time'] as String : null,
      'subject': (row['subject'] as String?) ?? '',
      'teacher': (row['teacher'] as String?)?.isEmpty == false ? row['teacher'] as String : null,
      'room': (row['room'] as String?)?.isEmpty == false ? row['room'] as String : null,
    },
    upsert: (e) => Stores.I.timetable.upsertEntry(
      TimetableEntry.fromJson(Map<String, dynamic>.from(e as Map)),
    ),
    remove: (id) => Stores.I.timetable.removeEntry(id),
  ),
  _RowAdapter(
    storeKey: 'chat',
    table: 'chat_messages',
    list: () => _room.chat
        .where((m) => m.id != null)
        .take(MAX_CHAT_MESSAGES)
        .map((m) => {...m.toJson(), 'id': m.id!})
        .toList(),
    idOf: (m) => m['id'] as String,
    toRow: (m) => {
      'role': m['role'],
      'content': m['content'],
      'sources': jsonEncode(m['sources'] ?? <String>[]),
      'sentAt': m['sentAt'] ?? 0,
    },
    fromRow: (id, row) {
      final sourcesJson = row['sources'] as String?;
      final sources = sourcesJson == null
          ? null
          : ((jsonDecode(sourcesJson) as List?) ?? []).whereType<String>().toList();
      return ChatMessage(
        id: id,
        role: (row['role'] as String?) == 'user' ? 'user' : 'assistant',
        content: (row['content'] as String?) ?? '',
        sources: sources,
        sentAt: (row['sentAt'] as num?)?.toInt(),
      );
    },
    upsert: (m) => _room.upsertChatMessage(m),
    remove: (id) => _room.removeChatMessage(id),
  ),
  _RowAdapter(
    storeKey: 'decks',
    table: 'decks',
    list: () => _room.decks,
    idOf: (d) => d.id,
    toRow: (d) => {
      'title': d.title,
      'documentIds': jsonEncode(d.documentIds),
      'createdAt': d.createdAt,
      'updatedAt': d.updatedAt,
    },
    fromRow: (id, row) => Deck(
      id: id,
      title: (row['title'] as String?) ?? 'Deck',
      documentIds: ((jsonDecode((row['documentIds'] as String?) ?? '[]') as List?) ?? [])
          .whereType<String>()
          .toList(),
      createdAt: (row['createdAt'] as num?)?.toInt() ?? 0,
      updatedAt: (row['updatedAt'] as num?)?.toInt() ?? 0,
      cards: const [],
    ),
    upsert: (d) {
      // rows carry no cards — keep the locally known ones when merging
      final existing = _room.decks.where((x) => x.id == (d as Deck).id).firstOrNull;
      _room.upsertDeck(existing == null ? d : d.withCards(existing.cards));
    },
    remove: (id) => _room.removeDeckSilently(id),
  ),
  _RowAdapter(
    storeKey: 'flashcards',
    table: 'flashcards',
    list: () => _room.decks
        .expand((d) => d.cards.map((c) => {...c.toJson(), 'deckId': d.id}))
        .toList(),
    idOf: (c) => c['id'] as String,
    toRow: (c) => {'deckId': c['deckId'], 'front': c['front'], 'back': c['back'] ?? ''},
    fromRow: (id, row) => {
      'id': id,
      'deckId': (row['deckId'] as String?) ?? '',
      'front': (row['front'] as String?) ?? '',
      'back': (row['back'] as String?) ?? '',
    },
    upsert: (c) {
      final map = Map<String, dynamic>.from(c as Map);
      // a card can arrive before its deck row — keep it attachable
      if (!_room.decks.any((d) => d.id == map['deckId'])) {
        _room.upsertDeck(Deck(
          id: map['deckId'] as String,
          title: 'Deck',
          documentIds: const [],
          createdAt: DateTime.now().millisecondsSinceEpoch,
          updatedAt: DateTime.now().millisecondsSinceEpoch,
          cards: const [],
        ));
      }
      _room.upsertCard(
        map['deckId'] as String,
        Flashcard(id: map['id'] as String, front: map['front'] as String, back: map['back'] as String),
      );
    },
    remove: (id) {
      final deck = _room.decks.where((d) => d.cards.any((c) => c.id == id)).firstOrNull;
      if (deck != null) _room.removeCard(deck.id, id);
    },
  ),
  _RowAdapter(
    storeKey: 'selection',
    table: 'study_selection',
    list: () => _room.selectedDocIds
        .map((d) => {'id': hashId('sel|$d'), 'documentId': d})
        .toList(),
    idOf: (s) => s['id'] as String,
    toRow: (s) => {'documentId': s['documentId']},
    fromRow: (id, row) => {'documentId': (row['documentId'] as String?) ?? ''},
    upsert: (s) => _room.upsertSelection(s['documentId'] as String),
    remove: (id) {
      final docId = _room.selectedDocIds.where((d) => hashId('sel|$d') == id).firstOrNull;
      if (docId != null) _room.removeSelection(docId);
    },
  ),
  _RowAdapter(
    storeKey: 'portalEntries',
    table: 'portal_entries',
    list: () => (_portal.data?.days ?? const <PortalDay>[])
        .expand((day) => day.entries.map((e) => {...e.toJson(), 'id': portalSubRowId(e)}))
        .toList(),
    idOf: (e) => e['id'] as String,
    toRow: (e) => {
      'date': e['date'],
      'weekday': e['weekday'] ?? '',
      'period': e['period'] ?? '',
      'course': e['course'] ?? '',
      'courseOld': e['courseOld'] ?? '',
      'substitute': e['substitute'] ?? '',
      'room': e['room'] ?? '',
      'info': e['info'] ?? '',
      'cancelled': e['cancelled'] ?? false,
    },
    fromRow: (id, row) => PortalSub(
      date: (row['date'] as String?) ?? '',
      weekday: (row['weekday'] as String?) ?? '',
      period: (row['period'] as String?) ?? '',
      course: (row['course'] as String?) ?? '',
      courseOld: (row['courseOld'] as String?)?.isEmpty == false ? row['courseOld'] as String : null,
      substitute: (row['substitute'] as String?) ?? '',
      room: (row['room'] as String?) ?? '',
      info: (row['info'] as String?) ?? '',
      cancelled: row['cancelled'] == true,
    ),
    upsert: (e) => _portal.upsertSub(e),
    remove: (id) => _portal.removeSub(id),
  ),
  _RowAdapter(
    storeKey: 'portalCourses',
    table: 'portal_courses',
    list: () => (_portal.data?.courses ?? const <String>[])
        .map((c) => {'id': portalCourseRowId(c), 'course': c})
        .toList(),
    idOf: (c) => c['id'] as String,
    toRow: (c) => {'course': c['course']},
    fromRow: (id, row) => {'course': (row['course'] as String?) ?? ''},
    upsert: (c) => _portal.upsertCourse(c['course'] as String),
    remove: (id) {
      final course = _portal.data?.courses.where((c) => portalCourseRowId(c) == id).firstOrNull;
      if (course != null) _portal.removeCourse(id);
    },
  ),
];

final rowPushTimers = <String, Timer>{};

/// debounced row sync (called from store listeners)
void scheduleRowSync(String storeKey) {
  if (applyingRemote) return;
  final auth = Stores.I.auth;
  if (auth.status != SyncStatus.signedIn || auth.user == null) return;
  rowPushTimers[storeKey]?.cancel();
  rowPushTimers[storeKey] = Timer(
    const Duration(milliseconds: PUSH_DEBOUNCE_MS),
    () {
      final user = Stores.I.auth.user;
      if (user != null && Stores.I.auth.status == SyncStatus.signedIn) {
        syncRowStore(user, storeKey);
      }
    },
  );
}

/// enum → name string that survives dynamic dispatch: enum.name is an
/// extension (invisible to `dynamic` receivers on the phone's Dart 2.x
/// runtime → NoSuchMethodError), while toString() is a real instance method
String _enumName(Object? value) => value.toString().split('.').last;

/// PUT upsert (create-or-update) over raw REST with JWT auth. Session-cookie
/// auth — the Dart SDK's default — is rejected by Appwrite Cloud 2.2 for row
/// CREATEs that carry user-scoped permissions ("Permissions must be one of:
/// (any, guests)"), while JWT-authenticated calls may set them. The web pushes
/// the same way.
Future<void> _restUpsertRow({
  required String table,
  required String rowId,
  required Map<String, dynamic> row,
  required String userId,
}) async {
  final jwt = await getJwt();
  if (jwt == null) throw Exception('row upsert without JWT (signed out?)');
  http.Response res = await _putRow(jwt, table, rowId, row, userId);
  if (res.statusCode == 401) {
    invalidateJwtCache(); // cached token expired — mint a fresh one once
    final fresh = await getJwt();
    if (fresh != null) res = await _putRow(fresh, table, rowId, row, userId);
  }
  if (res.statusCode < 200 || res.statusCode >= 300) {
    throw Exception('upsert $table/$rowId → ${res.statusCode}: ${res.body}');
  }
}

Future<http.Response> _putRow(String jwt, String table, String rowId,
    Map<String, dynamic> row, String userId) {
  final uri = Uri.parse(
      '$kAppwriteEndpoint/tablesdb/$kDatabaseId/tables/$table/rows/$rowId');
  return http.put(
    uri,
    headers: {
      'X-Appwrite-Project': kAppwriteProjectId,
      'X-Appwrite-JWT': jwt,
      'content-type': 'application/json',
    },
    body: jsonEncode({
      'data': row,
      'permissions': [
        'read("user:$userId")',
        'write("user:$userId")',
      ],
    }),
  );
}

/// sync one row store: push local diff, then pull + merge cloud rows
Future<void> syncRowStore(AuthUser user, String storeKey) async {
  final adapter = _rowAdapters.firstWhere((a) => a.storeKey == storeKey);
  final digests = Map<String, String>.from(
    Stores.I.syncMeta.rowDigests[adapter.table] ?? const {},
  );

  // ---- push: diff local entities vs last-synced digests ----
  final current = adapter.list();
  final currentDigests = <String, String>{};
  for (final entity in current) {
    final id = adapter.idOf(entity);
    final row = {...adapter.toRow(entity), 'userId': user.id};
    final digest = _rowDigestOf(row);
    currentDigests[id] = digest;
    if (digests[id] != digest) {
      await _restUpsertRow(
        table: adapter.table,
        rowId: id,
        row: row,
        userId: user.id,
      );
      // record the digest we just pushed — otherwise the entity re-pushes on
      // every sync (each push echoing a realtime event → endless churn that
      // starves the UI). If the server normalizes a value (int → float), the
      // local view still wins and stays stable from here on.
      digests[id] = digest;
    }
  }

  // ---- deletions: digests known to the cloud that vanished locally ----
  for (final id in digests.keys.toList()) {
    if (currentDigests.containsKey(id)) continue;
    try {
      await tablesDB.updateRow(
        databaseId: kDatabaseId,
        tableId: adapter.table,
        rowId: id,
        data: {'deleted': true, 'userId': user.id},
      );
    } catch (_) {
      // row never existed / already gone — fine
    }
    digests.remove(id);
  }

  // ---- pull: merge cloud rows (locally-changed rows win) ----
  final rows = await tablesDB.listRows(
    databaseId: kDatabaseId,
    tableId: adapter.table,
    queries: [Query.equal('userId', user.id), Query.limit(100)],
  );
  final localById = {
    for (final entity in current) adapter.idOf(entity): entity,
  };
  // merging writes into the stores — suppress the echo back into scheduleRowSync
  final wasApplying = applyingRemote;
  applyingRemote = true;
  try {
    for (final doc in rows.rows) {
      final row = Map<String, dynamic>.from(doc.data);
      final id = doc.$id;

      if (row['deleted'] == true) {
        if (localById.containsKey(id)) adapter.remove(id);
        digests.remove(id);
        continue;
      }

      final local = localById[id];
      if (local != null) {
        final localDigest = _rowDigestOf({
          ...adapter.toRow(local),
          'userId': user.id,
        });
        if (localDigest != _rowDigestOf(row))
          continue; // pending local edit wins
      }

      final entity = adapter.fromRow(id, row);
      adapter.upsert(entity);
      digests[id] = _rowDigestOf({...adapter.toRow(entity), 'userId': user.id});
    }

    // rows that our digests claim are synced but the cloud no longer returns
    // were hard-deleted server-side — re-upload them now, otherwise their
    // stale digests would suppress the push forever
    final cloudIds = rows.rows.map((doc) => doc.$id).toSet();
    for (final entry in localById.entries) {
      final id = entry.key;
      if (cloudIds.contains(id) || !digests.containsKey(id)) continue;
      final row = {...adapter.toRow(entry.value), 'userId': user.id};
      await _restUpsertRow(table: adapter.table, rowId: id, row: row, userId: user.id);
      digests[id] = _rowDigestOf(row);
    }
  } finally {
    applyingRemote = wasApplying;
  }

  debugPrint(
    '[sync] rows $storeKey: ${current.length} local, ${rows.rows.length} cloud → merged',
  );
  Stores.I.syncMeta.setRowDigests(adapter.table, digests);
}

/// set while the sync engine writes remote data into the stores, so those
/// writes don't schedule pushes back to the cloud
bool applyingRemote = false;
bool subscribed = false;

/* ---------------- init / auth actions ---------------- */

void _subscribeStores() {
  if (subscribed) return;
  subscribed = true;

  final entityStores = {
    'subjects': Stores.I.subjects,
    'todos': Stores.I.todos,
    'homework': Stores.I.homework,
    'grades': Stores.I.grades,
    'events': Stores.I.events,
  };
  for (final adapter in _rowAdapters) {
    final key = adapter.storeKey;
    if (entityStores[key] != null) {
      entityStores[key]!.addListener(() => scheduleRowSync(key));
    } else if (key == 'timetable') {
      Stores.I.timetable.addListener(() => scheduleRowSync(key));
    } else if (key == 'chat' || key == 'decks' || key == 'flashcards' || key == 'selection') {
      _room.addListener(() => scheduleRowSync(key));
    } else if (key == 'portalEntries' || key == 'portalCourses') {
      _portal.addListener(() => scheduleRowSync(key));
    }
  }
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
    // every store: push local diffs, then pull + merge. On a fresh device
    // this is a pure pull — no local entities and no stored digests means the
    // push and deletion phases have nothing to do.
    final failed = <String>[];
    for (final adapter in _rowAdapters) {
      try {
        await syncRowStore(user, adapter.storeKey);
      } catch (e) {
        failed.add(adapter.storeKey);
        debugPrint('[sync] row store ${adapter.storeKey} failed: $e');
      }
    }

    if (failed.isNotEmpty) {
      auth.setSyncError(
        'sync incomplete — ${failed.join(", ")} could not be synced; check your connection and tap Sync now',
      );
      _scheduleRetryLoop();
      return;
    }

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
  debugPrint(
    '[sync] init: stored session secret present: ${savedSecret != null}',
  );
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
    user = AuthUser(
      _storedUserId ?? '',
      _storedUserEmail ?? '',
      _storedUserEmail ?? '',
    );
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
  for (
    var attempt = 0;
    attempt < 4 && auth.status == SyncStatus.signedIn && auth.syncError != null;
    attempt++
  ) {
    await Future.delayed(const Duration(seconds: 10));
    if (auth.status != SyncStatus.signedIn) return;
    await reconcile(user);
  }
}

Future<void> signIn(String email, String password) async {
  final session = await account.createEmailPasswordSession(
    email: email,
    password: password,
  );
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
  await account.create(
    userId: ID.unique(),
    email: email,
    password: password,
    name: name,
  );
  await signIn(email, password);
}

/// signs out; local data deliberately stays on the device
Future<void> signOut() async {
  try {
    await account.deleteSession(sessionId: 'current');
  } catch (_) {}
  _stopRealtime();
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

RealtimeSubscription? _realtimeSub;

void _startRealtime(AuthUser user) {
  _stopRealtime();
  _realtimeSub = Realtime(appwriteClient).subscribe([
    for (final table in _rowTables.values)
      'databases.$kDatabaseId.tables.$table.rows',
  ]);
  _realtimeSub!.stream.listen((msg) {
    try {
      _onRealtimeEvent(msg);
    } catch (_) {
      // a malformed event must never crash the app
    }
  }, onError: (_) {});
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
  if (doc['userId'] is String && doc['userId'] != user.id)
    return; // another user's doc

  // structured row events → debounced store sync (pull merges the change).
  // Events whose row already matches our last-synced digest are our own echoes
  // or already-merged state — skipping them keeps push storms from looping.
  final event = msg.events.firstOrNull ?? '';
  if (event.contains('/tables/')) {
    for (final entry in _rowTables.entries) {
      if (event.contains('/tables/${entry.value}/rows')) {
        final rowId = (doc[r'$id'] ?? doc['id']) as String?;
        final stored = Stores.I.syncMeta.rowDigests[entry.value]?[rowId];
        if (rowId != null && stored != null && _rowDigestOf(doc) == stored)
          return;
        scheduleRowSync(entry.key);
        return;
      }
    }
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
