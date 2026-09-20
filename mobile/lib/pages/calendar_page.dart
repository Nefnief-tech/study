import 'dart:async';

import 'package:flutter/material.dart';

import '../models/types.dart';
import '../stores/events_store.dart' show EventInput;
import '../stores/registry.dart';
import '../theme/app_theme.dart';
import '../utils/utils.dart';
import '../widgets/bits.dart';
import '../widgets/controls.dart';
import '../widgets/datetime_field.dart';
import '../widgets/subject_select.dart';

/// Port of calendar/page.tsx + calendar/items.tsx + EventFormModal.tsx.

const _weekdayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const _typeIcons = {
  EventType.study: Icons.menu_book_outlined,
  EventType.deadline: Icons.flag_outlined,
  EventType.exam: Icons.school_outlined,
  EventType.event: Icons.event_outlined,
};

const _typeLabels = {
  EventType.study: 'Study session',
  EventType.deadline: 'Deadline',
  EventType.exam: 'Exam',
  EventType.event: 'Event',
};

class CalendarItem {
  final StudyEvent? event;
  final Todo? todo;
  final String? time;
  const CalendarItem.event(this.event, this.time) : todo = null;
  const CalendarItem.todo(this.todo, this.time) : event = null;

  String get id => event?.id ?? todo!.id;
}

List<CalendarItem> _itemsForDay(List<StudyEvent> events, List<Todo> todos, String dayKey) {
  final items = <CalendarItem>[];
  for (final e in events) {
    if (e.date != dayKey) continue;
    items.add(CalendarItem.event(e, e.time));
  }
  for (final t in todos) {
    final due = t.due;
    if (due == null || !due.startsWith(dayKey)) continue;
    items.add(CalendarItem.todo(t, due.contains('T') ? due.split('T')[1] : null));
  }
  items.sort((a, b) => (a.time ?? '99:99').compareTo(b.time ?? '99:99'));
  return items;
}

class CalendarPage extends StatefulWidget {
  const CalendarPage({super.key});

  @override
  State<CalendarPage> createState() => _CalendarPageState();
}

class _CalendarPageState extends State<CalendarPage> {
  bool _monthView = true;
  late DateTime _cursor = DateTime.now();

  DateTime _weekStart(DateTime d) => d.subtract(Duration(days: d.weekday - 1));

  void _move(int dir) {
    setState(() {
      if (_monthView) {
        _cursor = DateTime(_cursor.year, _cursor.month + dir, 1);
      } else {
        _cursor = _cursor.add(Duration(days: dir * 7));
      }
    });
  }

