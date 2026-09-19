import 'package:flutter/material.dart';

import '../models/types.dart';
import '../stores/registry.dart';
import '../services/api.dart';
import '../appwrite/sync.dart' show mirrorPortal;
import '../theme/app_theme.dart';
import '../utils/timetable_io.dart';
import '../utils/utils.dart';
import '../widgets/bits.dart';
import '../widgets/controls.dart';

/// Port of timetable/page.tsx — weekly grid + Eltern-portal substitute plan.

const _portalWeekday = {
  'Mo': 'Mon',
  'Di': 'Tue',
  'Mi': 'Wed',
  'Do': 'Thu',
  'Fr': 'Fri',
  'Sa': 'Sat',
  'So': 'Sun',
};

String _subjectColor(String name, Map<String, String> colorsByName) =>
    colorsByName[name.toLowerCase()] ?? PALETTE[name.length % PALETTE.length];

class TimetablePage extends StatefulWidget {
  const TimetablePage({super.key});

  @override
  State<TimetablePage> createState() => _TimetablePageState();
}

class _TimetablePageState extends State<TimetablePage> {
  @override
  void initState() {
    super.initState();
    // auto-fetch on first build when enabled and credentials are stored
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final p = Stores.I.portal;
      if (p.autoFetch &&
          p.baseUrl.isNotEmpty &&
          p.username.isNotEmpty &&
          p.password.isNotEmpty) {
        _fetchNow();
      }
    });
  }

  Future<void> _fetchNow() async {
    final portal = Stores.I.portal;
    if (portal.error == null &&
        portal.data != null &&
        portal.lastFetched != null)
      return;
    await doPortalFetch(context);
  }

  @override
  Widget build(BuildContext context) {
    final stores = Stores.I;
    return ListenableBuilder(
      listenable: Listenable.merge([
        stores.timetable,
        stores.portal,
        stores.subjects,
        stores.auth,
      ]),
      builder: (context, _) {
        final sem = context.sem;
        final entries = stores.timetable.entries;
        final portal = stores.portal;
        final subjects = stores.subjects.subjects;

        final colorsByName = <String, String>{
          for (final s in subjects) s.name.toLowerCase(): s.color,
        };

        final days = [
          for (final d in DAY_ORDER)
            if (entries.any((e) => e.day == d)) d,
        ];
        final periods = {...entries.map((e) => e.period)}.toList()..sort();
        final periodTime = <int, String>{};
        for (final e in entries) {
          if (e.time != null && !periodTime.containsKey(e.period)) {
            periodTime[e.period] = e.time!;
          }
        }
        final now = DateTime.now();
        final todayCol = DAY_ORDER[now.weekday == 7 ? 6 : now.weekday - 1];

        // substitute-plan entries affecting the student's own courses
        // (course codes are CASE-SENSITIVE: 2ph1 ≠ 2PH1)
        final relevantSubs = portal.data == null
            ? <PortalSub>[]
            : portal.data!.allEntries
                  .where(
                    (s) => portal.data!.courses.any(
                      (c) => c.trim() == s.course.trim(),
                    ),
                  )
                  .toList();

        return SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              PageHeader(
                title: 'Timetable',
                subtitle:
                    'paste your timetable as JSON — formatted automatically',
                trailing: entries.isNotEmpty
                    ? Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          SemGhostButton(
                            onPressed: () => _openJsonSheet(context, entries),
                            child: const Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Icon(Icons.upload_outlined, size: 15),
                                SizedBox(width: 6),
                                Text('Edit JSON'),
                              ],
                            ),
                          ),
                          const SizedBox(width: 8),
                          SemGhostButton(
                            onPressed: () async {
                              final ok = await confirmDialog(
                                context,
                                'Clear the whole timetable?',
                                title: 'Clear timetable',
                              );
                              if (ok) Stores.I.timetable.clear();
                            },
                            foreground: sem.marker,
                            border: sem.marker.withValues(alpha: 0.4),
                            child: const Icon(
                              Icons.layers_clear_outlined,
                              size: 16,
                            ),
                          ),
                        ],
                      )
                    : null,
              ),

              // portal settings + status
              PortalCard(relevantCount: relevantSubs.length),

              const SizedBox(height: 20),

              // legend
              if (relevantSubs.isNotEmpty || portal.error != null) ...[
                Wrap(
                  spacing: 14,
                  runSpacing: 4,
                  children: [
                    Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Container(
                          width: 10,
                          height: 10,
                          decoration: BoxDecoration(
                            color: sem.marker,
                            shape: BoxShape.circle,
                          ),
                        ),
                        const SizedBox(width: 5),
                        Text(
                          'cancelled',
                          style: Theme.of(context).textTheme.labelSmall,
                        ),
                      ],
                    ),
                    Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Container(
                          width: 10,
                          height: 10,
                          decoration: BoxDecoration(
                            color: sem.amber,
                            shape: BoxShape.circle,
                          ),
                        ),
                        const SizedBox(width: 5),
                        Text(
                          'substituted',
                          style: Theme.of(context).textTheme.labelSmall,
                        ),
                      ],
                    ),
                    if (relevantSubs.isNotEmpty)
                      Text(
                        '· ${relevantSubs.length} for your courses',
                        style: Theme.of(context).textTheme.labelSmall,
                      ),
                  ],
                ),
                const SizedBox(height: 10),
              ],

              // grid
              if (entries.isNotEmpty)
                ClipRRect(
                  borderRadius: BorderRadius.circular(16),
                  child: Container(
                    decoration: BoxDecoration(
                      color: sem.card,
                      border: Border.all(color: sem.line),
                      borderRadius: BorderRadius.circular(16),
                    ),
                    child: SingleChildScrollView(
                      scrollDirection: Axis.horizontal,
                      child: SizedBox(
                        width: 76.0 + days.length * 92,
                        child: Column(
                          children: [
                            // header row
                            Row(
                              children: [
                                _cellHead(
                                  context,
                                  width: 76,
                                  child: Text(
                                    'PD',
                                    style: Theme.of(context)
                                        .textTheme
                                        .labelSmall!
                                        .copyWith(letterSpacing: 1.2),
                                  ),
                                ),
                                for (final d in days)
                                  _cellHead(
                                    context,
                                    flex: true,
                                    highlight: d == todayCol,
                                    child: Row(
                                      mainAxisAlignment:
                                          MainAxisAlignment.center,
                                      children: [
                                        Text(
                                          d,
                                          style: Theme.of(context)
                                              .textTheme
                                              .titleMedium!
                                              .copyWith(
                                                fontWeight: FontWeight.w600,
                                                color: d == todayCol
                                                    ? sem.accent
                                                    : sem.ink,
                                              ),
                                        ),
                                        if (d == todayCol) ...[
                                          const SizedBox(width: 6),
                                          Text(
                                            'TODAY',
                                            style: Theme.of(context)
                                                .textTheme
                                                .labelSmall!
                                                .copyWith(
                                                  fontSize: 8,
                                                  letterSpacing: 1,
                                                ),
                                          ),
                                        ],
                                      ],
                                    ),
                                  ),
                              ],
                            ),
                            // body rows — IntrinsicHeight gives the stretch
                            // Row a bounded height (a stretch Row inside the
                            // scroll views would otherwise force infinite
                            // child heights and break the whole layout)
                            for (final p in periods)
                              IntrinsicHeight(
                                child: Row(
                                  crossAxisAlignment:
                                      CrossAxisAlignment.stretch,
                                  children: [
                                    _cellHead(
                                      context,
                                      width: 76,
                                      box: true,
                                      child: Column(
                                        mainAxisAlignment:
                                            MainAxisAlignment.center,
                                        children: [
                                          Text(
                                            '$p',
                                            style: Theme.of(context)
                                                .textTheme
                                                .labelLarge!
                                                .copyWith(
                                                  color: sem.ink,
                                                  fontWeight: FontWeight.w600,
                                                ),
                                          ),
                                          if (periodTime[p] != null)
                                            Text(
                                              periodTime[p]!.split(' - ').first,
                                              style: Theme.of(context)
                                                  .textTheme
                                                  .labelSmall!
                                                  .copyWith(fontSize: 8),
                                            ),
                                        ],
                                      ),
                                    ),
                                    for (final d in days)
                                      _cell(
                                        context,
                                        flex: true,
                                        highlight: d == todayCol,
                                        cancelled: _cellCancelled(
                                          relevantSubs,
                                          d,
                                          p,
                                          entries,
                                        ),
                                        substituted: _cellSubstituted(
                                          relevantSubs,
                                          d,
                                          p,
                                          entries,
                                        ),
                                        child: _cellContent(
                                          context,
                                          d,
                                          p,
                                          entries,
                                          relevantSubs,
                                          colorsByName,
                                        ),
                                      ),
                                  ],
                                ),
                              ),
                          ],
                        ),
                      ),
                    ),
                  ),
                )
              else
                EmptyState(
                  icon: Icons.table_chart_outlined,
                  title: 'No timetable yet',
                  hint:
                      "Paste your school's timetable as JSON and it becomes a clean weekly grid. The example shows the exact format.",
                  action: SemPrimaryButton(
                    onPressed: () => _openJsonSheet(context, entries),
                    child: const Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(Icons.upload_outlined, size: 16),
                        SizedBox(width: 6),
                        Text('Paste JSON'),
                      ],
                    ),
                  ),
                ),

              // substitutions list
              if (relevantSubs.isNotEmpty) ...[
                const SizedBox(height: 32),
                Text(
                  'Substitutions',
                  style: Theme.of(context).textTheme.headlineSmall,
                ),
                const SizedBox(height: 12),
                for (final day in portal.data?.days ?? const <PortalDay>[]) ...[
                  () {
                    final daySubs = relevantSubs
                        .where((s) => s.date == day.date)
                        .toList();
                    if (daySubs.isEmpty) return const SizedBox.shrink();
                    return Container(
                      width: double.infinity,
                      margin: const EdgeInsets.only(bottom: 14),
                      padding: const EdgeInsets.symmetric(
                        horizontal: 20,
                        vertical: 14,
                      ),
                      decoration: BoxDecoration(
                        color: sem.card,
                        border: Border.all(color: sem.line),
                        borderRadius: BorderRadius.circular(16),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            '${day.weekday}., ${day.date}',
                            style: Theme.of(
                              context,
                            ).textTheme.labelSmall!.copyWith(fontSize: 11),
                          ),
                          const SizedBox(height: 8),
                          for (final s in daySubs)
                            Padding(
                              padding: const EdgeInsets.only(bottom: 6),
                              child: Row(
                                children: [
                                  SemChip(
                                    mono: true,
                                    tone: s.cancelled ? Tone.bad : Tone.warn,
                                    text: '${s.period}.',
                                  ),
                                  const SizedBox(width: 8),
                                  Expanded(
                                    child: Wrap(
                                      crossAxisAlignment:
                                          WrapCrossAlignment.center,
                                      spacing: 6,
                                      children: [
                                        if (s.courseOld != null)
                                          Text(
                                            s.courseOld!,
                                            style: Theme.of(context)
                                                .textTheme
                                                .bodyMedium!
                                                .copyWith(
                                                  color: sem.inkSoft,
                                                  decoration: TextDecoration
                                                      .lineThrough,
                                                ),
                                          ),
                                        Text(
                                          s.course,
                                          style: Theme.of(context)
                                              .textTheme
                                              .bodyMedium!
                                              .copyWith(
                                                fontWeight: FontWeight.w500,
                                              ),
                                        ),
                                        if (!s.cancelled &&
                                            s.substitute.isNotEmpty)
                                          Text(
                                            '→ ${s.substitute}',
                                            style: TextStyle(
                                              color: sem.inkSoft,
                                            ),
                                          ),
                                        if (s.room.isNotEmpty)
                                          Text(
                                            'room ${s.room}',
                                            style: Theme.of(
                                              context,
                                            ).textTheme.labelSmall,
                                          ),
                                        if (s.info.isNotEmpty)
                                          Text(
                                            s.info,
                                            style: Theme.of(context)
                                                .textTheme
                                                .bodySmall!
                                                .copyWith(
                                                  fontSize: 11,
                                                  color: sem.inkSoft,
                                                ),
                                          ),
                                      ],
                                    ),
                                  ),
                                ],
                              ),
                            ),
                        ],
                      ),
                    );
                  }(),
                ],
              ],
            ],
          ),
        );
      },
    );
  }

  /* ---------------- cell helpers ---------------- */

  Widget _cellHead(
    BuildContext context, {
    required Widget child,
    double? width,
    bool flex = false,
    bool box = false,
    bool highlight = false,
  }) {
    final sem = context.sem;
    final Widget cell = Container(
      width: width,
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 10),
      decoration: BoxDecoration(
        color: highlight ? sem.accentSoft : sem.card,
        border: Border(
          bottom: BorderSide(color: sem.line),
          right: BorderSide(color: sem.line),
        ),
      ),
      alignment: Alignment.center,
      child: child,
    );
    return flex ? Expanded(child: cell) : cell;
  }

  Widget _cell(
    BuildContext context, {
    required Widget child,
    bool flex = false,
    bool highlight = false,
    bool cancelled = false,
    bool substituted = false,
  }) {
    final sem = context.sem;
    final Widget cell = Container(
      padding: const EdgeInsets.all(6),
      decoration: BoxDecoration(
        color: cancelled
            ? sem.marker.withValues(alpha: 0.08)
            : substituted
            ? sem.amber.withValues(alpha: 0.07)
            : highlight
            ? sem.accent.withValues(alpha: 0.06)
            : null,
        border: Border(
          bottom: BorderSide(color: sem.line),
          right: BorderSide(color: sem.line),
        ),
      ),
      alignment: Alignment.topLeft,
      child: child,
    );
    return flex ? Expanded(child: cell) : cell;
  }

  List<PortalSub> _cellSubsFor(
    List<PortalSub> subs,
    String day,
    int period,
    List<TimetableEntry> entries,
  ) {
    return subs.where((s) {
      if (_portalWeekday[s.weekday] != day) return false;
      if (int.tryParse(s.period) != period) return false;
      return entries.any(
        (e) =>
            e.day == day &&
            e.period == period &&
            (e.subject.trim() == s.course.trim() ||
                e.teacher?.trim() == s.course.trim()),
      );
    }).toList();
  }

  bool _cellCancelled(
    List<PortalSub> subs,
    String day,
    int period,
    List<TimetableEntry> entries,
  ) => _cellSubsFor(subs, day, period, entries).any((s) => s.cancelled);

  bool _cellSubstituted(
    List<PortalSub> subs,
    String day,
    int period,
    List<TimetableEntry> entries,
  ) => _cellSubsFor(subs, day, period, entries).any((s) => !s.cancelled);

  Widget _cellContent(
    BuildContext context,
    String day,
    int period,
    List<TimetableEntry> entries,
    List<PortalSub> relevantSubs,
    Map<String, String> colorsByName,
  ) {
    final sem = context.sem;
    final items = entries
        .where((e) => e.day == day && e.period == period)
        .toList();
    final cellSubs = _cellSubsFor(relevantSubs, day, period, entries);

    if (items.isEmpty && cellSubs.isEmpty) {
      return Text(
        '—',
        style: TextStyle(color: sem.inkSoft.withValues(alpha: 0.4)),
      );
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        for (final e in items)
          Padding(
            padding: const EdgeInsets.only(bottom: 5),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    SubjectDot(_subjectColor(e.subject, colorsByName), size: 9),
                    const SizedBox(width: 5),
                    Flexible(
                      child: Text(
                        e.subject,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: Theme.of(context).textTheme.bodySmall!.copyWith(
                          fontSize: 11,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                  ],
                ),
                if (e.time != null)
                  Text(
                    e.time!,
                    style: Theme.of(
                      context,
                    ).textTheme.labelSmall!.copyWith(fontSize: 8),
                  ),
                if (e.teacher != null)
                  Text(
                    e.teacher!,
                    style: Theme.of(
                      context,
                    ).textTheme.labelSmall!.copyWith(fontSize: 8),
                  ),
                if (e.room != null)
                  Text(
                    'room ${e.room}',
                    style: Theme.of(
                      context,
                    ).textTheme.labelSmall!.copyWith(fontSize: 8),
                  ),
              ],
            ),
          ),
        for (final s in cellSubs)
          Padding(
            padding: const EdgeInsets.only(bottom: 3),
            child: Text(
              s.cancelled
                  ? 'cancelled · ${s.date.substring(0, 6)}'
                  : '→ ${s.substitute.isEmpty ? '?' : s.substitute}${s.room.isEmpty ? '' : ' · ${s.room}'} · ${s.date.substring(0, 6)}',
              style: Theme.of(context).textTheme.labelSmall!.copyWith(
                fontSize: 8.5,
                color: toneColor(context, s.cancelled ? Tone.bad : Tone.warn),
              ),
            ),
          ),
      ],
    );
  }

  /* ---------------- json import sheet ---------------- */

  void _openJsonSheet(BuildContext context, List<TimetableEntry> entries) {
    final controller = TextEditingController(
      text: entries.isNotEmpty ? timetableToJson(entries) : '',
    );
    showSemSheet(
      context: context,
      title: entries.isEmpty ? 'Paste timetable JSON' : 'Edit timetable JSON',
      builder: (sheetContext) => _JsonImportBody(controller: controller),
    );
  }
}

