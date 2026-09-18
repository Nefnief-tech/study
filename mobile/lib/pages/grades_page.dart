import 'package:flutter/material.dart';

import '../models/types.dart';
import '../stores/grades_store.dart' show GradeInput;
import '../stores/registry.dart';
import '../stores/subjects_store.dart' show AddSubjectInput;
import '../theme/app_theme.dart';
import '../utils/utils.dart';
import '../widgets/bits.dart';
import '../widgets/controls.dart';
import '../widgets/datetime_field.dart';

/// Port of grades/page.tsx + SubjectCard + GradeFormModal + SubjectFormModal
/// + PointsTable.

class GradesPage extends StatelessWidget {
  const GradesPage({super.key});

  @override
  Widget build(BuildContext context) {
    final stores = Stores.I;
    return Scaffold(
      backgroundColor: context.sem.paper,
      appBar: AppBar(title: const Text('Grades')),
      body: PlannerGrid(
        child: ListenableBuilder(
          listenable: Listenable.merge([stores.subjects, stores.grades]),
          builder: (context, _) {
            final sem = context.sem;
            final subjects = stores.subjects.subjects;
            final entries = stores.grades.entries;
            final overall = weightedAverage(entries);

            final bySubject = <String, List<GradeEntry>>{};
            for (final e in entries) {
              bySubject.putIfAbsent(e.subjectId ?? '', () => []).add(e);
            }
            bySubject.forEach((_, list) => list.sort((a, b) => (a.date ?? '').compareTo(b.date ?? '')));

            return SingleChildScrollView(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 40),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Punkte system (0–15) · weighted averages',
                    style: Theme.of(context).textTheme.labelMedium!.copyWith(fontSize: 12),
                  ),
                  const SizedBox(height: 8),

                  // overall
                  SemCard(
                    padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 18),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const SemLabel('overall average'),
                        Row(
                          crossAxisAlignment: CrossAxisAlignment.center,
                          children: [
                            Text(
                              overall == null ? '—' : formatPoints(overall),
                              style: Theme.of(context).textTheme.displayLarge!.copyWith(fontSize: 44),
                            ),
                            if (overall != null) ...[
                              const SizedBox(width: 6),
                              Text('Pkt.', style: TextStyle(color: sem.inkSoft, fontSize: 14)),
                              const SizedBox(width: 14),
                              GradeBadge(overall, big: true),
                            ],
                          ],
                        ),
                        const SizedBox(height: 6),
                        Text(
                          'across ${subjects.length} ${subjects.length == 1 ? 'subject' : 'subjects'} · '
                          '${entries.length} graded ${entries.length == 1 ? 'item' : 'items'}',
                          style: Theme.of(context).textTheme.labelSmall,
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 16),

                  // points table
                  PointsTableCard(),

                  const SizedBox(height: 16),
                  if (subjects.isEmpty)
                    EmptyState(
                      icon: Icons.menu_book_outlined,
                      title: 'No subjects yet',
                      hint:
                          'Subjects are shared across tasks, grades and the calendar. Create one to start tracking grades.',
                      action: SemPrimaryButton(
                        onPressed: () => _editSubject(context, null),
                        child: const Row(mainAxisSize: MainAxisSize.min, children: [
                          Icon(Icons.add, size: 16),
                          SizedBox(width: 6),
                          Text('New subject'),
                        ]),
                      ),
                    )
                  else
                    Column(
                      children: [
                        for (final s in subjects)
                          SubjectCard(
                            subject: s,
                            entries: bySubject[s.id] ?? const [],
                            onEditSubject: () => _editSubject(context, s),
                            onAddGrade: () => _editGrade(context, subjectId: s.id),
                            onEditGrade: (entry) => _editGrade(context, entry: entry),
                          ),
                      ],
                    ),
                ],
              ),
            );
          },
        ),
      ),
    );
  }

  Future<void> _editSubject(BuildContext context, Subject? subject) {
    return showSemSheet(
      context: context,
      title: subject == null ? 'New subject' : 'Edit subject',
      builder: (_) => SubjectFormSheet(subject: subject),
    );
  }

  Future<void> _editGrade(BuildContext context, {String? subjectId, GradeEntry? entry}) {
    return showSemSheet(
      context: context,
      title: entry == null ? 'Add grade' : 'Edit grade',
      builder: (_) => GradeFormSheet(subjectId: subjectId, entry: entry),
    );
  }
}

