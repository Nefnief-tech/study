import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../appwrite/sync.dart';
import '../navigation.dart';
import '../services/api.dart';
import '../services/push.dart';
import '../stores/registry.dart';
import '../theme/app_theme.dart';
import '../widgets/controls.dart';
import '../widgets/motion.dart';
import 'calendar_page.dart';
import 'dashboard_page.dart';
import 'grades_page.dart';
import 'homework_page.dart';
import 'more_page.dart';
import 'settings_page.dart';
import 'study_room_page.dart';
import 'timetable_page.dart';
import 'todos_page.dart';

/// Port of AppShell.tsx for phones: five main tabs (Overview · Tasks ·
/// Homework · Timetable · More) — swipeable, with the system back gesture
/// walking back through tab history. The More tab holds Calendar, Grades,
/// Study Room and Settings as pushed pages, so back pops them naturally.
/// Navigation flows through [AppNav] (navigation.dart) so push taps and
/// deeplinks land right.
class AppShell extends StatefulWidget {
  const AppShell({super.key});

  @override
  State<AppShell> createState() => _AppShellState();
}

class _AppShellState extends State<AppShell> with WidgetsBindingObserver {
  static const _tabs = [
    ('Overview', Icons.dashboard_outlined, Icons.dashboard),
    ('Tasks', Icons.checklist_outlined, Icons.checklist),
    ('Homework', Icons.menu_book_outlined, Icons.menu_book),
    ('Timetable', Icons.table_chart_outlined, Icons.table_chart),
    ('More', Icons.apps_outlined, Icons.apps),
  ];

  final PageController _swipe = PageController();
  int _currentTab = kTabOverview;
  final List<int> _tabHistory = [];

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    initSync();
    SemesterApi.refreshDocuments();
    PushService.init();
    AppNav.I.tab.addListener(_onTabChanged);
    // Navigator lookups are illegal in initState — wire after the first frame
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      AppNav.I.openCalendar = () => _pushPage('Calendar', const CalendarPage());
      AppNav.I.openGrades = () => _pushPage('Grades', const GradesPage());
      AppNav.I.openStudy = () => _pushPage('Study Room', const StudyRoomPage());
      AppNav.I.openSettings = () => _pushPage('Settings', const SettingsPage());
      AppNav.I.markShellReady();
    });
  }

  @override
  void dispose() {
    AppNav.I.tab.removeListener(_onTabChanged);
    _swipe.dispose();
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  void _pushPage(String title, Widget page) {
    final line = context.sem.line;
    Navigator.of(context).push(
      FadeThroughRoute(
        page: Scaffold(
          appBar: AppBar(
            title: Text(
              title,
              style: Theme.of(context)
                  .textTheme
                  .headlineSmall!
                  .copyWith(fontSize: 18),
            ),
            bottom: PreferredSize(
              preferredSize: const Size.fromHeight(1),
              child: Container(height: 1, color: line),
            ),
          ),
          body: PlannerGrid(child: page),
        ),
      ),
    );
  }

  /// single sync point: whatever sets AppNav.I.tab (bottom-bar tap, swipe,
  /// push payload, deeplink) ends up here — the PageView follows along and
  /// the previous tab is remembered for the system back gesture
  void _onTabChanged() {
    final next = AppNav.I.tab.value.clamp(0, _tabs.length - 1);
    if (next == _currentTab) return;
    _tabHistory.add(_currentTab);
    if (_tabHistory.length > 16) _tabHistory.removeAt(0);
    _currentTab = next;
    if (_swipe.hasClients && (_swipe.page?.round() ?? next) != next) {
      _swipe.animateToPage(
        next,
        duration: const Duration(milliseconds: 240),
        curve: Curves.easeOutCubic,
      );
    }
    setState(() {});
  }

  void _goTab(int index) => AppNav.I.tab.value = index;

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    // the process is suspended in background — realtime drops and events are
    // missed; pull everything again when the user comes back
    if (state == AppLifecycleState.resumed) {
      resync();
    }
  }

  String get _currentLabel {
    if (_currentTab >= _tabs.length) return _tabs.first.$1;
    return _tabs[_currentTab].$1;
  }

  void _toggleTheme(BuildContext context) {
    final theme = Stores.I.theme;
    final current = theme.dark ?? (MediaQuery.platformBrightnessOf(context) == Brightness.dark);
    theme.setDark(!current);
  }

  @override
  Widget build(BuildContext context) {
    final sem = context.sem;
    return PopScope(
      // the system back gesture (edge swipe) walks back through tab history
      // instead of leaving the app; at the root it exits. Pushed More-pages
      // pop on their own route before this ever fires.
      canPop: false,
      onPopInvokedWithResult: (didPop, _) {
        if (didPop) return;
        if (_tabHistory.isNotEmpty) {
          final previous = _tabHistory.removeLast();
          AppNav.I.tab.value = previous;
        } else if (_currentTab != kTabOverview) {
          AppNav.I.tab.value = kTabOverview;
        } else {
          SystemNavigator.pop();
        }
      },
      child: ListenableBuilder(
        listenable: Stores.I.theme,
        builder: (context, _) {
          return Scaffold(
            backgroundColor: sem.paper,
            appBar: AppBar(
              title: GestureDetector(
                onTap: () => _goTab(kTabOverview),
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
                  padding: const EdgeInsets.only(right: 12),
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
                const SizedBox(width: 8),
              ],
              bottom: PreferredSize(
                preferredSize: const Size.fromHeight(1),
                child: Container(height: 1, color: sem.line),
              ),
            ),
            body: PlannerGrid(
              child: PageView(
                controller: _swipe,
                onPageChanged: (i) => AppNav.I.tab.value = i,
                children: const [
                  _KeepAlive(DashboardPage()),
                  _KeepAlive(TodosPage()),
                  _KeepAlive(HomeworkPage()),
                  _KeepAlive(TimetablePage()),
                  _KeepAlive(MorePage()),
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
                          onTap: () => _goTab(i),
                          child: Padding(
                            padding: const EdgeInsets.symmetric(vertical: 8),
                            child: Column(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Icon(
                                  i == _currentTab ? _tabs[i].$3 : _tabs[i].$2,
                                  size: 21,
                                  color: i == _currentTab
                                      ? sem.accent
                                      : sem.inkSoft,
                                ),
                                const SizedBox(height: 3),
                                Text(
                                  _tabs[i].$1,
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: Theme.of(context)
                                      .textTheme
                                      .labelSmall!
                                      .copyWith(
                                        fontSize: 9,
                                        letterSpacing: 0.2,
                                        fontWeight: i == _currentTab
                                            ? FontWeight.w600
                                            : FontWeight.w400,
                                        color: i == _currentTab
                                            ? sem.accent
                                            : sem.inkSoft,
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
      ),
    );
  }
}

/// keeps a PageView page's state (scroll positions, controllers) alive once
/// it has been built — swiping far away and back must not reset a page
class _KeepAlive extends StatefulWidget {
  final Widget child;
  const _KeepAlive(this.child);

  @override
  State<_KeepAlive> createState() => _KeepAliveState();
}

class _KeepAliveState extends State<_KeepAlive>
    with AutomaticKeepAliveClientMixin {
  @override
  bool get wantKeepAlive => true;

  @override
  Widget build(BuildContext context) {
    super.build(context);
    return widget.child;
  }
}
