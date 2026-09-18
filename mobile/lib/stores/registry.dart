import 'package:shared_preferences/shared_preferences.dart';

import 'auth_store.dart';
import 'events_store.dart';
import 'grades_store.dart';
import 'homework_store.dart';
import 'portal_store.dart';
import 'settings_store.dart';
import 'studyroom_store.dart';
import 'subjects_store.dart';
import 'timetable_store.dart';
import 'todos_store.dart';

/// Registry mirroring the web app's store imports — one instance each, created
/// at startup and hydrated from SharedPreferences before the first frame.
class Stores {
  Stores._();
  static final Stores I = Stores._();

  final subjects = SubjectsStore();
  final todos = TodosStore();
  final homework = HomeworkStore();
  final grades = GradesStore();
  final events = EventsStore();
  final timetable = TimetableStore();
  final studyroom = StudyroomStore();
  final portal = PortalStore();
  final syncMeta = SyncMetaStore();
  final theme = ThemeStore();
  final settings = SettingsStore();
  final auth = AuthStore();

  Future<void> loadAll(SharedPreferences prefs) async {
    await subjects.load(prefs);
    await todos.load(prefs);
    await homework.load(prefs);
    await grades.load(prefs);
    await events.load(prefs);
    await timetable.load(prefs);
    await studyroom.load(prefs);
    await portal.load(prefs);
    await syncMeta.load(prefs);
    await settings.load(prefs);
    await theme.load(prefs);
  }
}
