import 'package:flutter/material.dart';

import '../navigation.dart';
import '../theme/app_theme.dart';
import '../widgets/controls.dart';
import '../widgets/motion.dart';

/// the More tab — everything that doesn't need a permanent bottom-bar slot.
/// Destinations open as pushed full-screen pages, so the system back gesture
/// returns here naturally.
class MorePage extends StatelessWidget {
  const MorePage({super.key});

  @override
  Widget build(BuildContext context) {
    final sem = context.sem;
    final items = [
      (Icons.calendar_month_outlined, 'Calendar', 'exams, deadlines and events', 'calendar'),
      (Icons.calculate_outlined, 'Grades', 'points, averages per subject', 'grades'),
      (Icons.auto_awesome_outlined, 'Study Room', 'documents, flashcards and the AI tutor', 'study'),
      (Icons.settings_outlined, 'Settings', 'account, two-factor, sync and push', 'settings'),
    ];

    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const PageHeader(
            title: 'More',
            subtitle: 'calendar · grades · study · settings',
          ),
          SemCard(
            padding: const EdgeInsets.symmetric(vertical: 4),
            child: Column(
              children: [
                for (var i = 0; i < items.length; i++) ...[
                  if (i > 0)
                    Divider(height: 1, indent: 56, color: sem.line),
                  Pressable(
                    onTap: () => AppNav.I.handle(items[i].$4),
                    child: ListTile(
                      leading: Icon(items[i].$1, size: 22, color: sem.accent),
                      title: Text(
                        items[i].$2,
                        style: Theme.of(context)
                            .textTheme
                            .bodyLarge!
                            .copyWith(fontWeight: FontWeight.w500),
                      ),
                      subtitle: Text(
                        items[i].$3,
                        style: Theme.of(context)
                            .textTheme
                            .labelSmall!
                            .copyWith(color: sem.inkSoft),
                      ),
                      trailing: Icon(Icons.chevron_right,
                          size: 18, color: sem.inkSoft),
                    ),
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}
