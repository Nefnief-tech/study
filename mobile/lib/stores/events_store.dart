import '../models/types.dart';
import '../utils/utils.dart';
import 'base.dart';

class EventInput {
  final String title;
  final String date;
  final String? time;
  final EventType type;
  final String? subjectId;
  final String? notes;
  const EventInput(this.title, {required this.date, this.time, required this.type, this.subjectId, this.notes});
}

class EventsStore extends PersistedStore {
  @override
  String get storageKey => 'semester.events';

  List<StudyEvent> _events = [];
  List<StudyEvent> get events => List.unmodifiable(_events);

  @override
  Map<String, dynamic> persistedState() =>
      {'events': _events.map((e) => e.toJson()).toList()};

  @override
  void hydrateFrom(Map<String, dynamic> state) {
    _events = ((state['events'] as List?) ?? [])
        .map((e) => StudyEvent.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  void addEvent(EventInput input) {
    _events = [
      ..._events,
      StudyEvent(
        id: uid(),
        title: input.title.trim(),
        date: input.date,
        time: input.time,
        type: input.type,
        subjectId: input.subjectId,
        notes: input.notes,
      ),
    ];
    notifyListeners();
    persist();
  }

  void updateEvent(String id, StudyEvent patch, {bool clearTime = false, bool clearNotes = false, bool clearSubject = false}) {
    _events = [
      for (final e in _events)
        if (e.id == id)
          e.copyWith(
            title: patch.title.trim().isEmpty ? e.title : patch.title.trim(),
            date: patch.date,
            time: patch.time,
            type: patch.type,
            subjectId: patch.subjectId,
            notes: patch.notes,
            clearTime: clearTime,
            clearNotes: clearNotes,
            clearSubject: clearSubject,
          )
        else
          e,
    ];
    notifyListeners();
    persist();
  }

  void removeEvent(String id) {
    _events = _events.where((e) => e.id != id).toList();
    notifyListeners();
    persist();
  }

  void detachSubject(String subjectId) {
    _events = [
      for (final e in _events)
        if (e.subjectId == subjectId) e.copyWith(clearSubject: true) else e,
    ];
    notifyListeners();
    persist();
  }

  void clearAll() {
    _events = [];
    notifyListeners();
    persist();
  }

  /// used by the sync engine when the cloud snapshot wins
  void replaceAll(List<StudyEvent> events) {
    _events = events;
    notifyListeners();
    persist();
  }
}
