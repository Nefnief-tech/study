import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../appwrite/sync.dart';
import '../services/push.dart';
import '../stores/auth_store.dart';
import '../stores/registry.dart';
import '../theme/app_theme.dart';
import '../utils/utils.dart';
import 'controls.dart';

/// Port of AuthModal.tsx — sign in / create account / account management,
/// plus the device-local server URL setting, push status, email verification,
/// password recovery and two-factor authentication.
class AuthSheet extends StatefulWidget {
  const AuthSheet({super.key});

  static Future<void> show(BuildContext context) =>
      showSemSheet(context: context, title: 'Sign in to sync', builder: (_) => const AuthSheet());

  @override
  State<AuthSheet> createState() => _AuthSheetState();
}

class _AuthSheetState extends State<AuthSheet> {
  @override
  Widget build(BuildContext context) => const AuthPanel();
}

/// The full account surface — sign-in/-up, MFA sign-in step, verification,
/// 2FA setup, sync, push status — embedded by the Settings tab and wrapped
/// by the [AuthSheet] bottom sheet.
class AuthPanel extends StatefulWidget {
  const AuthPanel({super.key});

  @override
  State<AuthPanel> createState() => _AuthPanelState();
}

class _AuthPanelState extends State<AuthPanel> {
  bool _register = false;
  bool _recovery = false;
  bool _recoveryBusy = false;
  bool _recoverySent = false;
  bool _verifyBusy = false;
  bool _verifySent = false;
  String _recoveryError = '';
  String _verifyError = '';

  // two-factor sign-in step
  bool _mfaEmailFactor = true;
  bool _mfaTotpFactor = false;
  String _mfaFactor = 'email';
  String? _mfaChallengeId;
  bool _mfaSending = false;
  final _mfaCode = TextEditingController();
  bool _mfaBusy = false;

  // two-factor setup (signed in)
  bool _mfaSetupBusy = false;
  bool _mfaDisableConfirm = false;
  List<String>? _recoveryCodes;
  final _mfaSetupError = ValueNotifier<String>('');
  final _mfaStepError = ValueNotifier<String>('');

  final _name = TextEditingController();
  final _email = TextEditingController();
  final _password = TextEditingController();
  late final TextEditingController _server =
      TextEditingController(text: Stores.I.settings.serverUrl);
  bool _busy = false;
  String _error = '';
  bool _obscure = true;

  @override
  void initState() {
    super.initState();
    // a verification confirmed in the phone's browser (or elsewhere) should
    // show up the moment the sheet opens
    unawaited(refreshUser());
  }

  @override
  void dispose() {
    _name.dispose();
    _email.dispose();
    _password.dispose();
    _server.dispose();
    _mfaCode.dispose();
    _mfaSetupError.dispose();
    _mfaStepError.dispose();
    super.dispose();
  }

  Future<void> _sendVerification() async {
    setState(() {
      _verifyError = '';
      _verifyBusy = true;
    });
    try {
      await sendVerificationEmail();
      if (mounted) setState(() => _verifySent = true);
    } catch (e) {
      if (mounted) setState(() => _verifyError = _friendlyAuthError(e.toString()));
    } finally {
      if (mounted) setState(() => _verifyBusy = false);
    }
  }

  Future<void> _sendRecovery() async {
    setState(() {
      _recoveryError = '';
      _recoveryBusy = true;
    });
    try {
      await requestPasswordRecovery(_email.text.trim());
      if (mounted) setState(() => _recoverySent = true);
    } catch (e) {
      if (mounted) setState(() => _recoveryError = _friendlyAuthError(e.toString()));
    } finally {
      if (mounted) setState(() => _recoveryBusy = false);
    }
  }

  // ---- two-factor sign-in step ----

  bool _mfaStepActive = false;

  void _enterMfaStep(MfaRequiredException e) {
    setState(() {
      _mfaStepActive = true;
      _mfaEmailFactor = e.emailFactor;
      _mfaTotpFactor = e.totpFactor;
      _mfaFactor = e.totpFactor ? 'totp' : 'email';
      _mfaChallengeId = null;
      _mfaCode.clear();
      _mfaStepError.value = '';
    });
    if (_mfaFactor != 'recoverycode') unawaited(_startChallenge(_mfaFactor));
  }

