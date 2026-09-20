import '../models/types.dart';
import '../utils/utils.dart';
import 'base.dart';

class TodoInput {
  final String title;
  final String? notes;
  final String? due;
  final Priority priority;
  final String? subjectId;
  const TodoInput(this.title, {this.notes, this.due, required this.priority, this.subjectId});
}

class TodosStore extends PersistedStore {
  @override
  String get storageKey => 'semester.todos';

  List<Todo> _todos = [];
  List<Todo> get todos => List.unmodifiable(_todos);

  @override
  Map<String, dynamic> persistedState() =>
      {'todos': _todos.map((t) => t.toJson()).toList()};

  @override
  void hydrateFrom(Map<String, dynamic> state) {
    _todos = ((state['todos'] as List?) ?? [])
        .map((e) => Todo.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  String addTodo(TodoInput input) {
    final todo = Todo(
      id: uid(),
      title: input.title.trim(),
      notes: input.notes,
      due: input.due,
      priority: input.priority,
      subjectId: input.subjectId,
      done: false,
      createdAt: DateTime.now().millisecondsSinceEpoch,
    );
    _todos = [todo, ..._todos];
    notifyListeners();
    persist();
    return todo.id;
  }

  void updateTodo(String id, Todo patch, {bool clearNotes = false, bool clearDue = false, bool clearSubject = false}) {
    _todos = [
      for (final t in _todos)
        if (t.id == id)
          t.copyWith(
            title: patch.title.trim().isEmpty ? t.title : patch.title.trim(),
            notes: patch.notes,
            due: patch.due,
            priority: patch.priority,
            subjectId: patch.subjectId,
            clearNotes: clearNotes,
            clearDue: clearDue,
            clearSubject: clearSubject,
          )
        else
          t,
    ];
    notifyListeners();
    persist();
  }

  void toggleTodo(String id) {
    _todos = [
      for (final t in _todos)
        if (t.id == id) t.copyWith(done: !t.done) else t,
    ];
    notifyListeners();
    persist();
  }

  void removeTodo(String id) {
    _todos = _todos.where((t) => t.id != id).toList();
    notifyListeners();
    persist();
  }

  void detachSubject(String subjectId) {
    _todos = [
      for (final t in _todos)
        if (t.subjectId == subjectId) t.copyWith(clearSubject: true) else t,
    ];
    notifyListeners();
    persist();
  }

  void clearAll() {
    _todos = [];
    notifyListeners();
    persist();
  }

  /// used by the sync engine when the cloud snapshot wins
  void replaceAll(List<Todo> todos) {
    _todos = todos;
    notifyListeners();
    persist();
  }

  /// row-level sync merge: insert or replace a single todo
  void upsertOne(Todo todo) {
    final next = [..._todos];
    final i = next.indexWhere((t) => t.id == todo.id);
    if (i >= 0) {
      next[i] = todo;
    } else {
      next.insert(0, todo);
    }
    _todos = next;
    notifyListeners();
    persist();
  }

  /// row-level sync merge: drop a single todo
  void removeOne(String id) {
    _todos = _todos.where((t) => t.id != id).toList();
    notifyListeners();
    persist();
  }
}
