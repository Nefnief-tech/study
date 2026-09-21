import 'dart:async';

import 'package:app_links/app_links.dart';

import '../navigation.dart';

/// `semester://<route>` deeplinks — semester://timetable, semester://homework,
/// semester://calendar … (https app links can layer on top once the server
/// speaks HTTPS and hosts the assetlinks.json statement)
class SemesterLinks {
  static final AppLinks _links = AppLinks();
  static StreamSubscription? _sub;

  static Future<void> init() async {
    try {
      final initial = await _links.getInitialLink();
      if (initial != null) _dispatch(initial);
    } catch (_) {
      // no initial link / platform not ready — deeplinks stay optional
    }
    _sub = _links.uriLinkStream.listen(
      (uri) {
        try {
          _dispatch(uri);
        } catch (_) {}
      },
      onError: (_) {},
    );
  }

  static void _dispatch(Uri uri) {
    final route =
        (uri.host.isNotEmpty ? uri.host : (uri.pathSegments.firstOrNull ?? ''))
            .toLowerCase();
    if (route.isNotEmpty) AppNav.I.handle(route);
  }

  static void dispose() {
    _sub?.cancel();
    _sub = null;
  }
}
