import 'package:flutter/material.dart';

import '../models/types.dart';
import '../theme/app_theme.dart';
import '../utils/utils.dart';

/// Port of the web app's `src/components/ui/bits.tsx` + the `.chip`/`.card`
/// component classes from globals.css.

Color colorFromHex(String hex) {
  var h = hex.replaceFirst('#', '');
  if (h.length == 6) h = 'FF$h';
  return Color(int.tryParse(h, radix: 16) ?? 0xFF3E6B4F);
}

Color toneColor(BuildContext context, Tone tone) {
  final sem = context.sem;
  switch (tone) {
    case Tone.good:
      return sem.accent;
    case Tone.ok:
      return sem.info;
    case Tone.warn:
      return sem.amber;
    case Tone.bad:
      return sem.marker;
    case Tone.neutral:
      return sem.inkSoft;
  }
}

/* ---------------- chips ---------------- */

class SemChip extends StatelessWidget {
  final Widget? leading;
  final String? text;
  final Widget? child;
  final Tone? tone;
  final bool mono;
  final bool uppercase;
  final EdgeInsetsGeometry padding;

  const SemChip({
    super.key,
    this.leading,
    this.text,
    this.child,
    this.tone,
    this.mono = false,
    this.uppercase = false,
    this.padding = const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
  });

  @override
  Widget build(BuildContext context) {
    final sem = context.sem;
    final tone = this.tone;
    final border = tone == null ? sem.line : toneColor(context, tone).withValues(alpha: 0.4);
    final bg = tone == null ? sem.paper : toneColor(context, tone).withValues(alpha: 0.1);
    final fg = tone == null ? sem.ink : toneColor(context, tone);

    final TextStyle base = mono
        ? Theme.of(context).textTheme.labelMedium!.copyWith(color: fg)
        : Theme.of(context).textTheme.bodySmall!.copyWith(color: fg, fontSize: 11);
    final style = uppercase ? base.copyWith(letterSpacing: 0.8, fontWeight: FontWeight.w500) : base;

    return Container(
      padding: padding,
      decoration: BoxDecoration(
        color: bg,
        border: Border.all(color: border),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (leading != null) ...[leading!, const SizedBox(width: 4)],
          if (child != null)
            child!
          else if (text != null)
            Flexible(
              child: Text(
                uppercase ? text!.toUpperCase() : text!,
                style: style,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
            ),
        ],
      ),
    );
  }
}

class SubjectDot extends StatelessWidget {
  final String color;
  final double size;
  const SubjectDot(this.color, {super.key, this.size = 10});

  @override
  Widget build(BuildContext context) => Container(
        width: size,
        height: size,
        decoration: BoxDecoration(color: colorFromHex(color), shape: BoxShape.circle),
      );
}

class SubjectTag extends StatelessWidget {
  final String name;
  final String color;
  const SubjectTag(this.name, this.color, {super.key});

  @override
  Widget build(BuildContext context) =>
      SemChip(leading: SubjectDot(color), text: name);
}

class PriorityBadge extends StatelessWidget {
  final Priority priority;
  const PriorityBadge(this.priority, {super.key});

  @override
  Widget build(BuildContext context) {
    final tone = switch (priority) {
      Priority.high => Tone.bad,
      Priority.medium => Tone.warn,
      Priority.low => Tone.neutral,
    };
    return SemChip(
      tone: tone,
      mono: true,
      uppercase: true,
      text: priority.name,
      leading: Icon(Icons.flag_outlined, size: 11, color: toneColor(context, tone)),
    );
  }
}

class DueChip extends StatelessWidget {
  final String? due;
  final bool done;
  const DueChip(this.due, {super.key, this.done = false});

