import 'package:flutter/material.dart';

import '../appwrite/sync.dart';
import '../services/push.dart';
import '../stores/auth_store.dart';
import '../stores/registry.dart';
import '../theme/app_theme.dart';
import '../utils/utils.dart';
import 'controls.dart';

/// Port of AuthModal.tsx — sign in / create account / account management,
/// plus the device-local server URL setting and push status.
class AuthSheet extends StatefulWidget {
  const AuthSheet({super.key});

  static Future<void> show(BuildContext context) =>
      showSemSheet(context: context, title: 'Sign in to sync', builder: (_) => const AuthSheet());

  @override
  State<AuthSheet> createState() => _AuthSheetState();
}

class _AuthSheetState extends State<AuthSheet> {
  bool _register = false;
  final _name = TextEditingController();
  final _email = TextEditingController();
  final _password = TextEditingController();
  late final TextEditingController _server =
      TextEditingController(text: Stores.I.settings.serverUrl);
  bool _busy = false;
  String _error = '';
  bool _obscure = true;

  @override
  void dispose() {
    _name.dispose();
    _email.dispose();
    _password.dispose();
    _server.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    setState(() {
      _error = '';
      _busy = true;
    });
    try {
      if (_register) {
        await signUp(_name.text.trim(), _email.text.trim(), _password.text);
      } else {
        await signIn(_email.text.trim(), _password.text);
      }
      await PushService.onSignIn();
      _password.clear();
      if (mounted) Navigator.of(context).pop();
    } catch (e) {
      setState(() => _error = _friendlyAuthError(e.toString()));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  String _friendlyAuthError(String raw) {
    if (raw.contains('user_invalid_credentials') || raw.contains('invalid_credentials')) {
      return 'Wrong email or password.';
    }
    if (raw.contains('password_too_short') || raw.contains('password_min_length')) {
      return 'Password must be at least 8 characters.';
    }
    if (raw.contains('user_already_exists') || raw.contains('email_already_exists')) {
      return 'An account with this email already exists.';
    }
    if (raw.contains('user_not_found')) return 'No account with this email.';
    if (raw.length > 200) return raw.substring(0, 200);
    return raw;
  }

  Future<void> _syncNow() async {
    setState(() => _busy = true);
    await syncNow();
    if (mounted) setState(() => _busy = false);
  }

  Future<void> _signOut() async {
    await PushService.onSignOut();
    await signOut();
    if (mounted) Navigator.of(context).pop();
  }

  @override
  Widget build(BuildContext context) {
    final sem = context.sem;

    return ListenableBuilder(
      listenable: Listenable.merge([
        Stores.I.auth,
        Stores.I.settings,
      ]),
      builder: (context, _) {
        final signedInNow =
            Stores.I.auth.status == SyncStatus.signedIn && Stores.I.auth.user != null;
        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            if (Stores.I.auth.status == SyncStatus.loading)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 16),
                child: Text(
                  'Checking session…',
                  style: TextStyle(color: sem.inkSoft),
                ),
              ),

            if (signedInNow && Stores.I.auth.user != null) ...[
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: sem.paper,
                  border: Border.all(color: sem.line),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Row(
                  children: [
                    Container(
                      width: 36,
                      height: 36,
                      decoration: BoxDecoration(
                        color: sem.accentSoft,
                        shape: BoxShape.circle,
                      ),
                      child: Icon(Icons.person_outline, size: 16, color: sem.accent),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            Stores.I.auth.user!.name,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: Theme.of(context)
                                .textTheme
                                .bodyMedium!
                                .copyWith(fontWeight: FontWeight.w500),
                          ),
                          Text(
                            Stores.I.auth.user!.email,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: Theme.of(context).textTheme.labelSmall,
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 10),
              Text(
                Stores.I.auth.syncing
                    ? 'syncing…'
                    : Stores.I.auth.syncError != null
                        ? 'sync error · ${Stores.I.auth.syncError}'
                        : Stores.I.auth.lastSyncedAt != null
                            ? 'synced · ${formatClock(Stores.I.auth.lastSyncedAt!)}'
                            : 'not synced yet',
                style: Theme.of(context).textTheme.labelSmall,
              ),
              if (PushService.available) ...[
                const SizedBox(height: 4),
                Text(
                  PushService.registered
                      ? 'push · ready (Appwrite Messaging)'
                      : 'push · not registered on this device',
                  style: Theme.of(context).textTheme.labelSmall,
                ),
              ],
              const SizedBox(height: 12),
              Row(
                children: [
                  Expanded(
                    child: SemGhostButton(
                      onPressed: _busy ? null : _syncNow,
                      child: _busy
                          ? const SizedBox(
                              width: 14,
                              height: 14,
                              child: CircularProgressIndicator(strokeWidth: 2))
                          : const Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [Icon(Icons.refresh, size: 16), SizedBox(width: 6), Text('Sync now')],
                            ),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: SemGhostButton(
                      onPressed: _signOut,
                      foreground: sem.marker,
                      border: sem.marker.withValues(alpha: 0.4),
                      child: const Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [Icon(Icons.logout, size: 16), SizedBox(width: 6), Text('Sign out')],
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              Text(
                'Signing out keeps your data on this device.',
                style: Theme.of(context).textTheme.labelSmall,
              ),
            ],

            if (!signedInNow && Stores.I.auth.status != SyncStatus.loading) ...[
              SegToggle<bool>(
                options: [(false, 'Sign in'), (true, 'Create account')],
                selected: _register,
                onChanged: (v) => setState(() {
                  _register = v;
                  _error = '';
                }),
              ),
              const SizedBox(height: 14),
              if (_register) ...[
                const SemLabel('Name'),
                TextField(
                  controller: _name,
                  textInputAction: TextInputAction.next,
                  decoration: const InputDecoration(hintText: 'Your name'),
                ),
                const SizedBox(height: 12),
              ],
              const SemLabel('Email'),
              TextField(
                controller: _email,
                keyboardType: TextInputType.emailAddress,
                textInputAction: TextInputAction.next,
                decoration: const InputDecoration(hintText: 'you@school.example'),
              ),
              const SizedBox(height: 12),
              const SemLabel('Password'),
              TextField(
                controller: _password,
                obscureText: _obscure,
                textInputAction: TextInputAction.done,
                onSubmitted: (_) => _submit(),
                decoration: InputDecoration(
                  hintText: _register ? 'at least 8 characters' : '',
                  suffixIcon: IconButton(
                    icon: Icon(
                      _obscure ? Icons.visibility_outlined : Icons.visibility_off_outlined,
                      size: 18,
                      color: sem.inkSoft,
                    ),
                    onPressed: () => setState(() => _obscure = !_obscure),
                  ),
                ),
              ),
              if (_error.isNotEmpty) ...[
                const SizedBox(height: 8),
                Text(_error, style: TextStyle(color: sem.marker, fontSize: 13)),
              ],
              const SizedBox(height: 16),
              SemPrimaryButton(
                onPressed: _busy ? null : _submit,
                child: _busy
                    ? const SizedBox(
                        width: 14,
                        height: 14,
                        child: CircularProgressIndicator(strokeWidth: 2))
                    : Text(_register ? 'Create account & sign in' : 'Sign in'),
              ),
              const SizedBox(height: 10),
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Icon(Icons.cloud_off_outlined, size: 12, color: sem.inkSoft),
                  const SizedBox(width: 6),
                  Expanded(
                    child: Text(
                      'Authenticated by your Appwrite project — the password never touches the '
                      'Semester server. Sessions are managed by the Appwrite SDK.',
                      style: Theme.of(context).textTheme.labelSmall!.copyWith(height: 1.5),
                    ),
                  ),
                ],
              ),
            ],

            const SizedBox(height: 20),
            Divider(height: 1, color: sem.line),
            const SizedBox(height: 14),
            const SemLabel('Semester server (AI + Vertretungsplan)'),
            TextField(
              controller: _server,
              keyboardType: TextInputType.url,
              decoration: const InputDecoration(hintText: 'https://your-semester-server:8899'),
              onSubmitted: (v) {
                Stores.I.settings.setServerUrl(v);
                setState(() {});
              },
            ),
            Padding(
              padding: const EdgeInsets.only(top: 6),
              child: Text(
                '10.0.2.2 = your computer from the Android emulator. Same server as the web app.',
                style: Theme.of(context).textTheme.labelSmall!.copyWith(height: 1.5),
              ),
            ),
          ],
        );
      },
    );
  }
}
