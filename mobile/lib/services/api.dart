import 'dart:convert';

import 'package:appwrite/appwrite.dart' hide Account, Storage;
import 'package:http/http.dart' as http;

import '../appwrite/client.dart';
import '../models/types.dart';
import '../stores/registry.dart';
import '../stores/settings_store.dart';

/// Client for the Semester web server (the Next.js app) — the AI key and the
/// school-portal scraper live there, so the app reuses the same JWT-gated API
/// routes as the web frontend.

class ApiException implements Exception {
  final String message;
  ApiException(this.message);
  @override
  String toString() => message;
}

Uri _uri(SettingsStore settings, String path) =>
    Uri.parse(settings.serverUrl.replaceAll(RegExp(r'/+$'), '') + path);

/// pulls a readable message out of an AI provider's error payload
String summarizeProviderError(String? detail) {
  if (detail == null || detail.isEmpty) return '';
  try {
    final json = jsonDecode(detail);
    if (json is Map) {
      final err = json['error'];
      if (err is String) return err;
      if (err is Map && err['message'] is String) return err['message'] as String;
    }
  } catch (_) {}
  if (detail.length > 160) return detail.substring(0, 160);
  return detail;
}

String _friendlyUploadError(String code) {
  const errors = {
    'unsupported_type': 'Unsupported file type — use PDF, DOCX, PPTX, TXT or MD.',
    'too_large': 'That file is larger than 20 MB.',
    'extract_failed':
        "Couldn't read this file. Scanned PDFs without a text layer aren't supported.",
    'no_text': 'No extractable text found in this file.',
    'missing_file': 'Upload failed — try again.',
    'auth_required': 'Sign in first — open Account in the top bar.',
  };
  return errors[code] ?? 'Upload failed — try again.';
}

String _friendlyChatError(String code, String detail) {
  if (code == 'not_configured') {
    return 'AI is not configured — set an API key in the server .env.local and restart it.';
  }
  if (code == 'auth_required') return 'Sign in first — open Account in the top bar.';
  if (detail.isNotEmpty) return 'The AI provider rejected the request: $detail';
  return 'Sorry, the AI provider returned an error. Please try again.';
}

class SemesterApi {
  SemesterApi._();

  /* ---------------- documents ---------------- */

  /// lists the signed-in user's document metadata + whether AI is configured.
  /// Never throws — an unreachable server just leaves the panels empty.
  static Future<void> refreshDocuments() async {
    try {
      final settings = Stores.I.settings;
      final headers = await getAuthHeaders();
      final res = await http
          .get(_uri(settings, '/api/study-room/documents'), headers: headers)
          .timeout(const Duration(seconds: 15));
      if (res.statusCode != 200) return;
      final json = jsonDecode(res.body);
      if (json is! Map<String, dynamic>) return;
      final docs = ((json['documents'] as List?) ?? [])
          .whereType<Map>()
          .map((e) => StudyDoc.fromJson(Map<String, dynamic>.from(e)))
          .toList();
      Stores.I.studyroom.setDocuments(docs, json['configured'] == true);

      // first visit: tick everything; afterwards prune stale selections
      final ids = docs.map((d) => d.id).toList();
      final room = Stores.I.studyroom;
      final current = room.selectedDocIds;
      final pruned = current.where((id) => ids.contains(id)).toList();
      if (pruned.isEmpty) {
        room.setSelectedDocs(ids);
      } else if (pruned.length != current.length) {
        room.setSelectedDocs(pruned);
      }
    } catch (_) {
      // server unreachable / signed out — the study room works without it
    }
  }

  /// upload one file: persist the raw file in the Appwrite bucket (best
  /// effort), then extract text server-side. Returns the created StudyDoc.
  static Future<StudyDoc> uploadDocument(String filePath) async {
    final settings = Stores.I.settings;

    String? bucketFileId;
    try {
      bucketFileId = await uploadToBucket(filePath);
    } catch (_) {
      // bucket not provisioned / offline — extraction still works locally
    }

    final req = http.MultipartRequest('POST', _uri(settings, '/api/study-room/documents'))
      ..headers.addAll(await getAuthHeaders())
      ..files.add(await http.MultipartFile.fromPath('file', filePath));
    if (bucketFileId != null) req.fields['bucketFileId'] = bucketFileId;

    final res = await req.send().timeout(const Duration(minutes: 2));
    final body = await res.stream.bytesToString();
    final json = body.isNotEmpty ? jsonDecode(body) : null;
    if (res.statusCode != 200 || json is! Map<String, dynamic> || !json.containsKey('id')) {
      final code = json is Map ? '${json['error'] ?? ''}' : '';
      throw ApiException(_friendlyUploadError(code));
    }
    return StudyDoc.fromJson(json);
  }

  static Future<void> deleteDocument(String id) async {
    final settings = Stores.I.settings;
    final res = await http
        .delete(_uri(settings, '/api/study-room/documents/$id'),
            headers: await getAuthHeaders())
        .timeout(const Duration(seconds: 15));
    if (res.statusCode != 200) {
      throw ApiException('Delete failed — try again.');
    }
  }

  /* ---------------- flashcards ---------------- */

