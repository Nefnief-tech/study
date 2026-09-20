import 'dart:async';

import 'package:flutter/material.dart';

import '../models/types.dart';
import '../stores/registry.dart';
import '../stores/todos_store.dart' show TodoInput;
import '../theme/app_theme.dart';
import '../utils/utils.dart';
import '../widgets/bits.dart';
import '../widgets/controls.dart';
import '../widgets/datetime_field.dart';
import '../widgets/subject_select.dart';

/// Port of todos/page.tsx + TodoFormModal.tsx.

enum _StatusFilter { open, done, all }

class TodosPage extends StatefulWidget {
  const TodosPage({super.key});

  @override
  State<TodosPage> createState() => _TodosPageState();
}

class _TodosPageState extends State<TodosPage> {
  _StatusFilter _status = _StatusFilter.open;
  String? _subjectFilter; // null = all
  bool _sortByPriority = false;

  Future<void> _openForm({Todo? todo}) {
    return showSemSheet(
      context: context,
      title: todo == null ? 'New task' : 'Edit task',
      builder: (_) => TodoFormSheet(todo: todo),
    );
  }

  @override
  Widget build(BuildContext context) {
    final stores = Stores.I;
    return ListenableBuilder(
      listenable: Listenable.merge([stores.todos, stores.subjects]),
      builder: (context, _) {
        final sem = context.sem;
        final todos = stores.todos.todos;
        final subjects = stores.subjects.subjects;

        var list = todos;
        if (_status != _StatusFilter.all) {
          list = list.where((t) => _status == _StatusFilter.done ? t.done : !t.done).toList();
        }
        if (_subjectFilter != null) {
          list = list.where((t) => t.subjectId == _subjectFilter).toList();
        }
        final sorted = [...list]..sort((a, b) {
          if (_sortByPriority) {
            final p = PRIORITY_ORDER[a.priority]! - PRIORITY_ORDER[b.priority]!;
            if (p != 0) return p;
          }
          final da = dueInfo(a.due)?.date.millisecondsSinceEpoch ?? 0x7fffffffffffffff;
          final db = dueInfo(b.due)?.date.millisecondsSinceEpoch ?? 0x7fffffffffffffff;
          if (da != db) return da - db;
          return a.createdAt - b.createdAt;
        });

        final openCount = todos.where((t) => !t.done).length;

        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 0),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  PageHeader(
                    title: 'Tasks',
                    subtitle: '$openCount open · ${todos.length - openCount} done',
                    trailing: SemPrimaryButton(
                      onPressed: _openForm,
                      child: const Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [Icon(Icons.add, size: 16), SizedBox(width: 6), Text('New task')],
                      ),
                    ),
                  ),
                  // filters
                  Row(
                    children: [
                      SegToggle<_StatusFilter>(
                        options: const [
                          (_StatusFilter.open, 'open'),
                          (_StatusFilter.done, 'done'),
                          (_StatusFilter.all, 'all'),
                        ],
                        selected: _status,
                        onChanged: (v) => setState(() => _status = v),
                      ),
                      const SizedBox(width: 8),
                      SemGhostButton(
                        onPressed: () => setState(() => _sortByPriority = !_sortByPriority),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Icon(Icons.swap_vert, size: 15, color: sem.inkSoft),
                            const SizedBox(width: 5),
                            Text(
                              _sortByPriority ? 'priority' : 'due date',
                              style: TextStyle(fontSize: 12, color: sem.inkSoft),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 10),
                  // subject filter chips
                  SizedBox(
                    height: 30,
                    child: ListView(
                      scrollDirection: Axis.horizontal,
                      children: [
                        _filterChip(context, null, 'All subjects'),
                        for (final s in subjects) _filterChip(context, s.id, s.name, color: s.color),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 14),
            Expanded(
              child: sorted.isEmpty
                  ? SingleChildScrollView(
                      padding: const EdgeInsets.symmetric(horizontal: 16),
                      child: EmptyState(
                        icon: Icons.inbox_outlined,
                        title: _status == _StatusFilter.done ? 'Nothing completed yet' : 'No tasks here',
                        hint: _status == _StatusFilter.done
                            ? 'Finished tasks will collect here.'
                            : 'Add a task with a due date, priority and subject — it will also show up on the calendar.',
                        action: SemPrimaryButton(
                          onPressed: _openForm,
                          child: const Row(mainAxisSize: MainAxisSize.min, children: [
                            Icon(Icons.add, size: 16),
                            SizedBox(width: 6),
                            Text('New task'),
                          ]),
                        ),
                      ),
                    )
                  : ListView.builder(
                      padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
                      itemCount: sorted.length,
                      itemBuilder: (context, i) {
                        final todo = sorted[i];
                        final subject = findSubject(subjects, todo.subjectId);
                        return Container(
                          margin: const EdgeInsets.only(bottom: 10),
                          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 11),
                          decoration: BoxDecoration(
                            color: sem.card,
                            border: Border.all(color: sem.line),
                            borderRadius: BorderRadius.circular(12),
                          ),
                          child: Row(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              CheckDot(
                                done: todo.done,
                                onTap: () => stores.todos.toggleTodo(todo.id),
                              ),
                              const SizedBox(width: 10),
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(
                                      todo.title,
                                      style: Theme.of(context)
                                          .textTheme
                                          .bodyMedium!
                                          .copyWith(
                                            fontWeight: FontWeight.w500,
                                            decoration: todo.done ? TextDecoration.lineThrough : null,
                                            color: todo.done ? sem.inkSoft : sem.ink,
                                          ),
                                    ),
                                    const SizedBox(height: 6),
                                    Wrap(
                                      spacing: 6,
                                      runSpacing: 4,
                                      children: [
                                        if (subject != null) SubjectTag(subject.name, subject.color),
                                        DueChip(todo.due, done: todo.done),
                                        PriorityBadge(todo.priority),
                                      ],
                                    ),
                                    if (todo.notes != null && todo.notes!.isNotEmpty) ...[
                                      const SizedBox(height: 6),
                                      Text(
                                        todo.notes!,
                                        maxLines: 2,
                                        overflow: TextOverflow.ellipsis,
                                        style: Theme.of(context)
                                            .textTheme
                                            .bodySmall!
                                            .copyWith(color: sem.inkSoft),
                                      ),
                                    ],
                                  ],
                                ),
                              ),
                              const SizedBox(width: 6),
                              SemIconButton(
                                icon: Icons.edit_outlined,
                                size: 16,
                                onPressed: () => _openForm(todo: todo),
                              ),
                              SemIconButton(
                                icon: Icons.delete_outline,
                                size: 16,
                                onPressed: () => stores.todos.removeTodo(todo.id),
                              ),
                            ],
                          ),
                        );
                      },
                    ),
            ),
          ],
        );
      },
    );
  }

  Widget _filterChip(BuildContext context, String? subjectId, String label, {String? color}) {
    final sem = context.sem;
    final selected = _subjectFilter == subjectId;
    return Padding(
      padding: const EdgeInsets.only(right: 6),
      child: InkWell(
        onTap: () => setState(() => _subjectFilter = selected ? null : subjectId),
        borderRadius: BorderRadius.circular(999),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
          decoration: BoxDecoration(
            color: selected ? sem.ink : sem.paper,
            border: Border.all(color: selected ? sem.ink : sem.line),
            borderRadius: BorderRadius.circular(999),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (color != null) ...[
                SubjectDot(color, size: 8),
                const SizedBox(width: 5),
              ],
              Text(
                label,
                style: Theme.of(context).textTheme.bodySmall!.copyWith(
                      fontSize: 11,
                      color: selected ? sem.paper : sem.ink,
                    ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// round check button — filled accent when done
class CheckDot extends StatelessWidget {
  final bool done;
  final VoidCallback onTap;
  const CheckDot({super.key, required this.done, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final sem = context.sem;
    return InkWell(
      onTap: onTap,
      customBorder: const CircleBorder(),
      child: Container(
        width: 20,
        height: 20,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          color: done ? sem.accent : Colors.transparent,
          border: Border.all(color: done ? sem.accent : sem.ink.withValues(alpha: 0.3)),
        ),
        child: done
            ? Icon(Icons.check, size: 12, color: sem.paper)
            : const SizedBox.shrink(),
      ),
    );
  }
}

/// Port of TodoFormModal.tsx — shared shape with the homework sheet.
class TodoFormSheet extends StatefulWidget {
  final Todo? todo;
  const TodoFormSheet({super.key, this.todo});

  @override
  State<TodoFormSheet> createState() => _TodoFormSheetState();
}

class _TodoFormSheetState extends State<TodoFormSheet> {
  late final TextEditingController _title = TextEditingController(text: widget.todo?.title ?? '');
  late final TextEditingController _notes = TextEditingController(text: widget.todo?.notes ?? '');
  late Priority _priority = widget.todo?.priority ?? Priority.medium;
  late String? _due = widget.todo?.due;
  late String? _subjectId = widget.todo?.subjectId;
  // auto-save: text edits commit debounced, discrete picks immediately —
  // the sheet can be dismissed at any moment without losing input
  Timer? _debounce;
  bool _dirty = false;
  String? _createdId;

  String? get _targetId => widget.todo?.id ?? _createdId;

  @override
  void dispose() {
    _debounce?.cancel();
    if (_dirty) _commit(relaxed: true);
    _title.dispose();
    _notes.dispose();
    super.dispose();
  }

  void _commitSoon() {
    _dirty = true;
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 400), _commit);
  }

  void _commitNow() {
    _dirty = true;
    _debounce?.cancel();
    _commit();
  }

  /// writes the form into the store; the close-time flush (`relaxed`) falls
  /// back to "Untitled" when content exists but no title was typed
  void _commit({bool relaxed = false}) {
    final title = _title.text.trim();
    final notes = _notes.text.trim();
    final isCreate = widget.todo == null && _createdId == null;
    final hasExtras = notes.isNotEmpty || _due != null || _subjectId != null;
    final t = title.isEmpty && relaxed && isCreate && hasExtras ? 'Untitled' : title;
    if (t.isEmpty) return; // nothing to create yet / emptied title keeps its last value
    final stores = Stores.I;
    if (_targetId != null) {
      Todo? current;
      for (final x in stores.todos.todos) {
        if (x.id == _targetId) current = x;
      }
      if (current == null) return;
      stores.todos.updateTodo(
        current.id,
        current.copyWith(
          title: t,
          notes: notes.isEmpty ? null : notes,
          due: _due,
          priority: _priority,
          subjectId: _subjectId,
        ),
        clearNotes: notes.isEmpty,
        clearDue: _due == null,
        clearSubject: _subjectId == null,
      );
    } else {
      _createdId = stores.todos.addTodo(TodoInput(
        t,
        notes: notes.isEmpty ? null : notes,
        due: _due,
        priority: _priority,
        subjectId: _subjectId,
      ));
    }
  }

  void _flushAndClose() {
    _debounce?.cancel();
    if (_dirty) {
      _dirty = false;
      _commit(relaxed: true);
    }
    Navigator.of(context).pop();
  }

  @override
  Widget build(BuildContext context) {
    final sem = context.sem;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const SemLabel('Title'),
        TextField(
          controller: _title,
          autofocus: widget.todo == null,
          onChanged: (_) => _commitSoon(),
          decoration: const InputDecoration(hintText: 'e.g. Linear algebra problem set 4'),
        ),
        const SizedBox(height: 14),
        const SemLabel('Due (optional)'),
        InkWell(
          onTap: () async {
            final picked = await pickDueDateTime(context, _due);
            if (picked != null) {
              setState(() => _due = picked);
              _commitNow();
            }
          },
          borderRadius: BorderRadius.circular(10),
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 11),
            decoration: BoxDecoration(
              color: sem.card,
              border: Border.all(color: sem.line),
              borderRadius: BorderRadius.circular(10),
            ),
            child: Row(
              children: [
                Icon(Icons.schedule, size: 15, color: sem.inkSoft),
                const SizedBox(width: 8),
                Text(
                  _due == null ? 'Pick a date & time' : dueLabel(_due),
                  style: Theme.of(context).textTheme.labelMedium!.copyWith(
                        fontSize: 13,
                        color: _due == null ? sem.inkSoft : sem.ink,
                      ),
                ),
                const Spacer(),
                if (_due != null)
                  SemIconButton(
                    icon: Icons.close,
                    size: 14,
                    onPressed: () {
                      setState(() => _due = null);
                      _commitNow();
                    },
                  ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 14),
        const SemLabel('Priority'),
        Row(
          children: [
            for (final p in Priority.values) ...[
              if (p != Priority.low) const SizedBox(width: 6),
              Expanded(
                child: _priorityButton(p),
              ),
            ],
          ],
        ),
        const SizedBox(height: 14),
        SubjectSelect(
          value: _subjectId,
          onChanged: (v) {
            setState(() => _subjectId = v);
            _commitNow();
          },
        ),
        const SizedBox(height: 14),
        const SemLabel('Notes (optional)'),
        TextField(
          controller: _notes,
          minLines: 2,
          maxLines: 5,
          onChanged: (_) => _commitSoon(),
          decoration: const InputDecoration(hintText: 'Chapters, page numbers, links…'),
        ),
        const SizedBox(height: 18),
        Row(
          children: [
            Expanded(
              child: Text(
                'Saves automatically',
                style: Theme.of(context)
                    .textTheme
                    .labelSmall!
                    .copyWith(color: sem.inkSoft),
              ),
            ),
            SemPrimaryButton(onPressed: _flushAndClose, child: const Text('Done')),
          ],
        ),
      ],
    );
  }

  Widget _priorityButton(Priority p) {
    final sem = context.sem;
    final selected = _priority == p;
    return InkWell(
      onTap: () {
        setState(() => _priority = p);
        _commitNow();
      },
      borderRadius: BorderRadius.circular(10),
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 9),
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: selected ? sem.ink : sem.card,
          border: Border.all(color: selected ? sem.ink : sem.line),
          borderRadius: BorderRadius.circular(10),
        ),
        child: Text(
          PRIORITY_LABEL[p]!,
          style: Theme.of(context).textTheme.bodySmall!.copyWith(
                fontWeight: FontWeight.w500,
                color: selected ? sem.paper : sem.inkSoft,
              ),
        ),
      ),
    );
  }
}
