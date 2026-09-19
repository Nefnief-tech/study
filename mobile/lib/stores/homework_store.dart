import '../models/types.dart';
import '../utils/utils.dart';
import 'base.dart';

class HomeworkInput {
  final String title;
  final String? subjectId;
  final String? due;
  final Priority priority;
  final String? notes;
  const HomeworkInput(this.title, {this.subjectId, this.due, required this.priority, this.notes});
}

class HomeworkStore extends PersistedStore {
  @override
  String get storageKey => 'semester.homework';

  List<Homework> _homeworks = [];
  List<Homework> get homeworks => List.unmodifiable(_homeworks);

  @override
  Map<String, dynamic> persistedState() =>
      {'homeworks': _homeworks.map((h) => h.toJson()).toList()};

  @override
  void hydrateFrom(Map<String, dynamic> state) {
    _homeworks = ((state['homeworks'] as List?) ?? [])
        .map((e) => Homework.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  void addHomework(HomeworkInput input) {
    _homeworks = [
      Homework(
        id: uid(),
        title: input.title.trim(),
        subjectId: input.subjectId,
        due: input.due,
        priority: input.priority,
        notes: input.notes,
        done: false,
        createdAt: DateTime.now().millisecondsSinceEpoch,
      ),
      ..._homeworks,
    ];
    notifyListeners();
    persist();
  }

  void updateHomework(String id, Homework patch, {bool clearNotes = false, bool clearDue = false, bool clearSubject = false}) {
    _homeworks = [
      for (final h in _homeworks)
        if (h.id == id)
          h.copyWith(
            title: patch.title.trim().isEmpty ? h.title : patch.title.trim(),
            notes: patch.notes,
            due: patch.due,
            priority: patch.priority,
            subjectId: patch.subjectId,
            clearNotes: clearNotes,
            clearDue: clearDue,
            clearSubject: clearSubject,
          )
        else
          h,
    ];
    notifyListeners();
    persist();
  }

  void toggleHomework(String id) {
    _homeworks = [
      for (final h in _homeworks)
        if (h.id == id) h.copyWith(done: !h.done) else h,
    ];
    notifyListeners();
    persist();
  }

  void removeHomework(String id) {
    _homeworks = _homeworks.where((h) => h.id != id).toList();
    notifyListeners();
    persist();
  }

  void detachSubject(String subjectId) {
    _homeworks = [
      for (final h in _homeworks)
        if (h.subjectId == subjectId) h.copyWith(clearSubject: true) else h,
    ];
    notifyListeners();
    persist();
  }

  void clearAll() {
    _homeworks = [];
    notifyListeners();
    persist();
  }

  /// used by the sync engine when the cloud snapshot wins
  void replaceAll(List<Homework> homeworks) {
    _homeworks = homeworks;
    notifyListeners();
    persist();
  }

  /// row-level sync merge: insert or replace a single homework
  void upsertOne(Homework homework) {
    final next = [..._homeworks];
    final i = next.indexWhere((h) => h.id == homework.id);
    if (i >= 0) {
      next[i] = homework;
    } else {
      next.insert(0, homework);
    }
    _homeworks = next;
    notifyListeners();
    persist();
  }

  /// row-level sync merge: drop a single homework
  void removeOne(String id) {
    _homeworks = _homeworks.where((h) => h.id != id).toList();
    notifyListeners();
    persist();
  }
}