Future<void> doPortalFetch(BuildContext context) async {
  final portal = Stores.I.portal;
  portal.setError(null);
  try {
    final plan = await SemesterApi.fetchPortalPlan();
    portal.setData(plan);
    // best-effort: plan (no credentials) into the cloud for the daily digest
    await mirrorPortal(plan);
  } on ApiException catch (e) {
    portal.setError(e.message);
  } catch (_) {
    portal.setError('Could not reach the portal.');
  }
}

/* ---------------- portal settings card ---------------- */

class PortalCard extends StatefulWidget {
  final int relevantCount;
  const PortalCard({super.key, required this.relevantCount});

  @override
  State<PortalCard> createState() => _PortalCardState();
}

class _PortalCardState extends State<PortalCard> {
  bool _open = false;
  bool _fetching = false;
  late final _url = TextEditingController(text: Stores.I.portal.baseUrl);
  late final _username = TextEditingController(text: Stores.I.portal.username);
  late final _password = TextEditingController(text: Stores.I.portal.password);

  @override
  void initState() {
    super.initState();
    _url.addListener(() => Stores.I.portal.setSettings(baseUrl: _url.text));
    _username.addListener(
      () => Stores.I.portal.setSettings(username: _username.text),
    );
    _password.addListener(
      () => Stores.I.portal.setSettings(password: _password.text),
    );
  }

