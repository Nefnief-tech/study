import 'package:flutter/foundation.dart';

/// tab indices — the bottom bar order; shared by the shell, push
/// tap-through and deeplinks
const int kTabOverview = 0;
const int kTabTasks = 1;
const int kTabHomework = 2;
const int kTabTimetable = 3;
const int kTabCalendar = 4;
const int kTabGrades = 5;
const int kTabStudy = 6;
const int kTabSettings = 7;

/// simple navigation bus: push taps (`data.route`) and deeplinks
/// (`semester://<route>`) land on the page they name — every destination is
/// a tab now, so handling is a pure tab switch that works from app start
class AppNav {
  AppNav._();
  static final AppNav I = AppNav._();

  final ValueNotifier<int> tab = ValueNotifier(kTabOverview);

  /// land on the destination a push payload or deeplink names
  void handle(String route) {
    switch (route) {
      case 'homework':
        tab.value = kTabHomework;
      case 'grades':
        tab.value = kTabGrades;
      case 'account':
      case 'settings':
        tab.value = kTabSettings;
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
