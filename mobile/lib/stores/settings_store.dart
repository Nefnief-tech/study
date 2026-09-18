import 'base.dart';

/// The Semester web server the app talks to for AI study-room features and the
/// school-portal fetch (the AI key and portal scraper live server-side).
/// Device-local setting, never synced. 10.0.2.2 is the Android-emulator alias
/// for the host machine's localhost.
class SettingsStore extends PersistedStore {
  @override
  String get storageKey => 'semester.server';

  String _serverUrl = 'http://10.0.2.2:8899';
  String get serverUrl => _serverUrl;

  @override
  Map<String, dynamic> persistedState() => {'serverUrl': _serverUrl};

  @override
  void hydrateFrom(Map<String, dynamic> state) {
    final v = state['serverUrl'];
    if (v is String && v.isNotEmpty) _serverUrl = v;
  }

  void setServerUrl(String url) {
    _serverUrl = url.trim().isNotEmpty ? url.trim() : _serverUrl;
    notifyListeners();
    persist();
  }
}