  @override
  void dispose() {
    _url.dispose();
    _username.dispose();
    _password.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final portal = Stores.I.portal;
    final sem = context.sem;

    return ListenableBuilder(
      listenable: portal,
      builder: (context, _) {
        final hasSettings =
            portal.baseUrl.isNotEmpty &&
            portal.username.isNotEmpty &&
            portal.password.isNotEmpty;
        final open = _open || portal.data == null || portal.error != null;
        return SemCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              InkWell(
                onTap: () => setState(() => _open = !open),
                borderRadius: const BorderRadius.vertical(
                  top: Radius.circular(16),
                ),
                child: Padding(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 20,
                    vertical: 14,
                  ),
                  child: Row(
                    children: [
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              'Substitute plan (Vertretungsplan)',
                              style: Theme.of(context).textTheme.titleMedium!
                                  .copyWith(fontWeight: FontWeight.w600),
                            ),
                            if (portal.lastFetched != null &&
                                portal.error == null)
                              Text(
                                'fetched ${formatClock(portal.lastFetched!)}${widget.relevantCount > 0 ? ' · ${widget.relevantCount} for your courses' : ''}',
                                style: Theme.of(context).textTheme.labelSmall,
                              ),
                          ],
                        ),
                      ),
                      Icon(
                        open ? Icons.expand_less : Icons.expand_more,
                        color: sem.inkSoft,
                      ),
                    ],
                  ),
                ),
              ),
              if (open) ...[
                Container(height: 1, color: sem.line),
                Padding(
                  padding: const EdgeInsets.all(20),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      const SemLabel('Portal URL'),
                      TextField(
                        controller: _url,
                        decoration: const InputDecoration(
                          hintText: 'https://evbg.eltern-portal.org',
                        ),
                      ),
                      const SizedBox(height: 12),
                      const SemLabel('Portal email'),
                      TextField(
                        controller: _username,
                        keyboardType: TextInputType.emailAddress,
                        autocorrect: false,
                      ),
                      const SizedBox(height: 12),
                      const SemLabel('Portal password'),
                      TextField(
                        controller: _password,
                        obscureText: true,
                        autocorrect: false,
                      ),
                      const SizedBox(height: 14),
                      Row(
                        children: [
                          SizedBox(
                            height: 24,
                            width: 24,
                            child: Checkbox(
                              value: portal.autoFetch,
                              onChanged: (v) =>
                                  portal.setSettings(autoFetch: v ?? true),
                            ),
                          ),
                          const SizedBox(width: 8),
                          Expanded(
                            child: Text(
                              'fetch automatically on every visit',
                              style: Theme.of(context).textTheme.bodySmall,
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 14),
                      Align(
                        alignment: Alignment.centerRight,
                        child: SemPrimaryButton(
                          onPressed: !_fetching && hasSettings
                              ? () async {
                                  setState(() => _fetching = true);
                                  await doPortalFetch(context);
                                  if (mounted)
                                    setState(() => _fetching = false);
                                }
                              : null,
                          child: _fetching
                              ? const SizedBox(
                                  width: 14,
                                  height: 14,
                                  child: CircularProgressIndicator(
                                    strokeWidth: 2,
                                  ),
                                )
                              : const Row(
                                  mainAxisSize: MainAxisSize.min,
                                  children: [
                                    Icon(Icons.refresh, size: 16),
                                    SizedBox(width: 6),
                                    Text('Fetch now'),
                                  ],
                                ),
                        ),
                      ),
                      if (portal.error != null) ...[
                        const SizedBox(height: 10),
                        Text(
                          portal.error!,
                          style: TextStyle(color: sem.marker, fontSize: 13),
                        ),
                      ],
                      const SizedBox(height: 10),
                      Text(
                        'credentials are stored only on this device and sent only to your own server when fetching.',
                        style: Theme.of(
                          context,
                        ).textTheme.labelSmall!.copyWith(height: 1.6),
                      ),
                    ],
                  ),
                ),
              ],
            ],
          ),
        );
      },
    );
  }
}

