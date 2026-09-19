import 'package:flutter/foundation.dart';

import 'base.dart';

class AuthUser {
  final String id;
  final String email;
  final String name;
  const AuthUser(this.id, this.email, this.name);
}

enum SyncStatus { unconfigured, loading, signedOut, signedIn }

/// Auth + sync status — mirrors the web app's `src/lib/store/auth.ts`.
/// Not persisted: restored from the Appwrite session on startup.
class AuthStore extends ChangeNotifier {
  AuthUser? _user;
  AuthUser? get user => _user;

  SyncStatus _status = SyncStatus.unconfigured;
  SyncStatus get status => _status;

  bool _syncing = false;
  bool get syncing => _syncing;

  bool _online = true;
  bool get online => _online;

  int? _lastSyncedAt;
  int? get lastSyncedAt => _lastSyncedAt;

  String? _syncError;
  String? get syncError => _syncError;

  void setAuth(AuthUser? user, SyncStatus status) {
    _user = user;
    _status = status;
    _syncError = null;
    notifyListeners();
  }

  void setSyncing(bool v) {
    _syncing = v;
    notifyListeners();
  }

  void setSynced(int at) {
    _lastSyncedAt = at;
    _syncing = false;
    _syncError = null;
    notifyListeners();
  }

  void setSyncError(String message) {
    _syncError = message;
    _syncing = false;
    notifyListeners();
  }

  void setOnline(bool online) {
    _online = online;
    notifyListeners();
  }
}

/// Tracks unsynced local edits per store key. A key is "dirty" from the moment
/// it changes locally until its cloud push succeeds — on load the cloud
/// snapshot wins, unless the local copy holds edits that never made it up.
class SyncMetaStore extends PersistedStore {
  @override
  String get storageKey => 'semester.syncmeta';

  @override
  int get storageVersion => 3;

  Map<String, int> _dirtyAt = {};
  Map<String, int> get dirtyAt => Map.unmodifiable(_dirtyAt);

  /// keys whose cloud state this device has successfully observed since the
  /// last storage clear — a device may only push stores it has loaded
  Set<String> _loaded = {};
  bool isLoaded(String key) => _loaded.contains(key);

  @override
  Map<String, dynamic> persistedState() => {'dirtyAt': _dirtyAt, 'loaded': _loaded.toList()};

  @override
  void hydrateFrom(Map<String, dynamic> state) {
    final raw = state['dirtyAt'];
    _dirtyAt = raw is Map
        ? raw.map((k, v) => MapEntry('$k', (v as num).toInt()))
        : {};
    // v2 → v3: an upgrade starts without baselines; the next reconcile sets them
    _loaded = ((state['loaded'] as List?) ?? []).map((e) => e as String).toSet();
  }

  void markLoaded(String key) {
    if (_loaded.contains(key)) return;
    _loaded = {..._loaded, key};
    persist();
  }

  void markDirty(String key, int at) {
    _dirtyAt = {..._dirtyAt, key: at};
    notifyListeners();
    persist();
  }

  void clearDirty(String key) {
    if (!_dirtyAt.containsKey(key)) return;
    _dirtyAt = {..._dirtyAt}..remove(key);
    notifyListeners();
    persist();
  }
}

/// light / dark / system — the web ThemeToggle stores a bare "dark"/"light"
/// string under this key, so the mobile port reads and writes the same shape.
class ThemeStore extends PersistedStore {
  @override
  String get storageKey => 'semester.theme';

  /// null = follow system
  bool? dark;

  @override
  Map<String, dynamic> persistedState() => {};

  @override
  void hydrateFrom(Map<String, dynamic> state) {}

  @override
  bool loadCustom(String raw) {
    if (raw == '"dark"' || raw == 'dark') {
      dark = true;
      return true;
    }
    if (raw == '"light"' || raw == 'light') {
      dark = false;
      return true;
    }
    return false;
  }

  Future<void> setDark(bool? value) async {
    dark = value;
    notifyListeners();
    final p = prefs;
    if (p == null) return;
    if (value == null) {
      await p.remove(storageKey);
    } else {
      await p.setString(storageKey, value ? 'dark' : 'light');
    }
  }
}