  Future<void> _startChallenge(String factor) async {
    setState(() => _mfaSending = true);
    try {
      final id = await startMfaChallenge(factor);
      if (mounted) setState(() => _mfaChallengeId = id);
    } catch (e) {
      _mfaStepError.value = _friendlyMfaError(e.toString());
    } finally {
      if (mounted) setState(() => _mfaSending = false);
    }
  }

  void _switchMfaFactor(String f) {
    if (f == _mfaFactor) return;
    setState(() {
      _mfaFactor = f;
      _mfaChallengeId = null;
      _mfaCode.clear();
      _mfaStepError.value = '';
    });
    if (f != 'recoverycode') unawaited(_startChallenge(f));
  }

  void _resendMfaCode() {
    _mfaStepError.value = '';
    unawaited(_startChallenge('email'));
  }

  Future<void> _confirmMfa() async {
    final challengeId = _mfaChallengeId;
    if (challengeId == null) return;
    _mfaStepError.value = '';
    setState(() => _mfaBusy = true);
    try {
      await confirmMfaSignIn(challengeId, _mfaCode.text.trim());
      if (mounted) Navigator.of(context).pop();
    } catch (e) {
      _mfaStepError.value = _friendlyMfaError(e.toString());
    } finally {
      if (mounted) setState(() => _mfaBusy = false);
    }
  }

  Future<void> _cancelMfa() async {
    await cancelMfaSignIn();
    if (mounted) {
      setState(() {
        _mfaStepActive = false;
        _mfaChallengeId = null;
        _mfaCode.clear();
      });
    }
  }

  // ---- two-factor setup (signed in) ----

  Future<void> _enableMfa() async {
    _mfaSetupError.value = '';
    setState(() => _mfaSetupBusy = true);
    try {
      await setMfaEnabled(true);
      final codes = await getOrCreateRecoveryCodes();
      if (mounted) setState(() => _recoveryCodes = codes);
    } catch (e) {
      _mfaSetupError.value = _friendlyAuthError(e.toString());
    } finally {
      if (mounted) setState(() => _mfaSetupBusy = false);
    }
  }

  Future<void> _disableMfa() async {
    _mfaSetupError.value = '';
    setState(() => _mfaSetupBusy = true);
    try {
      await setMfaEnabled(false);
      if (mounted) setState(() => _mfaDisableConfirm = false);
    } catch (e) {
      _mfaSetupError.value = _friendlyAuthError(e.toString());
    } finally {
      if (mounted) setState(() => _mfaSetupBusy = false);
    }
  }

