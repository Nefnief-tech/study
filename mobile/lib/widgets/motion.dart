import 'package:flutter/material.dart';

/// Shared motion for the app — one place so durations and curves stay
/// coherent: fast, understated, ease-out (Material fade-through feel).

const Duration kMotionFast = Duration(milliseconds: 150);
const Duration kMotionBase = Duration(milliseconds: 240);
const Curve kMotionCurve = Curves.easeOutCubic;

/// page transition: content fades in while sliding up a couple of pixels —
/// used for pushed pages (Homework, Grades) instead of the stock jump-cut
class FadeThroughRoute<T> extends PageRouteBuilder<T> {
  FadeThroughRoute({required Widget page})
      : super(
          transitionDuration: kMotionBase,
          reverseTransitionDuration: kMotionFast,
          pageBuilder: (_, _, _) => page,
          transitionsBuilder: (_, animation, _, child) {
            final t = CurvedAnimation(parent: animation, curve: kMotionCurve);
            return FadeTransition(
              opacity: t,
              child: SlideTransition(
                position: Tween(
                  begin: const Offset(0, 0.02),
                  end: Offset.zero,
                ).animate(t),
                child: child,
              ),
            );
          },
        );
}

/// subtle press feedback: scales to 0.98 while pressed, springs back on
/// release — wrap any tappable card or tile
class Pressable extends StatefulWidget {
  final Widget child;
  final VoidCallback? onTap;
  const Pressable({super.key, required this.child, this.onTap});

  @override
  State<Pressable> createState() => _PressableState();
}

class _PressableState extends State<Pressable> {
  bool _down = false;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTapDown: widget.onTap == null ? null : (_) => setState(() => _down = true),
      onTapUp: (_) => setState(() => _down = false),
      onTapCancel: () => setState(() => _down = false),
      onTap: widget.onTap,
      child: AnimatedScale(
        scale: _down ? 0.98 : 1,
        duration: kMotionFast,
        curve: kMotionCurve,
        child: widget.child,
      ),
    );
  }
}

/// shell tab fade-through: each tab animates in when it becomes the selected
/// one while the IndexedStack underneath keeps every page's state alive
class TabFader extends StatelessWidget {
  final bool selected;
  final Widget child;
  const TabFader({super.key, required this.selected, required this.child});

  @override
  Widget build(BuildContext context) {
    return AnimatedSlide(
      offset: selected ? Offset.zero : const Offset(0, 0.015),
      duration: kMotionBase,
      curve: kMotionCurve,
      child: AnimatedOpacity(
        opacity: selected ? 1 : 0,
        duration: kMotionBase,
        curve: kMotionCurve,
        child: AnimatedScale(
          scale: selected ? 1 : 0.995,
          duration: kMotionBase,
          curve: kMotionCurve,
          child: child,
        ),
      ),
    );
  }
}
