import 'package:flutter/foundation.dart';

/// tab indices — the five bottom-bar slots
const int kTabOverview = 0;
const int kTabTasks = 1;
const int kTabHomework = 2;
const int kTabTimetable = 3;
const int kTabMore = 4;

/// simple navigation bus: bottom-bar taps switch tabs, while push taps
/// (`data.route`) and deeplinks (`semester://<route>`) land on the page they
/// name — main destinations switch tabs, overflow destinations (calendar,
/// grades, study, settings) are pushed onto the navigator by the shell's
/// callbacks so the system back gesture pops them naturally. Routes that
/// arrive before the shell wired its callbacks are queued.
class AppNav {
  AppNav._();
  static final AppNav I = AppNav._();

  final ValueNotifier<int> tab = ValueNotifier(kTabOverview);

  /// wired by the shell — push a full-screen page for the overflow tabs
  void Function()? openCalendar;
  void Function()? openGrades;
  void Function()? openStudy;
  void Function()? openSettings;

  bool _shellReady = false;
  String? _pendingRoute;

  /// the shell calls this (post-frame) once its callbacks + navigator exist —
  /// anything queued before that point is delivered here
  void markShellReady() {
    _shellReady = true;
    final pending = _pendingRoute;
    if (pending != null) {
      _pendingRoute = null;
      handle(pending);
    }
  }

  /// land on the destination a push payload or deeplink names
  void handle(String route) {
    switch (route) {
      case 'calendar':
        if (openCalendar != null) openCalendar?.call();
        _queueUnlessReady(route);
      case 'grades':
        if (openGrades != null) openGrades?.call();
        _queueUnlessReady(route);
      case 'study':
        if (openStudy != null) openStudy?.call();
        _queueUnlessReady(route);
      case 'settings':
      case 'account':
        if (openSettings != null) openSettings?.call();
        _queueUnlessReady(route);
      case 'homework':
        tab.value = kTabHomework;
      case 'tasks':
        tab.value = kTabTasks;
      case 'timetable':
        tab.value = kTabTimetable;
      case 'overview':
      case 'home':
        tab.value = kTabOverview;
    }
  }

  void _queueUnlessReady(String route) {
    if (!_shellReady) _pendingRoute = route;
  }
}