  String _friendlyMfaError(String raw) {
    if (raw.contains('rate')) return 'Too many attempts — wait a minute and try again.';
    if (raw.contains('challenge') || raw.contains('expired')) {
      return 'This code request ran out — send a new one.';
    }
    if (raw.contains('invalid') || raw.contains('token') || raw.contains('credentials')) {
      return "That code isn't right — check the newest email (or recovery code) and try again.";
    }
    if (raw.contains('smtp')) return "The mail server isn't configured for this project yet.";
    if (raw.length > 200) return raw.substring(0, 200);
    return raw;
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
    } on MfaRequiredException catch (e) {
      _password.clear();
      _enterMfaStep(e);
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
    if (raw.contains('already_verified') || raw.contains('already')) {
      return 'This email is already verified.';
    }
    if (raw.contains('invalid_token') || raw.contains('expired')) {
      return 'This link is invalid or has expired. Request a new one.';
    }
    if (raw.contains('rate_limit')) return 'Too many requests — wait a minute and try again.';
    if (raw.contains('smtp') || raw.contains('mail')) {
      return 'The mail server isn\'t configured for this project yet.';
    }
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
              if (!Stores.I.auth.user!.emailVerified) ...[
                const SizedBox(height: 4),
                Text(
                  'email · not verified yet',
                  style: Theme.of(context)
                      .textTheme
                      .labelSmall!
                      .copyWith(color: sem.amber),
                ),
                const SizedBox(height: 10),
                SemGhostButton(
                  onPressed: _verifyBusy ? null : _sendVerification,
                  child: _verifyBusy
                      ? const SizedBox(
                          width: 14,
                          height: 14,
                          child: CircularProgressIndicator(strokeWidth: 2))
                      : const Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Icon(Icons.mark_email_read_outlined, size: 16),
                            SizedBox(width: 6),
                            Text('Send verification email'),
                          ],
                        ),
                ),
                if (_verifySent) ...[
                  const SizedBox(height: 6),
                  Text(
                    'sent — follow the link in your inbox (valid 7 days)',
                    style: Theme.of(context)
                        .textTheme
                        .labelSmall!
                        .copyWith(color: sem.accent),
                  ),
                ],
                if (_verifyError.isNotEmpty) ...[
                  const SizedBox(height: 6),
                  Text(_verifyError, style: TextStyle(color: sem.marker, fontSize: 13)),
                ],
              ] else ...[
                const SizedBox(height: 4),
                Text(
                  'email · verified',
                  style: Theme.of(context)
                      .textTheme
                      .labelSmall!
                      .copyWith(color: sem.accent),
                ),
              ],
              const SizedBox(height: 12),
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: sem.paper,
                  border: Border.all(color: sem.line),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            'TWO-FACTOR VIA EMAIL',
                            style: Theme.of(context).textTheme.labelSmall!.copyWith(
                                  color: sem.inkSoft,
                                  letterSpacing: 1.2,
                                ),
                          ),
                        ),
                        Icon(
                          Stores.I.auth.user!.mfa
                              ? Icons.verified_user_outlined
                              : Icons.gpp_maybe_outlined,
                          size: 16,
                          color: Stores.I.auth.user!.mfa ? sem.accent : sem.inkSoft,
                        ),
                      ],
                    ),
                    const SizedBox(height: 8),
                    if (!Stores.I.auth.user!.mfa && !_mfaDisableConfirm)
                      SemGhostButton(
                        onPressed: _mfaSetupBusy ? null : _enableMfa,
                        child: _mfaSetupBusy
                            ? const SizedBox(
                                width: 14,
                                height: 14,
                                child: CircularProgressIndicator(strokeWidth: 2))
                            : const Row(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  Icon(Icons.verified_user_outlined, size: 16),
                                  SizedBox(width: 6),
                                  Text('Enable 2FA'),
                                ],
                              ),
                      ),
                    if (Stores.I.auth.user!.mfa && !_mfaDisableConfirm)
                      SemGhostButton(
                        onPressed: _mfaSetupBusy ? null : () => setState(() => _mfaDisableConfirm = true),
                        foreground: sem.marker,
                        border: sem.marker.withValues(alpha: 0.4),
                        child: const Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Icon(Icons.gpp_bad_outlined, size: 16),
                            SizedBox(width: 6),
                            Text('Disable 2FA'),
                          ],
                        ),
                      ),
                    if (_mfaDisableConfirm && !_mfaSetupBusy)
                      Text(
                        'Turn off two-factor? You\'ll sign in with just the password again. '
                        'This cannot be undone from here without re-enabling.',
                        style: Theme.of(context).textTheme.labelSmall!.copyWith(height: 1.5),
                      ),
                    if (_mfaDisableConfirm)
                      Row(
                        mainAxisAlignment: MainAxisAlignment.end,
                        children: [
                          TextButton(
                            onPressed: _disableMfa,
                            child: Text('Yes, disable',
                                style: TextStyle(color: sem.marker, fontSize: 12)),
                          ),
                          TextButton(
                            onPressed: () => setState(() => _mfaDisableConfirm = false),
                            child: const Text('keep it on', style: TextStyle(fontSize: 12)),
                          ),
                        ],
                      ),
                    ValueListenableBuilder<String>(
                      valueListenable: _mfaSetupError,
                      builder: (context, err, _) => err.isEmpty
                          ? const SizedBox.shrink()
                          : Text(err, style: TextStyle(color: sem.marker, fontSize: 13)),
                    ),
                    if (!Stores.I.auth.user!.mfa)
                      Text(
                        'asks for an emailed code at every sign-in · needs a verified email',
                        style: Theme.of(context).textTheme.labelSmall!.copyWith(height: 1.5),
                      ),
                  ],
                ),
              ),
              if (_recoveryCodes != null) ...[
                const SizedBox(height: 12),
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: sem.paper,
                    border: Border.all(color: sem.accent.withValues(alpha: 0.5)),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Two-factor is on. Save these recovery codes — each works once '
                        'instead of an emailed code, and they are the only way back if '
                        'you lose access to your inbox.',
                        style: Theme.of(context).textTheme.labelSmall!.copyWith(height: 1.5),
                      ),
                      const SizedBox(height: 8),
                      Container(
                        width: double.infinity,
                        padding: const EdgeInsets.all(10),
                        decoration: BoxDecoration(
                          color: sem.card,
                          border: Border.all(color: sem.line),
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            for (final code in _recoveryCodes!)
                              Text(code,
                                  style: Theme.of(context)
                                      .textTheme
                                      .labelSmall!
                                      .copyWith(fontFamily: 'monospace')),
                          ],
                        ),
                      ),
                      const SizedBox(height: 8),
                      Row(
                        children: [
                          Expanded(
                            child: SemGhostButton(
                              onPressed: () async {
                                await Clipboard.setData(
                                    ClipboardData(text: _recoveryCodes!.join('\n')));
                                if (mounted) setState(() {});
                              },
                              child: const Row(
                                mainAxisSize: MainAxisSize.min,
                                children: [Icon(Icons.copy_outlined, size: 16), SizedBox(width: 6), Text('Copy')],
                              ),
                            ),
                          ),
                          const SizedBox(width: 8),
                          Expanded(
                            child: SemPrimaryButton(
                              onPressed: () => setState(() => _recoveryCodes = null),
                              child: const Text('Done'),
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              ],
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

            if (!signedInNow && Stores.I.auth.status != SyncStatus.loading && _mfaStepActive) ...[
              Text(
                'Two-factor',
                style: Theme.of(context)
                    .textTheme
                    .titleMedium!
                    .copyWith(fontWeight: FontWeight.w600),
              ),
              const SizedBox(height: 6),
              Text(
                _mfaFactor == 'email'
                    ? 'We sent a code to your email — it expires in 15 minutes.'
                    : _mfaFactor == 'totp'
                        ? 'Use your authenticator app to continue.'
                        : 'Use one of the recovery codes you saved when enabling 2FA.',
                style: Theme.of(context).textTheme.labelSmall!.copyWith(height: 1.5),
              ),
              if (_mfaFactor == 'email' && _mfaChallengeId == null) ...[
                const SizedBox(height: 8),
                Text(
                  _mfaSending ? 'sending the code…' : 'the code could not be sent — try resending',
                  style: Theme.of(context).textTheme.labelSmall,
                ),
              ],
              const SizedBox(height: 14),
              const SemLabel('Code'),
              TextField(
                controller: _mfaCode,
                keyboardType:
                    _mfaFactor == 'recoverycode' ? TextInputType.text : TextInputType.number,
                textInputAction: TextInputAction.done,
                onSubmitted: (_) => _confirmMfa(),
              ),
              const SizedBox(height: 12),
              ValueListenableBuilder<String>(
                valueListenable: _mfaStepError,
                builder: (context, err, _) => err.isEmpty
                    ? const SizedBox.shrink()
                    : Text(err, style: TextStyle(color: sem.marker, fontSize: 13)),
              ),
              const SizedBox(height: 12),
              SemPrimaryButton(
                onPressed: (_mfaBusy || _mfaChallengeId == null) ? null : _confirmMfa,
                child: _mfaBusy
                    ? const SizedBox(
                        width: 14,
                        height: 14,
                        child: CircularProgressIndicator(strokeWidth: 2))
                    : const Text('Verify code'),
              ),
              const SizedBox(height: 4),
              Wrap(
                spacing: 12,
                children: [
                  TextButton(
                    onPressed: _cancelMfa,
                    style: TextButton.styleFrom(
                      padding: const EdgeInsets.symmetric(horizontal: 0),
                      minimumSize: const Size(0, 32),
                      tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                    ),
                    child: Text('back to sign in',
                        style: Theme.of(context)
                            .textTheme
                            .labelSmall!
                            .copyWith(color: sem.inkSoft)),
                  ),
                  if (_mfaFactor != 'email' && _mfaEmailFactor)
                    TextButton(
                      onPressed: () => _switchMfaFactor('email'),
                      style: TextButton.styleFrom(
                        padding: const EdgeInsets.symmetric(horizontal: 0),
                        minimumSize: const Size(0, 32),
                        tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                      ),
                      child: Text('email code',
                          style: Theme.of(context)
                              .textTheme
                              .labelSmall!
                              .copyWith(color: sem.inkSoft)),
                    ),
                  if (_mfaFactor != 'totp' && _mfaTotpFactor)
                    TextButton(
                      onPressed: () => _switchMfaFactor('totp'),
                      style: TextButton.styleFrom(
                        padding: const EdgeInsets.symmetric(horizontal: 0),
                        minimumSize: const Size(0, 32),
                        tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                      ),
                      child: Text('authenticator',
                          style: Theme.of(context)
                              .textTheme
                              .labelSmall!
                              .copyWith(color: sem.inkSoft)),
                    ),
                  if (_mfaFactor != 'recoverycode')
                    TextButton(
                      onPressed: () => _switchMfaFactor('recoverycode'),
                      style: TextButton.styleFrom(
                        padding: const EdgeInsets.symmetric(horizontal: 0),
                        minimumSize: const Size(0, 32),
                        tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                      ),
                      child: Text('recovery code',
                          style: Theme.of(context)
                              .textTheme
                              .labelSmall!
                              .copyWith(color: sem.inkSoft)),
                    ),
                  if (_mfaFactor == 'email' && _mfaChallengeId != null)
                    TextButton(
                      onPressed: _resendMfaCode,
                      style: TextButton.styleFrom(
                        padding: const EdgeInsets.symmetric(horizontal: 0),
                        minimumSize: const Size(0, 32),
                        tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                      ),
                      child: Text('resend',
                          style: Theme.of(context)
                              .textTheme
                              .labelSmall!
                              .copyWith(color: sem.inkSoft)),
                    ),
                ],
              ),
            ],
            if (!signedInNow && Stores.I.auth.status != SyncStatus.loading && !_mfaStepActive) ...[
              if (_recovery) ...[
                Text(
                  'Forgot your password?',
                  style: Theme.of(context)
                      .textTheme
                      .titleMedium!
                      .copyWith(fontWeight: FontWeight.w600),
                ),
                const SizedBox(height: 6),
                Text(
                  'We\'ll send a reset link to your email. It opens on any device — '
                  'the new password is set in the browser.',
                  style: Theme.of(context).textTheme.labelSmall!.copyWith(height: 1.5),
                ),
                const SizedBox(height: 14),
                const SemLabel('Email'),
                TextField(
                  controller: _email,
                  keyboardType: TextInputType.emailAddress,
                  textInputAction: TextInputAction.done,
                  onSubmitted: (_) => _sendRecovery(),
                  decoration: const InputDecoration(hintText: 'you@school.example'),
                ),
                if (_recoverySent) ...[
                  const SizedBox(height: 8),
                  Text(
                    'recovery email sent — valid for 1 hour',
                    style: Theme.of(context)
                        .textTheme
                        .labelSmall!
                        .copyWith(color: sem.accent),
                  ),
                ],
                if (_recoveryError.isNotEmpty) ...[
                  const SizedBox(height: 8),
                  Text(_recoveryError, style: TextStyle(color: sem.marker, fontSize: 13)),
                ],
                const SizedBox(height: 16),
                SemPrimaryButton(
                  onPressed: _recoveryBusy ? null : _sendRecovery,
                  child: _recoveryBusy
                      ? const SizedBox(
                          width: 14,
                          height: 14,
                          child: CircularProgressIndicator(strokeWidth: 2))
                      : const Text('Send recovery link'),
                ),
                const SizedBox(height: 4),
                TextButton(
                  onPressed: () => setState(() {
                    _recovery = false;
                    _recoverySent = false;
                    _recoveryError = '';
                  }),
                  child: const Text('Back to sign in'),
                ),
              ] else ...[
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
                if (!_register)
                  Align(
                    alignment: Alignment.centerLeft,
                    child: Padding(
                      padding: const EdgeInsets.only(top: 4),
                      child: TextButton(
                        style: TextButton.styleFrom(
                          padding: const EdgeInsets.symmetric(horizontal: 0),
                          minimumSize: const Size(0, 32),
                          tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                        ),
                        onPressed: () => setState(() {
                          _recovery = true;
                          _recoverySent = false;
                          _recoveryError = '';
                        }),
                        child: Text(
                          'Forgot password?',
                          style: Theme.of(context)
                              .textTheme
                              .labelSmall!
                              .copyWith(color: sem.inkSoft),
                        ),
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
