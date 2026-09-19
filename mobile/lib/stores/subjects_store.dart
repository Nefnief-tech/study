import '../models/types.dart';
import '../utils/utils.dart';
import 'base.dart';
import 'registry.dart';

class AddSubjectInput {
  final String name;
  final String? color;
  const AddSubjectInput(this.name, {this.color});
}

class SubjectsStore extends PersistedStore {
  @override
  String get storageKey => 'semester.subjects';

  List<Subject> _subjects = [];
  List<Subject> get subjects => List.unmodifiable(_subjects);

  @override
  Map<String, dynamic> persistedState() =>
      {'subjects': _subjects.map((s) => s.toJson()).toList()};

  @override
  void hydrateFrom(Map<String, dynamic> state) {
    _subjects = ((state['subjects'] as List?) ?? [])
        .map((e) => Subject.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Subject addSubject(AddSubjectInput input) {
    final subject = Subject(
      id: uid(),
      name: input.name.trim(),
      color: input.color ?? PALETTE[_subjects.length % PALETTE.length],
    );
    _subjects = [..._subjects, subject];
    notifyListeners();
    persist();
    return subject;
  }

  void updateSubject(String id, {String? name, String? color}) {
    _subjects = [
      for (final s in _subjects)
        if (s.id == id)
          s.copyWith(name: name?.trim() ?? s.name, color: color ?? s.color)
        else
          s,
    ];
    notifyListeners();
    persist();
  }

  /// removes the subject and detaches/deletes it everywhere
  /// (todos, homework, grades, events) — cascade, like the web store
  void removeSubject(String id) {
    _subjects = _subjects.where((s) => s.id != id).toList();
    notifyListeners();
    persist();
    Stores.I.todos.detachSubject(id);
    Stores.I.grades.removeSubject(id);
    Stores.I.events.detachSubject(id);
    Stores.I.homework.detachSubject(id);
  }

  void clearAll() {
    _subjects = [];
    notifyListeners();
    persist();
  }

  /// used by the sync engine when the cloud snapshot wins
  void replaceAll(List<Subject> subjects) {
    _subjects = subjects;
    notifyListeners();
    persist();
  }

  /// row-level sync merge: insert or replace a single subject
  void upsertOne(Subject subject) {
    final next = [..._subjects];
    final i = next.indexWhere((s) => s.id == subject.id);
    if (i >= 0) {
      next[i] = subject;
    } else {
      next.add(subject);
    }
    _subjects = next;
    notifyListeners();
    persist();
  }

  /// row-level sync merge: drop a single subject
  void removeOne(String id) {
    _subjects = _subjects.where((s) => s.id != id).toList();
    notifyListeners();
    persist();
  }
}
