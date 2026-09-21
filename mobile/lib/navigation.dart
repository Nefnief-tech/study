import 'package:flutter/foundation.dart';

/// tab indices — shared by the shell, push tap-through and deeplinks
const int kTabOverview = 0;
const int kTabTasks = 1;
const int kTabTimetable = 2;
const int kTabCalendar = 3;
const int kTabStudy = 4;

/// simple navigation bus: tab pages jump to other destinations through it,
/// and push taps (`data.route`) and deeplinks (`semester://<route>`) land on
/// the page they name. Pure tab switches work any time; Navigator-backed
/// destinations queue until the shell has wired its callbacks.
class AppNav {
  AppNav._();
  static final AppNav I = AppNav._();

  final ValueNotifier<int> tab = ValueNotifier(kTabOverview);
  void Function()? openHomework;
  void Function()? openGrades;
  void Function()? openAccount;

  bool _shellReady = false;
  String? _pendingRoute;

  /// the shell calls this once its Navigator-backed callbacks are wired —
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
      case 'homework':
      case 'grades':
      case 'account':
        if (!_shellReady) {
          _pendingRoute = route;
          return;
        }
        if (route == 'homework') {
          openHomework?.call();
        } else if (route == 'grades') {
          openGrades?.call();
        } else {
          openAccount?.call();
        }
      case 'tasks':
        tab.value = kTabTasks;
      case 'timetable':
        tab.value = kTabTimetable;
      case 'calendar':
        tab.value = kTabCalendar;
      case 'study':
        tab.value = kTabStudy;
      case 'overview':
      case 'home':
        tab.value = kTabOverview;
    }
  }
}
