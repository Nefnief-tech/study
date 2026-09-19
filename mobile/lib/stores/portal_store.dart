import 'dart:convert';

import '../models/types.dart';
import '../utils/utils.dart';
import 'base.dart';

/// stable cloud row ids — content-derived so both clients agree
String portalSubRowId(PortalSub e) => hashId([
      e.date,
      e.weekday,
      e.period,
      e.course,
      e.courseOld ?? '',
      e.substitute,
      e.room,
      e.info,
      e.cancelled ? 'true' : 'false',
    ].join('|'));
String portalCourseRowId(String course) => hashId('course|$course');

/// School portal settings + the last fetched substitute plan.
/// Device-local ONLY: credentials never leave this device (or get synced),
/// they are sent per-request to your own server for the portal login.
class PortalStore extends PersistedStore {
  @override
  String get storageKey => 'semester.portal';

  String baseUrl = 'https://evbspar.eltern-portal.org';
  String username = '';
  String password = '';
  bool autoFetch = true;
  PortalPlan? data;
  int? lastFetched;
  String? error;

  @override
  Map<String, dynamic> persistedState() => {
        'baseUrl': baseUrl,
        'username': username,
        'password': password,
        'autoFetch': autoFetch,
        'data': data?.toJson(),
        'lastFetched': lastFetched,
      };

  @override
  void hydrateFrom(Map<String, dynamic> state) {
    baseUrl = (state['baseUrl'] as String?) ?? baseUrl;
    username = (state['username'] as String?) ?? '';
    password = (state['password'] as String?) ?? '';
    autoFetch = (state['autoFetch'] as bool?) ?? true;
    final d = state['data'];
    data = d is Map<String, dynamic> ? PortalPlan.fromJson(d) : null;
    lastFetched = (state['lastFetched'] as num?)?.toInt();
  }

  void setSettings({String? baseUrl, String? username, String? password, bool? autoFetch}) {
    this.baseUrl = baseUrl ?? this.baseUrl;
    this.username = username ?? this.username;
    this.password = password ?? this.password;
    this.autoFetch = autoFetch ?? this.autoFetch;
    notifyListeners();
    persist();
  }

  void setData(PortalPlan plan) {
    data = plan;
    lastFetched = DateTime.now().millisecondsSinceEpoch;
    error = null;
    notifyListeners();
    persist();
  }

  /// row-level sync: insert or replace a substitute entry
  void upsertSub(PortalSub sub) {
    if (data == null) return;
    final rowId = portalSubRowId(sub);
    final days = [...data!.days.map((d) => PortalDay(date: d.date, weekday: d.weekday, entries: [...d.entries]))];
    PortalDay? day;
    for (final d in days) {
      if (d.date == sub.date) {
        day = d;
        break;
      }
    }
    if (day == null) {
      day = PortalDay(date: sub.date, weekday: sub.weekday, entries: []);
      days.add(day);
    }
    final idx = days.indexOf(day);
    day = PortalDay(
      date: day.date,
      weekday: day.weekday,
      entries: [...day.entries.where((e) => portalSubRowId(e) != rowId), sub],
    );
    days[idx] = day;
    data = PortalPlan(days: days, courses: data!.courses, stand: data!.stand);
    notifyListeners();
    persist();
  }

  /// row-level sync: drop a substitute entry
  void removeSub(String rowId) {
    if (data == null) return;
    final days = data!.days
        .map((d) => PortalDay(
              date: d.date,
              weekday: d.weekday,
              entries: d.entries.where((e) => portalSubRowId(e) != rowId).toList(),
            ))
        .toList();
    data = PortalPlan(days: days, courses: data!.courses, stand: data!.stand);
    notifyListeners();
    persist();
  }

  /// row-level sync: add a portal course
  void upsertCourse(String course) {
    if (data == null || data!.courses.contains(course)) return;
    data = PortalPlan(days: data!.days, courses: [...data!.courses, course], stand: data!.stand);
    notifyListeners();
    persist();
  }

  /// row-level sync: drop a portal course
  void removeCourse(String rowId) {
    if (data == null) return;
    data = PortalPlan(
      days: data!.days,
      courses: data!.courses.where((c) => portalCourseRowId(c) != rowId).toList(),
      stand: data!.stand,
    );
    notifyListeners();
    persist();
  }

  void setError(String? e) {
    error = e;
    notifyListeners();
  }

  void clearData() {
    data = null;
    lastFetched = null;
    notifyListeners();
    persist();
  }

  /// convenience: parse an API response map into the store
  static PortalPlan planFromJson(String source) =>
      PortalPlan.fromJson(jsonDecode(source) as Map<String, dynamic>);
}
