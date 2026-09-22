import 'package:flutter/material.dart';

import '../theme/app_theme.dart';
import '../widgets/auth_sheet.dart';
import '../widgets/controls.dart';

/// Settings tab — the account surface (sign-in/-up, 2FA, verification,
/// sync, push status) as a first-class destination instead of a modal.
class SettingsPage extends StatelessWidget {
  const SettingsPage({super.key});

  @override
  Widget build(BuildContext context) {
    final sem = context.sem;
    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          PageHeader(
            title: 'Settings',
            subtitle: 'account · two-factor · sync · push',
          ),
          SemCard(
            padding: const EdgeInsets.all(16),
            child: AuthPanel(),
          ),
          const SizedBox(height: 24),
          Text(
            'Semester for Android · your data lives in your Appwrite project',
            style: Theme.of(context)
                .textTheme
                .labelSmall!
                .copyWith(color: sem.inkSoft, letterSpacing: 0.4),
          ),
        ],
      ),
    );
  }
}