  String get _rangeLabel {
    if (_monthView) {
      const months = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December',
      ];
      return '${months[_cursor.month - 1]} ${_cursor.year}';
    }
    final start = _weekStart(_cursor);
    final end = start.add(const Duration(days: 6));
    return '${formatDayMonth(start)} – ${formatDayMonth(end)} ${end.year}';
  }

  @override
  Widget build(BuildContext context) {
    final stores = Stores.I;
    return ListenableBuilder(
      listenable: Listenable.merge([stores.events, stores.todos, stores.subjects]),
      builder: (context, _) {
        final sem = context.sem;
        final events = stores.events.events;
        final todos = stores.todos.todos;

        // month grid: 6 weeks starting Monday
        final monthStart = _monthStart(_cursor);
        final monthDays =
            List.generate(42, (i) => monthStart.add(Duration(days: i)));
        final weekDays =
            List.generate(7, (i) => _weekStart(_cursor).add(Duration(days: i)));

        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 0),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  PageHeader(
                    title: _rangeLabel,
                    subtitle: 'deadlines, sessions & task due dates',
                    trailing: SemPrimaryButton(
                      onPressed: () => _openForm(context),
                      child: const Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [Icon(Icons.add, size: 16), SizedBox(width: 6), Text('New entry')],
                      ),
                    ),
                  ),
                  Row(
                    children: [
                      // prev / today / next
                      Container(
                        decoration: BoxDecoration(
                          color: sem.card,
                          border: Border.all(color: sem.line),
                          borderRadius: BorderRadius.circular(10),
                        ),
                        child: Row(
                          children: [
                            SemIconButton(
                              icon: Icons.chevron_left,
                              onPressed: () => _move(-1),
                            ),
                            InkWell(
                              onTap: () => setState(() => _cursor = DateTime.now()),
                              child: Padding(
                                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                                child: Text(
                                  'Today'.toUpperCase(),
                                  style: Theme.of(context)
                                      .textTheme
                                      .labelSmall!
                                      .copyWith(letterSpacing: 1),
                                ),
                              ),
                            ),
                            SemIconButton(
                              icon: Icons.chevron_right,
                              onPressed: () => _move(1),
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(width: 8),
                      SegToggle<bool>(
                        options: const [(true, 'month'), (false, 'week')],
                        selected: _monthView,
                        onChanged: (v) => setState(() => _monthView = v),
                      ),
                    ],
                  ),
                  const SizedBox(height: 10),
                  Wrap(
                    spacing: 12,
                    runSpacing: 4,
                    children: [
                      for (final t in EventType.values)
                        Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Icon(_typeIcons[t]!, size: 12, color: sem.inkSoft),
                            const SizedBox(width: 4),
                            Text(
                              _typeLabels[t]!.toUpperCase(),
                              style: Theme.of(context)
                                  .textTheme
                                  .labelSmall!
                                  .copyWith(fontSize: 9, letterSpacing: 0.8),
                            ),
                          ],
                        ),
                      Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(Icons.flag_outlined, size: 12, color: sem.inkSoft),
                          const SizedBox(width: 4),
                          Text(
                            'DUE TASKS APPEAR AUTOMATICALLY',
                            style: Theme.of(context)
                                .textTheme
                                .labelSmall!
                                .copyWith(fontSize: 9, letterSpacing: 0.8),
                          ),
                        ],
                      ),
                    ],
                  ),
                ],
              ),
            ),
            const SizedBox(height: 12),
            Expanded(
              child: _monthView
                  ? _buildMonth(context, events, todos, monthDays)
                  : _buildWeek(context, events, todos, weekDays),
            ),
          ],
        );
      },
    );
  }

  DateTime _monthStart(DateTime cursor) {
    final first = DateTime(cursor.year, cursor.month, 1);
    return first.subtract(Duration(days: first.weekday - 1));
  }

  Widget _buildMonth(BuildContext context, List<StudyEvent> events, List<Todo> todos,
      List<DateTime> days) {
    final sem = context.sem;
    final todayKey = toDayKey(DateTime.now());
    return Column(
      children: [
        Row(
          children: [
            for (final d in _weekdayLabels)
              Expanded(
                child: Text(
                  d.substring(0, 1),
                  textAlign: TextAlign.center,
                  style: Theme.of(context)
                      .textTheme
                      .labelSmall!
                      .copyWith(fontSize: 10, letterSpacing: 1),
                ),
              ),
          ],
        ),
        Container(height: 1, color: sem.line, margin: const EdgeInsets.only(top: 6)),
        Expanded(
          child: GridView.builder(
            padding: EdgeInsets.zero,
            gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
              crossAxisCount: 7,
              childAspectRatio: 0.62,
            ),
            itemCount: 42,
            itemBuilder: (context, i) {
              final day = days[i];
              final inMonth = day.month == _cursor.month;
              final dayKey = toDayKey(day);
              final items = _itemsForDay(events, todos, dayKey);
              final isToday = dayKey == todayKey;

              return InkWell(
                onTap: () => _openForm(context, date: dayKey),
                child: Container(
                  padding: const EdgeInsets.all(3),
                  decoration: BoxDecoration(
                    border: Border(
                      right: BorderSide(color: sem.line.withValues(alpha: 0.7)),
                      bottom: BorderSide(color: sem.line.withValues(alpha: 0.7)),
                    ),
                    color: !inMonth ? sem.paperDeep.withValues(alpha: 0.5) : null,
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Container(
                        width: 20,
                        height: 20,
                        alignment: Alignment.center,
                        decoration: isToday
                            ? BoxDecoration(color: sem.accent, shape: BoxShape.circle)
                            : null,
                        child: Text(
                          '${day.day}',
                          style: Theme.of(context).textTheme.labelSmall!.copyWith(
                                fontSize: 11,
                                fontWeight: isToday ? FontWeight.w600 : FontWeight.w400,
                                color: isToday
                                    ? sem.paper
                                    : (inMonth ? sem.inkSoft : sem.inkSoft.withValues(alpha: 0.5)),
                              ),
                        ),
                      ),
                      const SizedBox(height: 2),
                      // up to 2 colored item bars
                      for (final item in items.take(2))
                        Container(
                          height: 5,
                          margin: const EdgeInsets.only(bottom: 2),
                          decoration: BoxDecoration(
                            color: _itemColor(context, item),
                            borderRadius: BorderRadius.circular(2),
                          ),
                        ),
                      if (items.length > 2)
                        Text(
                          '+${items.length - 2}',
                          style: Theme.of(context)
                              .textTheme
                              .labelSmall!
                              .copyWith(fontSize: 8),
                        ),
                    ],
                  ),
                ),
              );
            },
          ),
        ),
        // hint
        Container(
          width: double.infinity,
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
          decoration: BoxDecoration(color: sem.paper, border: Border(top: BorderSide(color: sem.line))),
          child: Text(
            'Tap a day to schedule · open an entry from the week view or dashboard',
            style: Theme.of(context).textTheme.labelSmall!.copyWith(fontSize: 10),
          ),
        ),
      ],
    );
  }

  Color _itemColor(BuildContext context, CalendarItem item) => _itemColorOf(context, item);

  Widget _buildWeek(
      BuildContext context, List<StudyEvent> events, List<Todo> todos, List<DateTime> days) {
    final sem = context.sem;
    final todayKey = toDayKey(DateTime.now());
    return ListView.builder(
      padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
      itemCount: 7,
      itemBuilder: (context, i) {
        final day = days[i];
        final dayKey = toDayKey(day);
        final items = _itemsForDay(events, todos, dayKey);
        final isToday = dayKey == todayKey;

        return Container(
          margin: const EdgeInsets.only(bottom: 12),
          decoration: BoxDecoration(
            color: sem.card,
            border: Border.all(color: sem.line),
            borderRadius: BorderRadius.circular(12),
          ),
          child: InkWell(
            onTap: () => _openForm(context, date: dayKey),
            borderRadius: BorderRadius.circular(12),
            child: Column(
              children: [
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                  decoration: BoxDecoration(
                    color: isToday ? sem.accentSoft : null,
                    border: Border(bottom: BorderSide(color: sem.line)),
                    borderRadius: BorderRadius.vertical(
                      top: const Radius.circular(12),
                    ),
                  ),
                  child: Row(
                    children: [
                      Text(
                        _weekdayLabels[i].toUpperCase(),
                        style: Theme.of(context)
                            .textTheme
                            .labelSmall!
                            .copyWith(letterSpacing: 1.2),
                      ),
                      const Spacer(),
                      Container(
                        width: 20,
                        height: 20,
                        alignment: Alignment.center,
                        decoration:
                            isToday ? BoxDecoration(color: sem.accent, shape: BoxShape.circle) : null,
                        child: Text(
                          '${day.day}',
                          style: Theme.of(context).textTheme.labelMedium!.copyWith(
                                fontSize: 12,
                                fontWeight: isToday ? FontWeight.w600 : FontWeight.w400,
                                color: isToday ? sem.paper : null,
                              ),
                        ),
                      ),
                    ],
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.all(8),
                  child: Column(
                    children: [
                      for (final item in items)
                        Padding(
                          padding: const EdgeInsets.only(bottom: 6),
                          child: CalendarChip(
                            item: item,
                            onTap: () {
                              if (item.event != null) {
                                _openForm(context, event: item.event);
                              } else {
                                Stores.I.todos.toggleTodo(item.todo!.id);
                              }
                            },
                          ),
                        ),
                      if (items.isEmpty)
                        Padding(
                          padding: const EdgeInsets.symmetric(vertical: 6),
                          child: Text(
                            'free',
                            style: Theme.of(context)
                                .textTheme
                                .labelSmall!
                                .copyWith(fontSize: 10),
                          ),
                        ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  Future<void> _openForm(BuildContext context, {String? date, StudyEvent? event}) {
    return showSemSheet(
      context: context,
      title: event == null ? 'New entry' : 'Edit entry',
      builder: (_) => EventFormSheet(date: date, event: event),
    );
  }
}

Color _itemColorOf(BuildContext context, CalendarItem item) {
  final subjects = Stores.I.subjects.subjects;
  final subjectId = item.event?.subjectId ?? item.todo?.subjectId;
  return colorFromHex(findSubject(subjects, subjectId)?.color ?? '#756e60');
}

/// port of the calendar Chip — colored bar + type icon + time + title
class CalendarChip extends StatelessWidget {
  final CalendarItem item;
  final VoidCallback onTap;
  const CalendarChip({super.key, required this.item, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final sem = context.sem;
    final color = _itemColorOf(context, item);

    final bool isTodo = item.event == null;
    final bool done = isTodo && item.todo!.done;
    final String title = isTodo ? item.todo!.title : item.event!.title;
    final EventType type = isTodo ? EventType.study : item.event!.type;
    final String? time = item.time;

    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(8),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
        decoration: BoxDecoration(
          color: sem.card,
          border: Border.all(color: sem.line),
          borderRadius: BorderRadius.circular(8),
        ),
        child: Row(
          children: [
            Container(
              width: 3,
              height: 15,
              decoration:
                  BoxDecoration(color: color, borderRadius: BorderRadius.circular(999)),
            ),
            const SizedBox(width: 6),
            if (isTodo)
              Container(
                width: 13,
                height: 13,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: done ? sem.accent : Colors.transparent,
                  border: Border.all(color: done ? sem.accent : sem.ink.withValues(alpha: 0.3)),
                ),
                child: done ? Icon(Icons.check, size: 8, color: sem.paper) : const SizedBox.shrink(),
              )
            else
              Icon(_typeIcons[type], size: 13, color: sem.inkSoft),
            if (time != null) ...[
              const SizedBox(width: 5),
              Text(time, style: Theme.of(context).textTheme.labelSmall!.copyWith(fontSize: 10)),
            ],
            const SizedBox(width: 6),
            Expanded(
              child: Text(
                title,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: Theme.of(context).textTheme.bodySmall!.copyWith(
                      fontSize: 11,
                      decoration: done ? TextDecoration.lineThrough : null,
                      color: done ? sem.inkSoft : null,
                    ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/* ---------------- event form ---------------- */

class EventFormSheet extends StatefulWidget {
  final String? date;
  final StudyEvent? event;
  const EventFormSheet({super.key, this.date, this.event});

  @override
  State<EventFormSheet> createState() => _EventFormSheetState();
}

class _EventFormSheetState extends State<EventFormSheet> {
  late final TextEditingController _title = TextEditingController(text: widget.event?.title ?? '');
  late final TextEditingController _notes = TextEditingController(text: widget.event?.notes ?? '');
  late EventType _type = widget.event?.type ?? EventType.study;
  late String? _day = widget.event?.date ?? widget.date;
  late String? _time = widget.event?.time;
  late String? _subjectId = widget.event?.subjectId;
  // auto-save: text edits commit debounced, discrete picks immediately —
  // the sheet can be dismissed at any moment without losing input
  Timer? _debounce;
  bool _dirty = false;
  String? _createdId;

  String? get _targetId => widget.event?.id ?? _createdId;

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
  /// back to "Untitled"/today when content exists but title/date are missing
  void _commit({bool relaxed = false}) {
    final title = _title.text.trim();
    final notes = _notes.text.trim();
    final isCreate = widget.event == null && _createdId == null;
    final hasExtras =
        notes.isNotEmpty || _time != null || _subjectId != null || _type != EventType.study;
    final t = title.isEmpty && relaxed && isCreate && hasExtras ? 'Untitled' : title;
    if (t.isEmpty) return; // nothing to create yet / emptied title keeps its last value
    final day = (_day == null || _day!.isEmpty)
        ? (relaxed && isCreate ? toDayKey(DateTime.now()) : null)
        : _day;
    if (day == null || day.isEmpty) return;
    final stores = Stores.I;
    if (_targetId != null) {
      StudyEvent? current;
      for (final x in stores.events.events) {
        if (x.id == _targetId) current = x;
      }
      if (current == null) return;
      stores.events.updateEvent(
        current.id,
        current.copyWith(
          title: t,
          date: day,
          time: _time,
          type: _type,
          subjectId: _subjectId,
          notes: notes.isEmpty ? null : notes,
        ),
        clearTime: _time == null,
        clearSubject: _subjectId == null,
        clearNotes: notes.isEmpty,
      );
    } else {
      _createdId = stores.events.addEvent(EventInput(
        t,
        date: day,
        time: _time,
        type: _type,
        subjectId: _subjectId,
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
          autofocus: widget.event == null,
          onChanged: (_) => _commitSoon(),
          decoration: const InputDecoration(hintText: 'e.g. Library session, History midterm…'),
        ),
        const SizedBox(height: 14),
        Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const SemLabel('Date'),
                  _pickerField(
                    context,
                    icon: Icons.calendar_today_outlined,
                    label: _day ?? '—',
                    onTap: () async {
                      final picked = await pickDate(context, _day);
                      if (picked != null && picked != _day) {
                        setState(() => _day = picked);
                        _commitNow();
                      }
                    },
                  ),
                ],
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const SemLabel('Time (optional)'),
                  _pickerField(
                    context,
                    icon: Icons.schedule,
                    label: _time ?? '—',
                    onTap: () async {
                      final picked = await pickTime(context, _time);
                      if (picked != null && picked != _time) {
                        setState(() => _time = picked);
                        _commitNow();
                      }
                    },
                  ),
                ],
              ),
            ),
          ],
        ),
        const SizedBox(height: 14),
        const SemLabel('Type'),
        Wrap(
          spacing: 6,
          runSpacing: 6,
          children: [
            for (final t in EventType.values)
              InkWell(
                onTap: () {
                  setState(() => _type = t);
                  _commitNow();
                },
                borderRadius: BorderRadius.circular(10),
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 9),
                  decoration: BoxDecoration(
                    color: _type == t ? sem.ink : sem.card,
                    border: Border.all(color: _type == t ? sem.ink : sem.line),
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: Text(
                    _typeLabels[t]!,
                    style: Theme.of(context).textTheme.bodySmall!.copyWith(
                          fontSize: 12,
                          fontWeight: FontWeight.w500,
                          color: _type == t ? sem.paper : sem.inkSoft,
                        ),
                  ),
                ),
              ),
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
          maxLines: 4,
          onChanged: (_) => _commitSoon(),
          decoration: const InputDecoration(hintText: 'Room, materials to bring…'),
        ),
        const SizedBox(height: 18),
        Row(
          children: [
            if (widget.event != null)
              SemGhostButton(
                onPressed: () {
                  _debounce?.cancel();
                  _dirty = false;
                  Stores.I.events.removeEvent(widget.event!.id);
                  Navigator.of(context).pop();
                },
                foreground: sem.marker,
                border: sem.marker.withValues(alpha: 0.4),
                child: const Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [Icon(Icons.delete_outline, size: 16), SizedBox(width: 6), Text('Delete')],
                ),
              ),
            const Spacer(),
            if (widget.event == null)
              Text(
                'Saves automatically',
                style: Theme.of(context)
                    .textTheme
                    .labelSmall!
                    .copyWith(color: sem.inkSoft),
              ),
            const SizedBox(width: 10),
            SemPrimaryButton(onPressed: _flushAndClose, child: const Text('Done')),
          ],
        ),
      ],
    );
  }

  Widget _pickerField(
    BuildContext context, {
    required IconData icon,
    required String label,
    required VoidCallback onTap,
  }) {
    final sem = context.sem;
    return InkWell(
      onTap: onTap,
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
            Icon(icon, size: 14, color: sem.inkSoft),
            const SizedBox(width: 8),
            Expanded(
              child: Text(
                label,
                style: Theme.of(context)
                    .textTheme
                    .labelMedium!
                    .copyWith(fontSize: 13, color: label == '—' ? sem.inkSoft : sem.ink),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
