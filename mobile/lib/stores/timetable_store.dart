import '../models/types.dart';
import '../utils/utils.dart';
import 'base.dart';

/// stable cloud row id for an entry — derived from its content, so both
/// clients derive the same id without coordinating (entries have no id)
String timetableRowId(TimetableEntry e) =>
    hashId([e.day, e.period, e.time ?? '', e.subject, e.teacher ?? '', e.room ?? ''].join('|'));

class TimetableStore extends PersistedStore {
  @override
  String get storageKey => 'semester.timetable';

  List<TimetableEntry> _entries = [];
  List<TimetableEntry> get entries => List.unmodifiable(_entries);

  int _updatedAt = 0;
  int get updatedAt => _updatedAt;

  @override
  Map<String, dynamic> persistedState() => {
        'entries': _entries.map((e) => e.toJson()).toList(),
        'updatedAt': _updatedAt,
      };

  @override
  void hydrateFrom(Map<String, dynamic> state) {
    _entries = ((state['entries'] as List?) ?? [])
        .map((e) => TimetableEntry.fromJson(e as Map<String, dynamic>))
        .toList();
    _updatedAt = (state['updatedAt'] as num?)?.toInt() ?? 0;
  }

  void setTimetable(List<TimetableEntry> entries) {
    _entries = entries;
    _updatedAt = DateTime.now().millisecondsSinceEpoch;
    notifyListeners();
    persist();
  }

  void clear() {
    _entries = [];
    _updatedAt = DateTime.now().millisecondsSinceEpoch;
    notifyListeners();
    persist();
  }

  /// used by the sync engine when the cloud snapshot wins
  void replaceEntries(List<TimetableEntry> entries) {
    _entries = entries;
    notifyListeners();
    persist();
  }

  /// row-level sync: insert or replace an entry (content-hash identity)
  void upsertEntry(TimetableEntry entry) {
    final rowId = timetableRowId(entry);
    final rest = _entries.where((e) => timetableRowId(e) != rowId).toList();
    _entries = [...rest, entry];
    notifyListeners();
    persist();
  }

  /// row-level sync: drop the entry with this cloud row id
  void removeEntry(String rowId) {
    _entries = _entries.where((e) => timetableRowId(e) != rowId).toList();
    notifyListeners();
    persist();
  }
}