/* ---------------- Punkte → Noten table ---------------- */

class PointsTableCard extends StatelessWidget {
  const PointsTableCard({super.key});

  @override
  Widget build(BuildContext context) {
    final sem = context.sem;
    return SemCard(
      child: Theme(
        data: Theme.of(context).copyWith(dividerColor: Colors.transparent),
        child: ExpansionTile(
          tilePadding: const EdgeInsets.symmetric(horizontal: 20),
          childrenPadding: const EdgeInsets.fromLTRB(20, 0, 20, 16),
          iconColor: sem.inkSoft,
          collapsedIconColor: sem.inkSoft,
          title: Text(
            'Punkte → Noten',
            style: Theme.of(context).textTheme.titleMedium!.copyWith(fontWeight: FontWeight.w600),
          ),
          subtitle: Text(
            '0–15 translated to 6–1 with +/−',
            style: Theme.of(context).textTheme.labelSmall,
          ),
          children: [
            GridView.count(
              crossAxisCount: 4,
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              mainAxisSpacing: 6,
              crossAxisSpacing: 6,
              childAspectRatio: 1.25,
              children: [
                for (final row in POINTS_TABLE)
                  Container(
                    padding: const EdgeInsets.symmetric(vertical: 6),
                    decoration: BoxDecoration(
                      color: sem.paper,
                      border: Border.all(color: sem.line),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Text(
                          '${row.points}',
                          style: Theme.of(context).textTheme.labelLarge!.copyWith(
                                fontSize: 13,
                                color: sem.ink,
                                fontWeight: FontWeight.w600,
                              ),
                        ),
                        Text(row.grade, style: TextStyle(fontSize: 11, color: sem.accent)),
                        Text(
                          row.note,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(fontSize: 9, color: sem.inkSoft),
                        ),
                      ],
                    ),
                  ),
              ],
            ),
            const SizedBox(height: 10),
            Text(
              'every whole grade spans 3 points: 3 · 2 · 1 = 5+ · 5 · 5− — 4 points (4−) still passes, 3 points (5+) does not.',
              style: Theme.of(context).textTheme.labelSmall!.copyWith(height: 1.6),
            ),
          ],
        ),
      ),
    );
  }
}

/* ---------------- subject card ---------------- */

class SubjectCard extends StatelessWidget {
  final Subject subject;
  final List<GradeEntry> entries;
  final VoidCallback onEditSubject;
  final VoidCallback onAddGrade;
  final ValueChanged<GradeEntry> onEditGrade;

  const SubjectCard({
    super.key,
    required this.subject,
    required this.entries,
    required this.onEditSubject,
    required this.onAddGrade,
    required this.onEditGrade,
  });

