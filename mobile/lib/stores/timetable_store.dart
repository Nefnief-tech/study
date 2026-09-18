import '../models/types.dart';
import 'base.dart';

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
}
