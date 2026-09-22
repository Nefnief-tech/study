import 'package:flutter/material.dart';

import '../models/types.dart';
import '../stores/registry.dart';
import '../theme/app_theme.dart';
import '../utils/utils.dart';
import '../navigation.dart';
import '../widgets/bits.dart';
import '../widgets/controls.dart';
import '../widgets/motion.dart';

/// Port of the web dashboard (`src/app/page.tsx`).

String _greeting() {
  final h = DateTime.now().hour;
  if (h < 5) return 'Up late';
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

class _UpcomingItem {
  final bool isHomework;
  final Todo? todo;
  final Homework? homework;
  final int sortKey;
  _UpcomingItem.todo(Todo t)
      : isHomework = false,
        todo = t,
        homework = null,
        sortKey = dueInfo(t.due)?.date.millisecondsSinceEpoch ?? 0x7fffffffffffffff;
  _UpcomingItem.homework(Homework h)
      : isHomework = true,
        todo = null,
        homework = h,
        sortKey = dueInfo(h.due)?.date.millisecondsSinceEpoch ?? 0x7fffffffffffffff;
}

class DashboardPage extends StatelessWidget {
  const DashboardPage({super.key});

  @override
  Widget build(BuildContext context) {
    final stores = Stores.I;
    return ListenableBuilder(
      listenable: Listenable.merge([
        stores.todos,
        stores.homework,
        stores.events,
        stores.subjects,
        stores.grades,
      ]),
      builder: (context, _) {
        final sem = context.sem;
        final todos = stores.todos.todos;
        final homeworks = stores.homework.homeworks;
        final events = stores.events.events;
        final subjects = stores.subjects.subjects;
        final entries = stores.grades.entries;

        final openTodos = todos.where((t) => !t.done).toList();
        final openHomework = homeworks.where((h) => !h.done).toList();

        final now = DateTime.now();
        final weekEnd = now.add(const Duration(days: 7)).millisecondsSinceEpoch;
        final dueToday =
            openTodos.where((t) => dueInfo(t.due)?.isToday ?? false).length;
        final dueWeek = openTodos
            .where((t) =>
                (dueInfo(t.due)?.date.millisecondsSinceEpoch ?? 0x7fffffffffffffff) <= weekEnd)
            .length;

        final overall = weightedAverage(entries);

        final upcoming = [
          ...openTodos.map(_UpcomingItem.todo),
          ...openHomework.map(_UpcomingItem.homework),
        ]..sort((a, b) => a.sortKey - b.sortKey);

        // next 7 days schedule: events + open todo/homework due dates
        final startKey = toDayKey(now);
        final endKey = toDayKey(now.add(const Duration(days: 6)));
        final buckets = <String, List<_ScheduleItem>>{};
        void push(String key, _ScheduleItem item) {
          if (key.compareTo(startKey) < 0 || key.compareTo(endKey) > 0) return;
          buckets.putIfAbsent(key, () => []).add(item);
        }
        for (final e in events) {
          push(e.date, _ScheduleItem.event(e));
        }
        for (final t in openTodos) {
          if (t.due != null) push(t.due!.substring(0, 10), _ScheduleItem.todo(t));
        }
        for (final h in openHomework) {
          if (h.due != null) push(h.due!.substring(0, 10), _ScheduleItem.homework(h));
        }
        final schedule = buckets.keys.toList()..sort();

        final isEmpty = todos.isEmpty && events.isEmpty && subjects.isEmpty;

        return SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                longDateLabel(now).toUpperCase(),
                style: Theme.of(context).textTheme.labelSmall!.copyWith(letterSpacing: 1.6),
              ),
              const SizedBox(height: 8),
              Text.rich(
                TextSpan(
                  children: [
                    TextSpan(text: '${_greeting()}.'),
                    TextSpan(
                      text: dueToday > 0
                          ? ' $dueToday ${dueToday == 1 ? 'task' : 'tasks'} due today.'
                          : ' Nothing due today.',
                      style: TextStyle(
                        color: sem.accent,
                        fontStyle: FontStyle.italic,
                      ),
                    ),
                  ],
                ),
                style: Theme.of(context).textTheme.displayLarge,
              ),
              if (isEmpty) ...[
                const SizedBox(height: 24),
                const EmptyState(
                  icon: Icons.auto_awesome,
                  title: 'Your desk is empty',
                  hint: 'Add a subject, a task or a calendar entry to get started.',
                ),
              ],
              const SizedBox(height: 28),

              // stats
              GridView.count(
                crossAxisCount: 2,
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                mainAxisSpacing: 12,
                crossAxisSpacing: 12,
                childAspectRatio: 1.9,
                children: [
                  _StatCard(
                    label: 'open tasks',
                    value: '${openTodos.length}',
                    onTap: () => AppNav.I.handle('tasks'),
                  ),
                  _StatCard(
                    label: 'due today',
                    value: '$dueToday',
                    onTap: () => AppNav.I.handle('tasks'),
                  ),
                  _StatCard(
                    label: 'due this week',
                    value: '$dueWeek',
                    onTap: () => AppNav.I.handle('calendar'),
                  ),
                  _StatCard(
                    label: 'homework open',
                    value: '${openHomework.length}',
                    onTap: () => AppNav.I.handle('homework'),
                  ),
                  _StatCard(
                    label: 'overall grade',
                    value: overall == null ? '—' : formatPoints(overall),
                    onTap: () => AppNav.I.handle('grades'),
                  ),
                ],
              ),
              const SizedBox(height: 32),

              // up next
              _SectionHeader(
                title: 'Up next',
                actionLabel: 'all tasks →',
                onAction: () => AppNav.I.handle('tasks'),
              ),
              if (upcoming.isEmpty)
                const EmptyState(
                  title: 'All clear',
                  hint: 'No open tasks or homework. Enjoy the calm.',
                )
              else
                Column(
                  children: [
                    for (final item in upcoming.take(8))
                      _UpcomingRow(item: item),
                  ],
                ),

              // subject averages
              if (subjects.isNotEmpty) ...[
                const SizedBox(height: 32),
                _SectionHeader(
                  title: 'Subjects',
                  actionLabel: 'manage grades →',
                  onAction: () => AppNav.I.handle('grades'),
                ),
                SemCard(
                  padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 4),
                  child: Column(
                    children: [
                      for (final s in subjects)
                        _SubjectRow(
                          subject: s,
                          avg: weightedAverage(
                              entries.where((e) => e.subjectId == s.id)),
                        ),
                    ],
                  ),
                ),
              ],

              // next 7 days
              const SizedBox(height: 32),
              _SectionHeader(
                title: 'Next 7 days',
                actionLabel: 'calendar →',
                onAction: () => AppNav.I.handle('calendar'),
              ),
              if (schedule.isEmpty)
                const EmptyState(
                  title: 'Quiet week',
                  hint: 'No sessions, exams or deadlines in the next 7 days.',
                )
              else
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    for (final key in schedule) ...[
                      Padding(
                        padding: const EdgeInsets.only(bottom: 6),
                        child: Text(
                          dayKeyLabel(key).toUpperCase(),
                          style: Theme.of(context)
                              .textTheme
                              .labelSmall!
                              .copyWith(letterSpacing: 1.2),
                        ),
                      ),
                      for (final item in buckets[key]!)
                        Padding(
                          padding: const EdgeInsets.only(bottom: 6),
                          child: _ScheduleRow(item: item),
                        ),
                      const SizedBox(height: 8),
                    ],
                  ],
                ),

              // danger zone
              const SizedBox(height: 40),
              Row(
                mainAxisAlignment: MainAxisAlignment.end,
                children: [
                  TextButton.icon(
                    onPressed: () async {
                      final ok = await confirmDialog(
                        context,
                        'Delete all tasks, homework, grades, events and subjects? This cannot be undone.',
                        title: 'Clear all data',
                        confirmLabel: 'Clear everything',
                      );
                      if (ok) {
                        stores.todos.clearAll();
                        stores.homework.clearAll();
                        stores.grades.clearAll();
                        stores.events.clearAll();
                        stores.subjects.clearAll();
                      }
                    },
                    icon: Icon(Icons.delete_outline, size: 14, color: sem.inkSoft.withValues(alpha: 0.7)),
                    label: Text(
                      'clear all data',
                      style: Theme.of(context)
                          .textTheme
                          .labelSmall!
                          .copyWith(color: sem.inkSoft.withValues(alpha: 0.7)),
                    ),
                  ),
                ],
              ),
            ],
          ),
        );
      },
    );
  }
}