/* ---------------- json import body ---------------- */

class _JsonImportBody extends StatefulWidget {
  final TextEditingController controller;
  const _JsonImportBody({required this.controller});

  @override
  State<_JsonImportBody> createState() => _JsonImportBodyState();
}

class _JsonImportBodyState extends State<_JsonImportBody> {
  String _error = '';
  List<String> _warnings = [];

  void _load(String raw) {
    try {
      final result = parseTimetable(raw);
      Stores.I.timetable.setTimetable(result.entries);
      setState(() {
        _warnings = result.warnings;
        _error = '';
      });
      if (result.warnings.isEmpty && context.mounted)
        Navigator.of(context).pop();
    } on FormatException catch (e) {
      setState(() {
        _error = e.message;
        _warnings = [];
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final sem = context.sem;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text(
              'each entry: day · period · subject — optional: time · teacher · room.',
              style: Theme.of(context).textTheme.labelSmall,
            ),
            SemGhostButton(
              onPressed: () {
                widget.controller.text = EXAMPLE_TIMETABLE;
                setState(() => _error = '');
              },
              child: const Text('Use example', style: TextStyle(fontSize: 12)),
            ),
          ],
        ),
        const SizedBox(height: 10),
        TextField(
          controller: widget.controller,
          maxLines: 10,
          style: Theme.of(context).textTheme.labelMedium!.copyWith(
            fontSize: 11,
            color: sem.ink,
            height: 1.5,
          ),
          autocorrect: false,
          decoration: const InputDecoration(
            hintText:
                '[{ "day": "mon", "period": 1, "subject": "Mathematics", "room": "B102" }, …]',
          ),
        ),
        const SizedBox(height: 10),
        if (_error.isNotEmpty)
          Text(_error, style: TextStyle(color: sem.marker, fontSize: 13)),
        for (final w in _warnings)
          Text('• $w', style: TextStyle(color: sem.amber, fontSize: 11)),
        const SizedBox(height: 14),
        Align(
          alignment: Alignment.centerRight,
          child: SemPrimaryButton(
            onPressed: () => _load(widget.controller.text),
            child: const Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(Icons.upload_outlined, size: 16),
                SizedBox(width: 6),
                Text('Format timetable'),
              ],
            ),
          ),
        ),
      ],
    );
  }
}
