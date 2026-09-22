import 'package:flutter/material.dart';

import '../theme/app_theme.dart';
import 'motion.dart';

/// The web app's component classes from globals.css — `.btn-primary`,
/// `.btn-ghost`, `.btn-icon`, `.card`, `.label`, and the segmented pill group
/// used by the filters, plus the Modal port as a mobile bottom sheet.

/* ---------------- buttons ---------------- */

class SemPrimaryButton extends StatelessWidget {
  final VoidCallback? onPressed;
  final Widget child;
  const SemPrimaryButton({super.key, required this.onPressed, required this.child});

  @override
  Widget build(BuildContext context) {
    final sem = context.sem;
    return FilledButton(
      onPressed: onPressed,
      style: FilledButton.styleFrom(
        backgroundColor: sem.ink,
        foregroundColor: sem.paper,
        disabledBackgroundColor: sem.ink.withValues(alpha: 0.4),
        disabledForegroundColor: sem.paper.withValues(alpha: 0.8),
        elevation: 0,
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
        textStyle: Theme.of(context)
            .textTheme
            .bodyMedium!
            .copyWith(color: sem.paper, fontWeight: FontWeight.w500),
      ),
      child: child,
    );
  }
}

class SemGhostButton extends StatelessWidget {
  final VoidCallback? onPressed;
  final Widget child;
  final Color? foreground;
  final Color? border;
  const SemGhostButton({
    super.key,
    required this.onPressed,
    required this.child,
    this.foreground,
    this.border,
  });

  @override
  Widget build(BuildContext context) {
    final sem = context.sem;
    return OutlinedButton(
      onPressed: onPressed,
      style: OutlinedButton.styleFrom(
        backgroundColor: sem.card,
        foregroundColor: foreground ?? sem.ink,
        disabledForegroundColor: sem.inkSoft,
        side: BorderSide(color: border ?? sem.line),
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
        textStyle: Theme.of(context).textTheme.bodyMedium!.copyWith(fontWeight: FontWeight.w400),
      ),
      child: child,
    );
  }
}

class SemIconButton extends StatelessWidget {
  final VoidCallback? onPressed;
  final IconData icon;
  final Color? color;
  final double size;
  final String? tooltip;
  const SemIconButton({
    super.key,
    required this.onPressed,
    required this.icon,
    this.color,
    this.size = 18,
    this.tooltip,
  });

  @override
  Widget build(BuildContext context) {
    final sem = context.sem;
    final button = InkResponse(
      onTap: onPressed,
      radius: 20,
      child: SizedBox(
        width: 32,
        height: 32,
        child: Icon(icon, size: size, color: color ?? sem.inkSoft),
      ),
    );
    return tooltip == null ? button : Tooltip(message: tooltip!, child: button);
  }
}

/* ---------------- segmented toggle (open/done/all, month/week, …) ---------------- */

class SegToggle<T> extends StatelessWidget {
  final List<(T, String)> options;
  final T selected;
  final ValueChanged<T> onChanged;
  const SegToggle({
    super.key,
    required this.options,
    required this.selected,
    required this.onChanged,
  });