/* ---------------- pieces ---------------- */

class _StatCard extends StatelessWidget {
  final String label;
  final String value;
  final VoidCallback onTap;
  const _StatCard({required this.label, required this.value, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return Pressable(
      onTap: onTap,
      child: SemCard(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text(
              label.toUpperCase(),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: Theme.of(context).textTheme.labelSmall!.copyWith(
                    fontSize: 9,
                    letterSpacing: 1.2,
                  ),
            ),
            Text(
              value,
              style: Theme.of(context).textTheme.displaySmall!.copyWith(fontSize: 26),
            ),
          ],
        ),
      ),
    );
  }
}

class _SectionHeader extends StatelessWidget {
  final String title;
  final String? actionLabel;
  final VoidCallback? onAction;
  const _SectionHeader({required this.title, this.actionLabel, this.onAction});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.baseline,
        textBaseline: TextBaseline.alphabetic,
        children: [
          Expanded(
            child: Text(title, style: Theme.of(context).textTheme.headlineSmall),
          ),
          if (actionLabel != null)
            GestureDetector(
              onTap: onAction,
              child: Text(
                actionLabel!.toUpperCase(),
                style: Theme.of(context).textTheme.labelSmall!.copyWith(letterSpacing: 1),
              ),
            ),
        ],
      ),
    );
  }
}

