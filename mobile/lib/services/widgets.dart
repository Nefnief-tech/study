import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart' show Listenable;
import 'package:home_widget/home_widget.dart';
import 'package:flutter/widgets.dart' show WidgetsBinding, Brightness;

import '../models/types.dart';
import '../stores/registry.dart';
import '../utils/utils.dart';

/// Home-screen widgets (native Android AppWidgets): whenever the underlying
/// stores change, a compact JSON payload is written to SharedPreferences and
/// Android is told to redraw. The native providers live in
/// android/app/src/main/kotlin/.../widgets/ and read the same keys.
class SemesterWidgets {
  SemesterWidgets._();
  static const _androidPackage = 'com.semesterapp.semester';
  static Timer? _debounce;
  static bool _listening = false;

  /// attach store listeners — call once from the shell's initState
  static void init() {
    if (_listening) return;
    _listening = true;
    for (final Listenable l in [
      Stores.I.todos,
      Stores.I.homework,
      Stores.I.events,
      Stores.I.timetable,
      Stores.I.subjects,
      Stores.I.theme,
    ]) {
      l.addListener(_schedule);
    }
    unawaited(refresh());
  }

  static void _schedule() {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 600), () {
      unawaited(refresh());
    });
  }

  static Future<void> refresh() async {
    try {
      final stores = Stores.I;
      final dark = stores.theme.dark ??
          (WidgetsBinding
                      .instance.platformDispatcher.platformBrightness ==
                  Brightness.dark);

      // ---- agenda: homework · tasks · events, soonest first ----
      final now = DateTime.now();
      final horizon = now.add(const Duration(days: 14));
      final agenda = <Map<String, dynamic>>[];
      for (final hw in stores.homework.homeworks.where((h) => !h.done)) {
        final d = DateTime.tryParse(hw.due ?? '');
        if (d == null || d.isBefore(now.subtract(const Duration(days: 1)))) {
          continue;
        }
        agenda.add({
          'tag': 'HW',
          'title': hw.title,
          'meta': dueInfo(hw.due)?.label ?? '',
          'overdue': d.isBefore(now),
          'sort': d.millisecondsSinceEpoch,
        });
      }
      for (final t in stores.todos.todos.where((t) => !t.done)) {
        final d = DateTime.tryParse(t.due ?? '');
        if (d == null || d.isBefore(now.subtract(const Duration(days: 1)))) {
          continue;
        }
        agenda.add({
          'tag': 'TSK',
          'title': t.title,
          'meta': dueInfo(t.due)?.label ?? '',
          'overdue': d.isBefore(now),
          'sort': d.millisecondsSinceEpoch,
        });
      }
      for (final e in stores.events.events) {
        final d = DateTime.tryParse('${e.date}T${(e.time ?? '00:00').padLeft(5, '0')}');
        if (d == null || d.isBefore(now.subtract(const Duration(days: 1))) || d.isAfter(horizon)) {
          continue;
        }
        agenda.add({
          'tag': e.type == EventType.exam ? 'EXAM' : 'CAL',
          'title': e.title,
          'meta': dueInfo(e.date)?.label ?? '',
          'overdue': false,
          'sort': d.millisecondsSinceEpoch,
        });
      }
      agenda.sort((a, b) => (a['sort'] as int).compareTo(b['sort'] as int));

      // ---- timetable: today's lessons ----
      const dayKeys = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
      final todayKey = dayKeys[now.weekday - 1];
      final lessons = stores.timetable.entries
          .where((e) => e.day == todayKey)
          .toList()
        ..sort((a, b) => a.period.compareTo(b.period));

      await HomeWidget.saveWidgetData<String>(
        'agenda',
        jsonEncode({
          'items': agenda.take(6).map(_agendaItem).toList(),
          'total': agenda.length,
        }),
      );
      await HomeWidget.saveWidgetData<String>(
        'timetable',
        jsonEncode({
          'day': todayKey,
          'items': [
            for (final e in lessons.take(8))
              {
                'period': '${e.period}',
                'time': (e.time ?? '').split('-').first.trim(),
                'subject': e.subject,
                'room': e.room ?? '',
              }
          ],
        }),
      );
      await HomeWidget.saveWidgetData<bool>('dark', dark);

      await HomeWidget.updateWidget(
        qualifiedAndroidName: '$_androidPackage.widgets.AgendaWidgetProvider',
      );
      await HomeWidget.updateWidget(
        qualifiedAndroidName: '$_androidPackage.widgets.TimetableWidgetProvider',
      );
    } catch (_) {
      // widgets are decorative — never let them break the app
    }
  }

  static Map<String, dynamic> _agendaItem(Map<String, dynamic> item) => {
        'tag': item['tag'],
        'title': item['title'],
        'meta': item['meta'],
        'overdue': item['overdue'],
      };
}
