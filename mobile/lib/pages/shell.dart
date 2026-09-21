import 'package:flutter/material.dart';

import '../appwrite/sync.dart';
import '../services/api.dart';
import '../services/push.dart';
import '../stores/auth_store.dart' show SyncStatus;
import '../stores/registry.dart';
import '../theme/app_theme.dart';
import '../widgets/auth_sheet.dart';
import '../widgets/controls.dart';
import 'calendar_page.dart';
import 'dashboard_page.dart';
import 'grades_page.dart';
import 'homework_page.dart';
import 'study_room_page.dart';
import 'timetable_page.dart';
import 'todos_page.dart';

/// simple navigation bus so tab pages can jump to other destinations
/// (the web app uses <Link>; the Flutter shell wires these at startup)
class AppNav {
  AppNav._();
  static final AppNav I = AppNav._();
  final ValueNotifier<int> tab = ValueNotifier(0);
  void Function()? openHomework;
  void Function()? openGrades;
  void Function()? openAccount;
}

/// Port of AppShell.tsx for phones: the 7 web destinations split into a
/// 5-slot bottom bar (Overview · Tasks · Timetable · Calendar · Study Room)
/// plus Homework/Grades/Account in the top-bar menu.
class AppShell extends StatefulWidget {
  const AppShell({super.key});

  @override
  State<AppShell> createState() => _AppShellState();
}