  static Future<DeckSeed> generateFlashcards(List<String> documentIds) async {
    final settings = Stores.I.settings;
    final res = await http
        .post(
          _uri(settings, '/api/study-room/flashcards'),
          headers: {
            'content-type': 'application/json',
            ...await getAuthHeaders(),
          },
          body: jsonEncode({'documentIds': documentIds}),
        )
        .timeout(const Duration(minutes: 3));
    final json = res.body.isNotEmpty ? jsonDecode(res.body) : null;
    if (res.statusCode != 200 ||
        json is! Map<String, dynamic> ||
        json['cards'] is! List ||
        (json['cards'] as List).isEmpty) {
      final code = json is Map ? '${json['error'] ?? 'generation_failed'}' : 'generation_failed';
      final detail = summarizeProviderError(json is Map ? json['detail'] as String? : null);
      if (code == 'not_configured') {
        throw ApiException('Add an API key to the server .env.local first.');
      }
      if (code == 'auth_required') {
        throw ApiException('Sign in first — open Account in the top bar.');
      }
      if (detail.isNotEmpty) {
        throw ApiException('The AI provider rejected the request: $detail');
      }
      throw ApiException(
          "The AI didn't return usable flashcards — try again or pick different documents.");
    }
    final cards = ((json['cards'] as List?) ?? [])
        .whereType<Map>()
        .map((e) => Flashcard.fromJson(Map<String, dynamic>.from(e)))
        .toList();
    return DeckSeed(
      title: (json['title'] as String?) ?? 'Flashcards',
      cards: cards,
    );
  }

  /* ---------------- chat (streaming) ---------------- */

  /// POSTs the chat and yields the assistant's accumulated content as deltas
  /// arrive. The first line of the response is a JSON frame with the source
  /// document names — surfaced through [onSources] once parsed.
  static Stream<ChatUpdate> streamChat({
    required List<ChatMessage> history,
    required List<String> documentIds,
    required http.Client client,
  }) async* {
    final settings = Stores.I.settings;
    final req = http.Request('POST', _uri(settings, '/api/study-room/chat'))
      ..headers['content-type'] = 'application/json'
      ..headers.addAll(await getAuthHeaders())
      ..body = jsonEncode({
        'messages': history.map((m) => {'role': m.role, 'content': m.content}).toList(),
        'documentIds': documentIds,
      });

    final res = await client.send(req).timeout(const Duration(minutes: 5));

    if (res.statusCode != 200) {
      final body = await res.stream.bytesToString();
      Object? json;
      try {
        json = body.isNotEmpty ? jsonDecode(body) : null;
      } catch (_) {}
      final code = json is Map ? '${json['error'] ?? ''}' : '';
      final detail = summarizeProviderError(json is Map ? json['detail'] as String? : null);
      yield ChatError(_friendlyChatError(code, detail));
      return;
    }

    var raw = '';
    List<String>? sources;
    var gotSources = false;
    await for (final chunk in res.stream.transform(utf8.decoder)) {
      raw += chunk;
      if (!gotSources) {
        final nl = raw.indexOf('\n');
        if (nl >= 0) {
          try {
            final frame = jsonDecode(raw.substring(0, nl));
            sources = frame is Map
                ? ((frame['sources'] as List?) ?? []).map((e) => e as String).toList()
                : <String>[];
          } catch (_) {
            sources = [];
          }
          raw = raw.substring(nl + 1);
          gotSources = true;
          yield ChatDelta(raw, sources);
          continue;
        }
      }
      if (gotSources) yield ChatDelta(raw, sources);
    }
  }

  /* ---------------- school portal ---------------- */

  static Future<PortalPlan> fetchPortalPlan() async {
    final portal = Stores.I.portal;
    final settings = Stores.I.settings;
    final res = await http
        .post(
          _uri(settings, '/api/portal/fetch'),
          headers: {
            'content-type': 'application/json',
            ...await getAuthHeaders(),
          },
          body: jsonEncode({
            'baseUrl': portal.baseUrl,
            'username': portal.username,
            'password': portal.password,
          }),
        )
        .timeout(const Duration(seconds: 30));
    Object? json;
    try {
      json = res.body.isNotEmpty ? jsonDecode(res.body) : null;
    } catch (_) {}
    if (res.statusCode != 200 || json is! Map<String, dynamic> || !json.containsKey('days')) {
      final code = json is Map ? '${json['error'] ?? 'portal_unreachable'}' : 'portal_unreachable';
      final detail = json is Map ? (json['detail'] as String? ?? '') : '';
      if (code == 'portal_auth') {
        throw ApiException('Portal rejected the login — check portal URL, email and password.');
      }
      if (code == 'auth_required') throw ApiException('Sign in first — open Account in the top bar.');
      if (code == 'missing_settings') {
        throw ApiException('Fill in portal URL, email and password below.');
      }
      throw ApiException(detail.isNotEmpty ? detail : 'The portal could not be reached.');
    }
    return PortalPlan.fromJson(json);
  }
}

class DeckSeed {
  final String title;
  final List<Flashcard> cards;
  const DeckSeed({required this.title, required this.cards});
}

sealed class ChatUpdate {}

class ChatDelta extends ChatUpdate {
  /// the full assistant content so far
  final String content;
  final List<String>? sources;
  ChatDelta(this.content, this.sources);
}

class ChatError extends ChatUpdate {
  final String message;
  ChatError(this.message);
}

/// best-effort raw-file upload to the Appwrite storage bucket; returns the
/// bucket file id so the extracted text and the raw file can be linked.
/// File security is on — every file is locked to its owner.
Future<String?> uploadToBucket(String filePath) async {
  final ownerId = Stores.I.auth.user?.id;
  final result = await storage.createFile(
    bucketId: kStorageBucketId,
    fileId: ID.unique(),
    file: InputFile.fromPath(path: filePath),
    permissions: ownerId == null
        ? null
        : ['read("user:$ownerId")', 'write("user:$ownerId")'],
  );
  return result.$id;
}
