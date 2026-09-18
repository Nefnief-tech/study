import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Base for the Zustand-store ports. Each store persists the same JSON shape
/// (zustand `persist` envelope: `{"state": {…}, "version": n}`) under the same
/// localStorage key as the web app, so a backup of one reads as the other.
abstract class PersistedStore extends ChangeNotifier {
  /// localStorage / SharedPreferences key, e.g. "semester.subjects"
  String get storageKey;

  /// the persisted slice (web `partialize` equivalent)
  Map<String, dynamic> persistedState();

  /// replaces state from a persisted slice
  void hydrateFrom(Map<String, dynamic> state);

  int get storageVersion => 1;

  @protected
  SharedPreferences? prefs;

  @protected
  Future<void> persist() async {
    final p = prefs;
    if (p == null) return;
    final env = {'state': persistedState(), 'version': storageVersion};
    try {
      await p.setString(storageKey, jsonEncode(env));
    } catch (_) {
      // storage full or unavailable — keep working in memory
    }
  }

  @mustCallSuper
  Future<void> load(SharedPreferences p) async {
    prefs = p;
    final raw = p.getString(storageKey);
    if (raw == null) return;
    if (loadCustom(raw)) return;
    try {
      final env = jsonDecode(raw);
      if (env is Map<String, dynamic>) {
        final state = env['state'];
        if (state is Map<String, dynamic>) hydrateFrom(state);
      }
    } catch (_) {
      // corrupted entry — start fresh rather than crash
    }
  }

  /// override for non-envelope storage; return true when handled
  bool loadCustom(String raw) => false;
}
