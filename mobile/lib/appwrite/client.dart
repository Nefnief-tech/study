import 'package:appwrite/appwrite.dart';

import '../stores/auth_store.dart';

/// Appwrite powers auth + cloud sync. Endpoint + project id are public client
/// values (same project as the web app — same database, same collections).
/// Override at build time with:
///   flutter build apk --dart-define=APPWRITE_ENDPOINT=… --dart-define=APPWRITE_PROJECT_ID=…
const String kAppwriteEndpoint = String.fromEnvironment(
  'APPWRITE_ENDPOINT',
  defaultValue: 'https://fra.cloud.appwrite.io/v1',
);
const String kAppwriteProjectId = String.fromEnvironment(
  'APPWRITE_PROJECT_ID',
  defaultValue: '6aac46e3001a9ef65b25',
);

const String kDatabaseId = 'semester';
const String kSnapshotsCollectionId = 'snapshots';
const String kChatsCollectionId = 'chats';
const String kDecksCollectionId = 'decks';
const String kStorageBucketId = 'study-files';

final Client appwriteClient = Client()
  ..setEndpoint(kAppwriteEndpoint)
  ..setProject(kAppwriteProjectId);

final Account account = Account(appwriteClient);
final Databases databases = Databases(appwriteClient);
final Storage storage = Storage(appwriteClient);

bool get appwriteConfigured =>
    kAppwriteEndpoint.isNotEmpty && kAppwriteProjectId.isNotEmpty;

/// returns the user or throws — callers distinguish "no valid session"
/// (401) from network failures (SocketException etc.)
Future<AuthUser> getCurrentUserStrict() async {
  final user = await account.get();
  return AuthUser(
    user.$id,
    user.email,
    user.name.isNotEmpty ? user.name : user.email,
    emailVerified: user.emailVerification,
    mfa: user.mfa,
  );
}

Future<AuthUser?> getCurrentUser() async {
  try {
    return await getCurrentUserStrict();
  } catch (_) {
    return null;
  }
}

String? _cachedJwt;
int _cachedJwtAt = 0;

/// Authorization header carrying a short-lived Appwrite JWT (cached ~10 min),
/// used to authenticate app → Semester-server API calls.
/// short-lived Appwrite JWT for REST calls against the Appwrite server itself
/// (cached ~10 min); null when no session or offline
Future<String?> getJwt() async {
  try {
    if (_cachedJwt == null ||
        DateTime.now().millisecondsSinceEpoch - _cachedJwtAt > 10 * 60 * 1000) {
      final jwt = await account.createJWT();
      _cachedJwt = jwt.jwt;
      _cachedJwtAt = DateTime.now().millisecondsSinceEpoch;
    }
    return _cachedJwt;
  } catch (_) {
    return null;
  }
}

Future<Map<String, String>> getAuthHeaders() async {
  final jwt = await getJwt();
  if (jwt == null) return {};
  return {'authorization': 'Bearer $jwt'};
}

void invalidateJwtCache() {
  _cachedJwt = null;
  _cachedJwtAt = 0;
}
