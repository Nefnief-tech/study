import '../models/types.dart';
import '../utils/utils.dart';
import 'base.dart';

/// converts pre-Punkte entries (score/max) and clamps Punkte entries to 0–15
List<GradeEntry> normalizeGradeEntries(Object? raw) {
  if (raw is! List) return [];
  return [
    for (final e in raw)
      if (e is Map)
        () {
          final m = Map<String, dynamic>.from(e);
          final num points;
          if (m['points'] is num) {
            points = (m['points'] as num).clamp(0, 15);
          } else {
            final score = (m['score'] as num?) ?? 0;
            final max = (m['max'] as num?) ?? 0;
            points = percentToPoints(max > 0 ? (score / max) * 100 : 0);
          }
          return GradeEntry(
            id: '${m['id']}',
            subjectId: m['subjectId'] is String ? m['subjectId'] as String : null,
            title: '${m['title'] ?? ''}',
            points: points,
            weight: num.tryParse('${m['weight'] ?? 1}') ?? 1,
            date: m['date'] is String ? m['date'] as String : null,
          );
        }(),
  ];
}

class GradeInput {
  final String subjectId;
  final String title;
  final num points;
  final num weight;
  final String? date;
  const GradeInput(this.subjectId, this.title, {required this.points, required this.weight, this.date});
}

class GradesStore extends PersistedStore {
  @override
  String get storageKey => 'semester.grades';

  @override
  int get storageVersion => 2;

  List<GradeEntry> _entries = [];
  List<GradeEntry> get entries => List.unmodifiable(_entries);

  @override
  Map<String, dynamic> persistedState() =>
      {'entries': _entries.map((e) => e.toJson()).toList()};

  @override
  void hydrateFrom(Map<String, dynamic> state) {
    // v1 stored score/max entries — normalizeGradeEntries converts them
    _entries = normalizeGradeEntries(state['entries']);
  }

  String addEntry(GradeInput input) {
    final entry = GradeEntry(
      id: uid(),
      subjectId: input.subjectId,
      title: input.title.trim(),
      points: input.points,
      weight: input.weight,
      date: input.date,
    );
    _entries = [..._entries, entry];
    notifyListeners();
    persist();
    return entry.id;
  }

  void updateEntry(String id, GradeEntry patch, {bool clearDate = false}) {
    _entries = [
      for (final e in _entries)
        if (e.id == id)
          e.copyWith(
            title: patch.title.trim().isEmpty ? e.title : patch.title.trim(),
            points: patch.points,
            weight: patch.weight,
            date: patch.date,
            clearDate: clearDate,
          )
        else
          e,
    ];
    notifyListeners();
    persist();
  }

  void removeEntry(String id) {
    _entries = _entries.where((e) => e.id != id).toList();
    notifyListeners();
    persist();
  }

  /// removes every entry belonging to the subject (cascade on subject delete)
  void removeSubject(String subjectId) {
    _entries = _entries.where((e) => e.subjectId != subjectId).toList();
    notifyListeners();
    persist();
  }

  void clearAll() {
    _entries = [];
    notifyListeners();
    persist();
  }

  /// used by the sync engine when the cloud snapshot wins
  void replaceEntries(List<GradeEntry> entries) {
    _entries = entries;
    notifyListeners();
    persist();
  }

  /// row-level sync merge: insert or replace a single grade entry
  void upsertOne(GradeEntry entry) {
    final next = [..._entries];
    final i = next.indexWhere((e) => e.id == entry.id);
    if (i >= 0) {
      next[i] = entry;
    } else {
      next.add(entry);
    }
    _entries = next;
    notifyListeners();
    persist();
  }

  /// row-level sync merge: drop a single grade entry
  void removeOne(String id) {
    _entries = _entries.where((e) => e.id != id).toList();
    notifyListeners();
    persist();
  }
}
