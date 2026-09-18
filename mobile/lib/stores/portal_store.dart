import 'dart:convert';

import '../models/types.dart';
import 'base.dart';

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
