import 'dart:async';

import 'package:flutter/material.dart';

import '../models/types.dart';
import '../stores/homework_store.dart' show HomeworkInput;
import '../stores/registry.dart';
import '../theme/app_theme.dart';
import '../utils/utils.dart';
import '../widgets/bits.dart';
import '../widgets/controls.dart';
import '../widgets/datetime_field.dart';
import '../widgets/subject_select.dart';
import 'todos_page.dart';

/// Port of homework/page.tsx + HomeworkFormModal.tsx — a pushed route with
/// its own scaffold, mirroring the tasks page otherwise.

enum _StatusFilter { open, done, all }

class HomeworkPage extends StatefulWidget {
  const HomeworkPage({super.key});

  @override
  State<HomeworkPage> createState() => _HomeworkPageState();
}

class _HomeworkPageState extends State<HomeworkPage> {
  _StatusFilter _status = _StatusFilter.open;
  String? _subjectFilter;

  Future<void> _openForm({Homework? homework}) {
    return showSemSheet(
      context: context,
      title: homework == null ? 'New homework' : 'Edit homework',
      builder: (_) => HomeworkFormSheet(homework: homework),
    );
  }

  @override
  Widget build(BuildContext context) {
    final stores = Stores.I;
    return Scaffold(
      backgroundColor: context.sem.paper,
      appBar: AppBar(
        title: const Text('Homework'),
        actions: [
          SemIconButton(
            icon: Icons.add,
            onPressed: () => _openForm(),
            color: context.sem.ink,
          ),
          const SizedBox(width: 6),
        ],
      ),
      floatingActionButton: FloatingActionButton(
        onPressed: () => _openForm(),
        backgroundColor: context.sem.ink,
        foregroundColor: context.sem.paper,
        elevation: 0,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
        child: const Icon(Icons.add),
      ),
      body: PlannerGrid(
        child: ListenableBuilder(
          listenable: Listenable.merge([stores.homework, stores.subjects]),
          builder: (context, _) {
            final sem = context.sem;
            final homeworks = stores.homework.homeworks;
            final subjects = stores.subjects.subjects;

            var list = homeworks;
            if (_status != _StatusFilter.all) {
              list = list.where((h) => _status == _StatusFilter.done ? h.done : !h.done).toList();
            }
            if (_subjectFilter != null) {
              list = list.where((h) => h.subjectId == _subjectFilter).toList();
            }
            final sorted = [...list]..sort((a, b) {
                final da = dueInfo(a.due)?.date.millisecondsSinceEpoch ?? 0x7fffffffffffffff;
                final db = dueInfo(b.due)?.date.millisecondsSinceEpoch ?? 0x7fffffffffffffff;
                if (da != db) return da - db;
                final p = PRIORITY_ORDER[a.priority]! - PRIORITY_ORDER[b.priority]!;
                if (p != 0) return p;
                return b.createdAt - a.createdAt;
              });

            final openCount = homeworks.where((h) => !h.done).length;

            return Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        '$openCount open · ${homeworks.length - openCount} done',
                        style: Theme.of(context).textTheme.labelMedium!.copyWith(fontSize: 12),
                      ),
                      const SizedBox(height: 12),
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
                        ],
                      ),
                      const SizedBox(height: 10),
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
                            icon: Icons.menu_book_outlined,
                            title:
                                _status == _StatusFilter.done ? 'Nothing completed yet' : 'No homework here',
                            hint: _status == _StatusFilter.done
                                ? 'Finished homework will collect here.'
                                : "Add what your teachers assigned — with a due date and subject, it shows up on the calendar too.",
                          ),
                        )
                      : ListView.builder(
                          padding: const EdgeInsets.fromLTRB(16, 0, 16, 90),
                          itemCount: sorted.length,
                          itemBuilder: (context, i) {
                            final hw = sorted[i];
                            final subject = findSubject(subjects, hw.subjectId);
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
                                  CheckDot(done: hw.done, onTap: () => stores.homework.toggleHomework(hw.id)),
                                  const SizedBox(width: 10),
                                  Expanded(
                                    child: Column(
                                      crossAxisAlignment: CrossAxisAlignment.start,
                                      children: [
                                        Text(
                                          hw.title,
                                          style: Theme.of(context)
                                              .textTheme
                                              .bodyMedium!
                                              .copyWith(
                                                fontWeight: FontWeight.w500,
                                                decoration: hw.done ? TextDecoration.lineThrough : null,
                                                color: hw.done ? sem.inkSoft : sem.ink,
                                              ),
                                        ),
                                        const SizedBox(height: 6),
                                        Wrap(
                                          spacing: 6,
                                          runSpacing: 4,
                                          children: [
                                            if (subject != null) SubjectTag(subject.name, subject.color),
                                            DueChip(hw.due, done: hw.done),
                                            PriorityBadge(hw.priority),
                                          ],
                                        ),
                                        if (hw.notes != null && hw.notes!.isNotEmpty) ...[
                                          const SizedBox(height: 6),
                                          Text(
                                            hw.notes!,
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
                                    onPressed: () => _openForm(homework: hw),
                                  ),
                                  SemIconButton(
                                    icon: Icons.delete_outline,
                                    size: 16,
                                    onPressed: () => stores.homework.removeHomework(hw.id),
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
        ),
      ),
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

/// Port of HomeworkFormModal.tsx.
class HomeworkFormSheet extends StatefulWidget {
  final Homework? homework;
  const HomeworkFormSheet({super.key, this.homework});

  @override
  State<HomeworkFormSheet> createState() => _HomeworkFormSheetState();
}

class _HomeworkFormSheetState extends State<HomeworkFormSheet> {
  late final TextEditingController _title = TextEditingController(text: widget.homework?.title ?? '');
  late final TextEditingController _notes = TextEditingController(text: widget.homework?.notes ?? '');
  late Priority _priority = widget.homework?.priority ?? Priority.medium;
  late String? _due = widget.homework?.due;
  late String? _subjectId = widget.homework?.subjectId;
  // auto-save: text edits commit debounced, discrete picks immediately —
  // the sheet can be dismissed at any moment without losing input
  Timer? _debounce;
  bool _dirty = false;
  String? _createdId;

  String? get _targetId => widget.homework?.id ?? _createdId;

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
    final isCreate = widget.homework == null && _createdId == null;
    final hasExtras = notes.isNotEmpty || _due != null || _subjectId != null;
    final t = title.isEmpty && relaxed && isCreate && hasExtras ? 'Untitled' : title;
    if (t.isEmpty) return; // nothing to create yet / emptied title keeps its last value
    final stores = Stores.I;
    if (_targetId != null) {
      Homework? current;
      for (final x in stores.homework.homeworks) {
        if (x.id == _targetId) current = x;
      }
      if (current == null) return;
      stores.homework.updateHomework(
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
      _createdId = stores.homework.addHomework(HomeworkInput(
        t,
        subjectId: _subjectId,
        due: _due,
        priority: _priority,
        notes: notes.isEmpty ? null : notes,
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
          autofocus: widget.homework == null,
          onChanged: (_) => _commitSoon(),
          decoration: const InputDecoration(hintText: 'e.g. Worksheet: quadratic equations'),
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
                child: InkWell(
                  onTap: () {
                    setState(() => _priority = p);
                    _commitNow();
                  },
                  borderRadius: BorderRadius.circular(10),
                  child: Container(
                    padding: const EdgeInsets.symmetric(vertical: 9),
                    alignment: Alignment.center,
                    decoration: BoxDecoration(
                      color: _priority == p ? sem.ink : sem.card,
                      border: Border.all(color: _priority == p ? sem.ink : sem.line),
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: Text(
                      PRIORITY_LABEL[p]!,
                      style: Theme.of(context).textTheme.bodySmall!.copyWith(
                            fontWeight: FontWeight.w500,
                            color: _priority == p ? sem.paper : sem.inkSoft,
                          ),
                    ),
                  ),
                ),
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
          decoration: const InputDecoration(hintText: 'Page numbers, exercises, links…'),
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
}