class _AppShellState extends State<AppShell> with WidgetsBindingObserver {
  static const _tabs = [
    ('Overview', Icons.dashboard_outlined, Icons.dashboard),
    ('Tasks', Icons.checklist_outlined, Icons.checklist),
    ('Timetable', Icons.table_chart_outlined, Icons.table_chart),
    ('Calendar', Icons.calendar_month_outlined, Icons.calendar_month),
    ('Study Room', Icons.auto_awesome_outlined, Icons.auto_awesome),
  ];

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    initSync();
    SemesterApi.refreshDocuments();
    PushService.init();
    AppNav.I.tab.addListener(() {
      if (mounted) setState(() {});
    });
    AppNav.I.openHomework = () => Navigator.of(context).push(
          MaterialPageRoute(builder: (_) => const HomeworkPage()),
        );
    AppNav.I.openGrades = () => Navigator.of(context).push(
          MaterialPageRoute(builder: (_) => const GradesPage()),
        );
    AppNav.I.openAccount = () => AuthSheet.show(context);
    // tapped pushes land on the page they are about — routes set by the
    // functions as the message data payload ('timetable' · 'homework' ·
    // 'calendar'). A route tapped before this init ran is waiting in
    // PushService.pendingRoute.
    PushService.onRoute = _handlePushRoute;
    final pendingRoute = PushService.pendingRoute;
    if (pendingRoute != null) {
      PushService.pendingRoute = null;
      _handlePushRoute(pendingRoute);
    }
  }

  void _handlePushRoute(String route) {
    switch (route) {
      case 'homework':
        AppNav.I.openHomework?.call();
      case 'timetable':
        AppNav.I.tab.value = 2; // Timetable tab
      case 'calendar':
        AppNav.I.tab.value = 3; // Calendar tab
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    // the process is suspended in background — realtime drops and events are
    // missed; pull everything again when the user comes back
    if (state == AppLifecycleState.resumed) {
      resync();
    }
  }

  String get _currentLabel {
    if (AppNav.I.tab.value >= _tabs.length) return 'Overview';
    return _tabs[AppNav.I.tab.value].$1;
  }

  void _toggleTheme(BuildContext context) {
    final theme = Stores.I.theme;
    final current = theme.dark ?? (MediaQuery.platformBrightnessOf(context) == Brightness.dark);
    theme.setDark(!current);
  }

  @override
  Widget build(BuildContext context) {
    final sem = context.sem;
    return ListenableBuilder(
      listenable: Listenable.merge([Stores.I.auth, Stores.I.theme]),
      builder: (context, _) {
        final auth = Stores.I.auth;
        return Scaffold(
          backgroundColor: sem.paper,
          appBar: AppBar(
            title: GestureDetector(
              onTap: () => AppNav.I.tab.value = 0,
              child: RichText(
                text: TextSpan(
                  style: Theme.of(context)
                      .textTheme
                      .headlineSmall!
                      .copyWith(fontSize: 20),
                  children: [
                    const TextSpan(text: 'Semester'),
                    TextSpan(text: '.', style: TextStyle(color: sem.accent)),
                  ],
                ),
              ),
            ),
            actions: [
              Padding(
                padding: const EdgeInsets.only(right: 4),
                child: Center(
                  child: Text(
                    _currentLabel.toUpperCase(),
                    style: Theme.of(context).textTheme.labelSmall!.copyWith(
                          letterSpacing: 1.4,
                        ),
                  ),
                ),
              ),
              IconButton(
                tooltip: 'Account',
                icon: Badge(
                  isLabelVisible: auth.status == SyncStatus.signedIn,
                  smallSize: 6,
                  alignment: Alignment.topRight,
                  backgroundColor:
                      auth.syncing || auth.syncError != null ? sem.marker : sem.accent,
                  child: Icon(
                    Icons.person_outline,
                    size: 20,
                    color: auth.status == SyncStatus.signedIn ? sem.accent : sem.inkSoft,
                  ),
                ),
                onPressed: () => AuthSheet.show(context),
              ),
              IconButton(
                tooltip: 'Toggle dark mode',
                icon: Icon(
                  (Stores.I.theme.dark ??
                          MediaQuery.platformBrightnessOf(context) == Brightness.dark)
                      ? Icons.light_mode_outlined
                      : Icons.dark_mode_outlined,
                  size: 19,
                  color: sem.inkSoft,
                ),
                onPressed: () => _toggleTheme(context),
              ),
              PopupMenuButton<String>(
                tooltip: 'More',
                icon: Icon(Icons.more_vert, size: 20, color: sem.inkSoft),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12),
                  side: BorderSide(color: sem.line),
                ),
                onSelected: (value) {
                  switch (value) {
                    case 'homework':
                      AppNav.I.openHomework?.call();
                    case 'grades':
                      AppNav.I.openGrades?.call();
                    case 'account':
                      AuthSheet.show(context);
                  }
                },
                itemBuilder: (_) => [
                  const PopupMenuItem(
                    value: 'homework',
                    child: Row(children: [
                      Icon(Icons.menu_book_outlined, size: 18),
                      SizedBox(width: 10),
                      Text('Homework'),
                    ]),
                  ),
                  const PopupMenuItem(
                    value: 'grades',
                    child: Row(children: [
                      Icon(Icons.calculate_outlined, size: 18),
                      SizedBox(width: 10),
                      Text('Grades'),
                    ]),
                  ),
                  const PopupMenuItem(
                    value: 'account',
                    child: Row(children: [
                      Icon(Icons.person_outline, size: 18),
                      SizedBox(width: 10),
                      Text('Account & sync'),
                    ]),
                  ),
                ],
              ),
              const SizedBox(width: 4),
            ],
            bottom: PreferredSize(
              preferredSize: const Size.fromHeight(1),
              child: Container(height: 1, color: sem.line),
            ),
          ),
          body: PlannerGrid(
            child: IndexedStack(
              index: AppNav.I.tab.value.clamp(0, _tabs.length - 1),
              children: const [
                DashboardPage(),
                TodosPage(),
                TimetablePage(),
                CalendarPage(),
                StudyRoomPage(),
              ],
            ),
          ),
          bottomNavigationBar: Container(
            decoration: BoxDecoration(
              color: sem.paper.withValues(alpha: 0.97),
              border: Border(top: BorderSide(color: sem.line)),
            ),
            child: SafeArea(
              top: false,
              child: Row(
                children: [
                  for (var i = 0; i < _tabs.length; i++)
                    Expanded(
                      child: InkWell(
                        onTap: () => AppNav.I.tab.value = i,
                        child: Padding(
                          padding: const EdgeInsets.symmetric(vertical: 8),
                          child: Column(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Icon(
                                i == AppNav.I.tab.value ? _tabs[i].$3 : _tabs[i].$2,
                                size: 21,
                                color: i == AppNav.I.tab.value ? sem.accent : sem.inkSoft,
                              ),
                              const SizedBox(height: 3),
                              Text(
                                _tabs[i].$1.split(' ')[0],
                                style: Theme.of(context)
                                    .textTheme
                                    .bodySmall!
                                    .copyWith(
                                      fontSize: 10,
                                      height: 1.1,
                                      fontWeight:
                                          i == AppNav.I.tab.value ? FontWeight.w600 : FontWeight.w400,
                                      color: i == AppNav.I.tab.value ? sem.accent : sem.inkSoft,
                                    ),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ),
                ],
              ),
            ),
          ),
        );
      },
    );
  }
}