  @override
  Widget build(BuildContext context) {
    final sem = context.sem;
    final avg = weightedAverage(entries);
    final wSum = weightSum(entries);
    final weightWarning = entries.isNotEmpty && wSum != 100;

    return Container(
      margin: const EdgeInsets.only(bottom: 18),
      decoration: BoxDecoration(
        color: sem.card,
        border: Border.all(color: sem.line),
        borderRadius: BorderRadius.circular(16),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // header
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 14, 12, 12),
            child: Row(
              children: [
                SubjectDot(subject.color, size: 12),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(
                    subject.name,
                    style: Theme.of(context).textTheme.headlineSmall,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
                SemIconButton(icon: Icons.edit_outlined, size: 15, onPressed: onEditSubject),
                SemIconButton(
                  icon: Icons.delete_outline,
                  size: 15,
                  onPressed: () async {
                    final ok = await confirmDialog(
                      context,
                      'Delete “${subject.name}”?'
                          '${entries.isNotEmpty ? ' This also removes its ${entries.length} grade${entries.length == 1 ? '' : 's'}.' : ''}',
                      title: 'Delete subject',
                    );
                    if (ok) Stores.I.subjects.removeSubject(subject.id);
                  },
                ),
              ],
            ),
          ),
          // average
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 0, 20, 10),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const SemLabel('Schnitt'),
                Row(
                  crossAxisAlignment: CrossAxisAlignment.center,
                  children: [
                    Text(
                      avg == null ? '—' : formatPoints(avg),
                      style: Theme.of(context).textTheme.displayMedium!.copyWith(fontSize: 34),
                    ),
                    if (avg != null) ...[
                      const SizedBox(width: 5),
                      Text('Pkt.', style: TextStyle(color: sem.inkSoft, fontSize: 12)),
                      const SizedBox(width: 12),
                      GradeBadge(avg, big: true),
                    ],
                  ],
                ),
                const SizedBox(height: 4),
                Text.rich(
                  TextSpan(
                    children: [
                      TextSpan(text: '${entries.length} ${entries.length == 1 ? 'grade' : 'grades'} · Σ weight '),
                      TextSpan(
                        text: '$wSum',
                        style: TextStyle(color: weightWarning ? sem.amber : sem.inkSoft),
                      ),
                      if (weightWarning) const TextSpan(text: ' (relative)'),
                    ],
                  ),
                  style: Theme.of(context).textTheme.labelSmall!.copyWith(fontSize: 11),
                ),
              ],
            ),
          ),
          // entries
          if (entries.isNotEmpty)
            Container(
              decoration: BoxDecoration(border: Border(top: BorderSide(color: sem.line))),
              child: Column(
                children: [
                  for (final e in entries)
                    InkWell(
                      onTap: () => onEditGrade(e),
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 10),
                        decoration: BoxDecoration(
                          border: Border(
                            bottom: BorderSide(color: sem.line.withValues(alpha: 0.6)),
                          ),
                        ),
                        child: Row(
                          children: [
                            Expanded(
                              child: Row(
                                children: [
                                  Flexible(
                                    child: Text(
                                      e.title,
                                      maxLines: 1,
                                      overflow: TextOverflow.ellipsis,
                                      style: Theme.of(context).textTheme.bodyMedium,
                                    ),
                                  ),
                                  if (e.date != null) ...[
                                    const SizedBox(width: 8),
                                    Text(
                                      e.date!.substring(5),
                                      style: Theme.of(context).textTheme.labelSmall,
                                    ),
                                  ],
                                ],
                              ),
                            ),
                            Text('${e.points} Pkt',
                                style: Theme.of(context).textTheme.labelSmall),
                            const SizedBox(width: 10),
                            SemChip(mono: true, text: '×${e.weight}'),
                            const SizedBox(width: 10),
                            Text(
                              pointsToGrade(e.points).grade,
                              style: Theme.of(context).textTheme.labelMedium!.copyWith(
                                    fontSize: 12,
                                    fontWeight: FontWeight.w600,
                                    color: toneColor(context, pointsToGrade(e.points).tone),
                                  ),
                            ),
                          ],
                        ),
                      ),
                    ),
                ],
              ),
            ),
          // add grade
          Padding(
            padding: const EdgeInsets.all(12),
            child: SemGhostButton(
              onPressed: onAddGrade,
              child: const Row(
                mainAxisSize: MainAxisSize.min,
                children: [Icon(Icons.add, size: 16), SizedBox(width: 6), Text('Add grade')],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/* ---------------- subject form ---------------- */

class SubjectFormSheet extends StatefulWidget {
  final Subject? subject;
  const SubjectFormSheet({super.key, this.subject});

  @override
  State<SubjectFormSheet> createState() => _SubjectFormSheetState();
}

class _SubjectFormSheetState extends State<SubjectFormSheet> {
  late final TextEditingController _name = TextEditingController(text: widget.subject?.name ?? '');
  late String _color = widget.subject?.color ??
      PALETTE[(DateTime.now().millisecondsSinceEpoch ~/ 1000) % PALETTE.length];
  String _error = '';

  @override
  void dispose() {
    _name.dispose();
    super.dispose();
  }

  void _submit() {
    final name = _name.text.trim();
    if (name.isEmpty) {
      setState(() => _error = 'Give the subject a name.');
      return;
    }
    final stores = Stores.I;
    if (widget.subject != null) {
      stores.subjects.updateSubject(widget.subject!.id, name: name, color: _color);
    } else {
      stores.subjects.addSubject(AddSubjectInput(name, color: _color));
    }
    Navigator.of(context).pop();
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const SemLabel('Name'),
        TextField(
          controller: _name,
          autofocus: widget.subject == null,
          decoration: const InputDecoration(hintText: 'e.g. Mathematics'),
        ),
        const SizedBox(height: 14),
        const SemLabel('Color'),
        Wrap(
          spacing: 10,
          children: [
            for (final c in PALETTE)
              InkWell(
                onTap: () => setState(() => _color = c),
                customBorder: const CircleBorder(),
                child: Container(
                  width: 32,
                  height: 32,
                  decoration: BoxDecoration(
                    color: colorFromHex(c),
                    shape: BoxShape.circle,
                    border: Border.all(
                      color: _color == c ? context.sem.ink : Colors.transparent,
                      width: 2,
                    ),
                  ),
                ),
              ),
          ],
        ),
        if (_error.isNotEmpty) ...[
          const SizedBox(height: 8),
          Text(_error, style: TextStyle(color: context.sem.marker, fontSize: 13)),
        ],
        const SizedBox(height: 18),
        Row(
          mainAxisAlignment: MainAxisAlignment.end,
          children: [
            SemGhostButton(
              onPressed: () => Navigator.of(context).pop(),
              child: const Text('Cancel'),
            ),
            const SizedBox(width: 8),
            SemPrimaryButton(onPressed: _submit, child: Text(widget.subject == null ? 'Add subject' : 'Save changes')),
          ],
        ),
      ],
    );
  }
}

/* ---------------- grade form ---------------- */

class GradeFormSheet extends StatefulWidget {
  final String? subjectId;
  final GradeEntry? entry;
  const GradeFormSheet({super.key, this.subjectId, this.entry});

  @override
  State<GradeFormSheet> createState() => _GradeFormSheetState();
}

class _GradeFormSheetState extends State<GradeFormSheet> {
  late final TextEditingController _title = TextEditingController(text: widget.entry?.title ?? '');
  late final TextEditingController _points =
      TextEditingController(text: widget.entry == null ? '' : '${widget.entry!.points}');
  late final TextEditingController _weight =
      TextEditingController(text: widget.entry == null ? '20' : '${widget.entry!.weight}');
  late String? _date = widget.entry?.date;
  String _error = '';

  @override
  void dispose() {
    _title.dispose();
    _points.dispose();
    _weight.dispose();
    super.dispose();
  }

  void _submit() {
    final title = _title.text.trim();
    final p = num.tryParse(_points.text.replaceAll(',', '.'));
    final w = num.tryParse(_weight.text.replaceAll(',', '.'));
    if (title.isEmpty) {
      setState(() => _error = 'What was graded? Add a title.');
      return;
    }
    if (p == null || p < 0 || p > 15) {
      setState(() => _error = 'Points must be between 0 and 15.');
      return;
    }
    if (w == null || w <= 0) {
      setState(() => _error = 'Weight must be a positive number.');
      return;
    }
    final stores = Stores.I;
    if (widget.entry != null) {
      stores.grades.updateEntry(
        widget.entry!.id,
        widget.entry!.copyWith(
          title: title,
          points: p,
          weight: w,
          date: _date,
        ),
        clearDate: _date == null,
      );
    } else {
      final subject = widget.subjectId ?? Stores.I.subjects.subjects.firstOrNull?.id ?? '';
      if (subject.isEmpty) {
        setState(() => _error = 'Create a subject first.');
        return;
      }
      stores.grades.addEntry(GradeInput(subject, title, points: p, weight: w, date: _date));
    }
    Navigator.of(context).pop();
  }

  @override
  Widget build(BuildContext context) {
    final sem = context.sem;
    final p = num.tryParse(_points.text.replaceAll(',', '.'));
    final preview = p != null && p >= 0 && p <= 15 ? pointsToGrade(p) : null;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const SemLabel('Title'),
        TextField(
          controller: _title,
          autofocus: widget.entry == null,
          decoration: const InputDecoration(hintText: 'e.g. Test, Abfrage, Essay'),
        ),
        const SizedBox(height: 14),
        Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const SemLabel('Punkte (0–15)'),
                  TextField(
                    controller: _points,
                    keyboardType: TextInputType.number,
                    onChanged: (_) => setState(() {}),
                    decoration: const InputDecoration(hintText: '0–15'),
                  ),
                ],
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const SemLabel('Weight'),
                  TextField(
                    controller: _weight,
                    keyboardType: TextInputType.number,
                    decoration: const InputDecoration(hintText: '20'),
                  ),
                ],
              ),
            ),
          ],
        ),
        if (preview != null) ...[
          const SizedBox(height: 6),
          Text.rich(
            TextSpan(
              text: '= ',
              children: [
                TextSpan(
                  text: preview.grade,
                  style: TextStyle(
                    color: toneColor(context, preview.tone),
                    fontWeight: FontWeight.w600,
                  ),
                ),
                TextSpan(text: ' (${preview.note})'),
              ],
            ),
            style: Theme.of(context).textTheme.labelSmall!.copyWith(fontSize: 11),
          ),
        ],
        const SizedBox(height: 14),
        const SemLabel('Date (optional)'),
        InkWell(
          onTap: () async {
            final picked = await pickDate(context, _date);
            setState(() => _date = picked);
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
                Icon(Icons.calendar_today_outlined, size: 14, color: sem.inkSoft),
                const SizedBox(width: 8),
                Text(
                  _date ?? '—',
                  style: Theme.of(context)
                      .textTheme
                      .labelMedium!
                      .copyWith(fontSize: 13, color: _date == null ? sem.inkSoft : sem.ink),
                ),
                const Spacer(),
                if (_date != null)
                  SemIconButton(
                    icon: Icons.close,
                    size: 14,
                    onPressed: () => setState(() => _date = null),
                  ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 14),
        const SemLabel('Quick pick'),
        GridView.count(
          crossAxisCount: 8,
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          mainAxisSpacing: 6,
          crossAxisSpacing: 6,
          childAspectRatio: 1.15,
          children: [
            for (var i = 15; i >= 0; i--)
              InkWell(
                onTap: () => setState(() => _points.text = '$i'),
                borderRadius: BorderRadius.circular(8),
                child: Container(
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    color: _points.text == '$i' ? sem.ink : sem.card,
                    border: Border.all(color: _points.text == '$i' ? sem.ink : sem.line),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Text(
                    '$i',
                    style: Theme.of(context).textTheme.labelMedium!.copyWith(
                          fontSize: 12,
                          color: _points.text == '$i' ? sem.paper : sem.inkSoft,
                        ),
                  ),
                ),
              ),
          ],
        ),
        if (_error.isNotEmpty) ...[
          const SizedBox(height: 8),
          Text(_error, style: TextStyle(color: sem.marker, fontSize: 13)),
        ],
        const SizedBox(height: 18),
        Row(
          children: [
            if (widget.entry != null)
              SemGhostButton(
                onPressed: () {
                  Stores.I.grades.removeEntry(widget.entry!.id);
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
            SemGhostButton(
              onPressed: () => Navigator.of(context).pop(),
              child: const Text('Cancel'),
            ),
            const SizedBox(width: 8),
            SemPrimaryButton(onPressed: _submit, child: Text(widget.entry == null ? 'Add grade' : 'Save changes')),
          ],
        ),
      ],
    );
  }
}