  @override
  Widget build(BuildContext context) {
    final info = dueInfo(due);
    if (info == null) return const SizedBox.shrink();
    final alarming = info.overdue && !done;
    final hot = !alarming && info.isToday && !done;
    return SemChip(
      mono: true,
      tone: alarming ? Tone.bad : (hot ? Tone.warn : null),
      text: alarming ? 'Overdue — ${info.label}' : info.label,
      leading: Icon(
        Icons.schedule,
        size: 11,
        color: alarming || hot ? toneColor(context, alarming ? Tone.bad : Tone.warn) : null,
      ),
    );
  }
}

/// German Punkte → classic +/− grade badge, e.g. "12 Pkt = 2+"
class GradeBadge extends StatelessWidget {
  final num points;
  final bool big;
  const GradeBadge(this.points, {super.key, this.big = false});

  @override
  Widget build(BuildContext context) {
    final t = pointsToGrade(points);
    final color = toneColor(context, t.tone);
    return Container(
      padding: big
          ? const EdgeInsets.symmetric(horizontal: 12, vertical: 5)
          : const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
      decoration: BoxDecoration(
        border: Border.all(color: color.withValues(alpha: 0.3)),
        borderRadius: BorderRadius.circular(999),
        color: color.withValues(alpha: 0.1),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (big) ...[
            Text(
              '${formatPoints(points)} →',
              style: Theme.of(context)
                  .textTheme
                  .labelMedium!
                  .copyWith(color: color, fontWeight: FontWeight.w400),
            ),
            const SizedBox(width: 5),
          ],
          Text(
            t.grade,
            style: Theme.of(context)
                .textTheme
                .labelMedium!
                .copyWith(color: color, fontWeight: FontWeight.w600, fontSize: big ? 14 : 11),
          ),
        ],
      ),
    );
  }
}

/* ---------------- empty state ---------------- */

class EmptyState extends StatelessWidget {
  final IconData? icon;
  final String title;
  final String? hint;
  final Widget? action;

  const EmptyState({super.key, this.icon, required this.title, this.hint, this.action});

  @override
  Widget build(BuildContext context) {
    final sem = context.sem;
    return CustomPaint(
      foregroundPainter: DashedRRectPainter(color: sem.line),
      child: Container(
        width: double.infinity,
        padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 44),
        decoration: BoxDecoration(
          color: sem.card.withValues(alpha: 0.6),
          borderRadius: BorderRadius.circular(20),
        ),
        child: Column(
          children: [
            if (icon != null) ...[
              Icon(icon, size: 32, color: sem.inkSoft),
              const SizedBox(height: 12),
            ],
            Text(
              title,
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.titleLarge,
            ),
            if (hint != null) ...[
              const SizedBox(height: 4),
              ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 380),
                child: Text(
                  hint!,
                  textAlign: TextAlign.center,
                  style: Theme.of(context).textTheme.bodyMedium!.copyWith(color: sem.inkSoft),
                ),
              ),
            ],
            if (action != null) ...[const SizedBox(height: 16), action!],
          ],
        ),
      ),
    );
  }
}

/// dashed rounded-rect outline (CSS `border-dashed` equivalent)
class DashedRRectPainter extends CustomPainter {
  final Color color;
  final double radius;
  const DashedRRectPainter({required this.color, this.radius = 16});

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = color
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1;
    final rrect = RRect.fromRectAndRadius(
      Offset.zero & size,
      Radius.circular(radius),
    );
    final path = Path()..addRRect(rrect);
    final dest = Path();
    const dash = [5, 4];
    var i = 0;
    for (final metric in path.computeMetrics()) {
      var dist = 0.0;
      var draw = true;
      while (dist < metric.length) {
        final len = dash[i % dash.length];
        i++;
        if (draw) {
          dest.addPath(metric.extractPath(dist, dist + len), Offset.zero);
        }
        dist += len;
        draw = !draw;
      }
    }
    canvas.drawPath(dest, paint);
  }

  @override
  bool shouldRepaint(DashedRRectPainter oldDelegate) => oldDelegate.color != color;
}