class _UpcomingRow extends StatelessWidget {
  final _UpcomingItem item;
  const _UpcomingRow({required this.item});

  @override
  Widget build(BuildContext context) {
    final stores = Stores.I;
    final subjects = stores.subjects.subjects;
    final sem = context.sem;

    final String title;
    final String? due;
    final Subject? subject;
    final bool done;
    if (item.isHomework) {
      final hw = item.homework!;
      title = hw.title;
      due = hw.due;
      subject = findSubject(subjects, hw.subjectId);
      done = hw.done;
    } else {
      final t = item.todo!;
      title = t.title;
      due = t.due;
      subject = findSubject(subjects, t.subjectId);
      done = t.done;
    }

    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
      decoration: BoxDecoration(
        color: sem.card,
        border: Border.all(color: sem.line),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _RoundCheck(
            done: done,
            size: 20,
            onChanged: (_) {
              if (item.isHomework) {
                stores.homework.toggleHomework(item.homework!.id);
              } else {
                stores.todos.toggleTodo(item.todo!.id);
              }
            },
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    if (item.isHomework) ...[
                      Icon(Icons.menu_book, size: 13, color: sem.accent),
                      const SizedBox(width: 5),
                    ],
                    Expanded(
                      child: Text(
                        title,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: Theme.of(context)
                            .textTheme
                            .bodyMedium!
                            .copyWith(fontWeight: FontWeight.w500),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 5),
                Wrap(
                  spacing: 6,
                  runSpacing: 4,
                  children: [
                    if (subject != null) SubjectTag(subject.name, subject.color),
                    DueChip(due, done: done),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// round checkbox used across dashboard / tasks / homework
class _RoundCheck extends StatelessWidget {
  final bool done;
  final double size;
  final ValueChanged<bool> onChanged;
  const _RoundCheck({required this.done, required this.onChanged, this.size = 20});

  @override
  Widget build(BuildContext context) {
    final sem = context.sem;
    return InkWell(
      onTap: () => onChanged(!done),
      customBorder: const CircleBorder(),
      child: Container(
        width: size,
        height: size,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          color: done ? sem.accent : Colors.transparent,
          border: Border.all(color: done ? sem.accent : sem.ink.withValues(alpha: 0.3)),
        ),
        child: done
            ? Icon(Icons.check, size: size * 0.6, color: sem.paper)
            : const SizedBox.shrink(),
      ),
    );
  }
}

class _SubjectRow extends StatelessWidget {
  final Subject subject;
  final double? avg;
  const _SubjectRow({required this.subject, this.avg});

  @override
  Widget build(BuildContext context) {
    final sem = context.sem;
    final tone = avg == null ? Tone.neutral : pointsTone(avg!);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 10),
      child: Row(
        children: [
          SubjectDot(subject.color, size: 10),
          const SizedBox(width: 10),
          SizedBox(
            width: 110,
            child: Text(
              subject.name,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: Theme.of(context)
                  .textTheme
                  .bodyMedium!
                  .copyWith(fontWeight: FontWeight.w500),
            ),
          ),
          Expanded(
            child: ClipRRect(
              borderRadius: BorderRadius.circular(999),
              child: Container(
                height: 6,
                color: sem.paperDeep,
                child: Stack(
                  children: [
                    FractionallySizedBox(
                      alignment: Alignment.centerLeft,
                      widthFactor: avg == null ? 0 : (avg! / 100).clamp(0.0, 1.0),
                      child: Container(color: toneColor(context, tone)),
                    ),
                  ],
                ),
              ),
            ),
          ),
          SizedBox(
            width: 46,
            child: Text(
              avg == null ? '—' : formatPoints(avg!),
              textAlign: TextAlign.right,
              style: Theme.of(context)
                  .textTheme
                  .labelMedium!
                  .copyWith(color: sem.ink, fontWeight: FontWeight.w600),
            ),
          ),
        ],
      ),
    );
  }
}

class _ScheduleItem {
  final EventType kind;
  final StudyEvent? event;
  final Todo? todo;
  final Homework? homework;
  _ScheduleItem.event(this.event) : kind = EventType.event, todo = null, homework = null;
  _ScheduleItem.todo(this.todo) : kind = EventType.study, event = null, homework = null;
  _ScheduleItem.homework(this.homework) : kind = EventType.study, event = null, todo = null;
}

class _ScheduleRow extends StatelessWidget {
  final _ScheduleItem item;
  const _ScheduleRow({required this.item});

  @override
  Widget build(BuildContext context) {
    final sem = context.sem;
    final stores = Stores.I;
    final subjects = stores.subjects.subjects;

    Widget content;
    if (item.homework != null) {
      final hw = item.homework!;
      content = Row(
        children: [
          Icon(Icons.menu_book, size: 12, color: sem.inkSoft),
          const SizedBox(width: 6),
          Expanded(child: Text(hw.title, maxLines: 1, overflow: TextOverflow.ellipsis)),
        ],
      );
    } else {
      // port of calendar/items.tsx Chip
      final Subject? subject;
      final String title;
      final String? time;
      final bool isTodo;
      final bool done;
      final EventType type;
      if (item.event != null) {
        subject = findSubject(subjects, item.event!.subjectId);
        title = item.event!.title;
        time = item.event!.time;
        isTodo = false;
        done = false;
        type = item.event!.type;
      } else {
        subject = findSubject(subjects, item.todo!.subjectId);
        title = item.todo!.title;
        final due = item.todo!.due ?? '';
        time = due.contains('T') ? due.split('T')[1] : null;
        isTodo = true;
        done = item.todo!.done;
        type = EventType.study;
      }
      final color = subject?.color ?? '#756e60';
      content = Row(
        children: [
          Container(
            width: 3,
            height: 14,
            decoration: BoxDecoration(color: colorFromHex(color), borderRadius: BorderRadius.circular(999)),
          ),
          const SizedBox(width: 6),
          Icon(
            switch (type) {
              EventType.study => Icons.menu_book_outlined,
              EventType.deadline => Icons.flag_outlined,
              EventType.exam => Icons.school_outlined,
              EventType.event => Icons.event_outlined,
            },
            size: 12,
            color: sem.inkSoft,
          ),
          if (!isTodo && time != null) ...[
            const SizedBox(width: 4),
            Text(time, style: Theme.of(context).textTheme.labelSmall),
          ],
          const SizedBox(width: 6),
          Expanded(
            child: Text(
              title,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: Theme.of(context).textTheme.bodySmall!.copyWith(
                    fontSize: 11,
                    decoration: done && isTodo ? TextDecoration.lineThrough : null,
                  ),
            ),
          ),
          if (isTodo)
            _MiniCheck(
              done: done,
              onTap: () => stores.todos.toggleTodo(item.todo!.id),
            ),
        ],
      );
    }

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 7),
      decoration: BoxDecoration(
        color: sem.card,
        border: Border.all(color: sem.line),
        borderRadius: BorderRadius.circular(8),
      ),
      child: content,
    );
  }
}

class _MiniCheck extends StatelessWidget {
  final bool done;
  final VoidCallback onTap;
  const _MiniCheck({required this.done, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final sem = context.sem;
    return InkWell(
      onTap: onTap,
      customBorder: const CircleBorder(),
      child: Container(
        width: 14,
        height: 14,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          color: done ? sem.accent : Colors.transparent,
          border: Border.all(color: done ? sem.accent : sem.ink.withValues(alpha: 0.3)),
        ),
        child: done
            ? Icon(Icons.check, size: 9, color: sem.paper)
            : const SizedBox.shrink(),
      ),
    );
  }
}
