import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'pages/shell.dart';
import 'services/links.dart';
import 'services/push.dart';
import 'stores/registry.dart';
import 'theme/app_theme.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // hydrate all stores from SharedPreferences (zustand-persist equivalent)
  final prefs = await SharedPreferences.getInstance();
  await Stores.I.loadAll(prefs);

  // push: Firebase init is optional — without google-services.json every call
  // is guarded and the app simply runs local-only
  try {
    FirebaseMessaging.onBackgroundMessage(semesterFirebaseMessagingHandler);
  } catch (_) {}
  runApp(const SemesterApp());
  unawaitedStartup();
}

Future<void> unawaitedStartup() async {
  await PushService.init();
  await SemesterLinks.init();
}

class SemesterApp extends StatelessWidget {
  const SemesterApp({super.key});

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: Stores.I.theme,
      builder: (context, _) {
        final dark = Stores.I.theme.dark;
        return MaterialApp(
          title: 'Semester',
          debugShowCheckedModeBanner: false,
          theme: buildSemesterTheme(dark: false),
          darkTheme: buildSemesterTheme(dark: true),
          themeMode: dark == null
              ? ThemeMode.system
              : (dark ? ThemeMode.dark : ThemeMode.light),
          home: const AppShell(),
        );
      },
    );
  }
}