  @override
  Widget build(BuildContext context) {
    final sem = context.sem;
    return Container(
      padding: const EdgeInsets.all(2),
      decoration: BoxDecoration(
        color: sem.card,
        border: Border.all(color: sem.line),
        borderRadius: BorderRadius.circular(14),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          for (final (value, label) in options)
            InkWell(
              onTap: () => onChanged(value),
              borderRadius: BorderRadius.circular(10),
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                decoration: BoxDecoration(
                  color: value == selected ? sem.ink : Colors.transparent,
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Text(
                  label.toUpperCase(),
                  style: Theme.of(context).textTheme.labelMedium!.copyWith(
                        fontSize: 11,
                        color: value == selected ? sem.paper : sem.inkSoft,
                        fontWeight: FontWeight.w500,
                      ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

/* ---------------- cards & labels ---------------- */

class SemCard extends StatelessWidget {
  final Widget child;
  final EdgeInsetsGeometry padding;
  final Color? color;
  final Color? borderColor;
  final VoidCallback? onTap;
  const SemCard({
    super.key,
    required this.child,
    this.padding = EdgeInsets.zero,
    this.color,
    this.borderColor,
    this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final sem = context.sem;
    final card = Container(
      padding: padding,
      decoration: BoxDecoration(
        color: color ?? sem.card,
        border: Border.all(color: borderColor ?? sem.line),
        borderRadius: BorderRadius.circular(20),
      ),
      child: child,
    );
    if (onTap == null) return card;
    return Pressable(onTap: onTap, child: card);
  }
}

/// `.label` — mono uppercase section label
class SemLabel extends StatelessWidget {
  final String text;
  const SemLabel(this.text, {super.key});

  @override
  Widget build(BuildContext context) {
    final sem = context.sem;
    return Text(
      text.toUpperCase(),
      style: Theme.of(context).textTheme.labelSmall!.copyWith(
            fontSize: 11,
            letterSpacing: 0.9,
            color: sem.inkSoft,
          ),
    );
  }
}

/// page header — big Fraunces title + mono subtitle, like every web page
class PageHeader extends StatelessWidget {
  final String title;
  final String? subtitle;
  final Widget? trailing;
  const PageHeader({super.key, required this.title, this.subtitle, this.trailing});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Text(
                  title,
                  style: Theme.of(context).textTheme.displayMedium,
                ),
              ),
              if (trailing != null) trailing!,
            ],
          ),
          if (subtitle != null) ...[
            const SizedBox(height: 4),
            Text(
              subtitle!,
              style: Theme.of(context)
                  .textTheme
                  .labelMedium!
                  .copyWith(fontSize: 12, letterSpacing: 0.4),
            ),
          ],
        ],
      ),
    );
  }
}

/* ---------------- bottom-sheet modal (port of Modal.tsx, mobile native) ---------------- */

/// the web Modal renders as a bottom sheet on phones — the Flutter port is a
/// bottom sheet everywhere, with the same header (title + X) and content
Future<T?> showSemSheet<T>({
  required BuildContext context,
  required String title,
  required WidgetBuilder builder,
  bool isScrollControlled = true,
  bool isDismissible = true,
}) {
  final sem = context.sem;
  return showModalBottomSheet<T>(
    context: context,
    isScrollControlled: isScrollControlled,
    isDismissible: isDismissible,
    enableDrag: isDismissible,
    shape: RoundedRectangleBorder(
      borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
      side: BorderSide(color: sem.line),
    ),
    builder: (sheetContext) {
      final theme = Theme.of(sheetContext);
      return Padding(
        padding: EdgeInsets.only(
          bottom: MediaQuery.viewInsetsOf(sheetContext).bottom,
        ),
        child: ConstrainedBox(
          constraints: BoxConstraints(
            maxHeight: MediaQuery.sizeOf(sheetContext).height * 0.92,
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 4, 12, 12),
                child: Row(
                  children: [
                    Expanded(
                      child: Text(title, style: theme.textTheme.headlineSmall),
                    ),
                    SemIconButton(
                      icon: Icons.close,
                      onPressed: () => Navigator.of(sheetContext).pop(),
                    ),
                  ],
                ),
              ),
              Divider(height: 1, thickness: 1, color: sem.line),
              Flexible(
                child: SingleChildScrollView(
                  padding: const EdgeInsets.all(20),
                  child: Builder(builder: builder),
                ),
              ),
            ],
          ),
        ),
      );
    },
  );
}

/* ---------------- planner grid background (the dotted desk) ---------------- */

class PlannerGrid extends StatelessWidget {
  final Widget child;
  const PlannerGrid({super.key, required this.child});

  @override
  Widget build(BuildContext context) {
    final sem = context.sem;
    return CustomPaint(
      foregroundPainter: _DotGridPainter(color: sem.grid, spacing: 22),
      child: child,
    );
  }
}

class _DotGridPainter extends CustomPainter {
  final Color color;
  final double spacing;
  _DotGridPainter({required this.color, required this.spacing});

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()..color = color;
    const r = 1.0;
    for (double x = 0; x < size.width + spacing; x += spacing) {
      for (double y = 0; y < size.height + spacing; y += spacing) {
        canvas.drawCircle(Offset(x, y), r, paint);
      }
    }
  }

  @override
  bool shouldRepaint(_DotGridPainter oldDelegate) => oldDelegate.color != color;
}

/* ---------------- confirm dialog (window.confirm port) ---------------- */

Future<bool> confirmDialog(
  BuildContext context,
  String message, {
  String title = 'Are you sure?',
  String confirmLabel = 'Delete',
}) async {
  final sem = context.sem;
  final res = await showDialog<bool>(
    context: context,
    builder: (dialogContext) => AlertDialog(
      title: Text(title),
      content: Text(message),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(dialogContext).pop(false),
          child: Text('Cancel', style: TextStyle(color: sem.inkSoft)),
        ),
        TextButton(
          onPressed: () => Navigator.of(dialogContext).pop(true),
          child: Text(confirmLabel, style: TextStyle(color: sem.marker, fontWeight: FontWeight.w600)),
        ),
      ],
    ),
  );
  return res == true;
}
