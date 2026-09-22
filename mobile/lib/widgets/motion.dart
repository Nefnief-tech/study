import 'package:flutter/material.dart';

/// Shared motion for the app — one place so durations and curves stay
/// coherent: fast, understated, ease-out. Tab switches ride on the PageView
/// swipe itself; this covers press feedback and anything else animated.

const Duration kMotionFast = Duration(milliseconds: 150);
const Duration kMotionBase = Duration(milliseconds: 240);
const Curve kMotionCurve = Curves.easeOutCubic;

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
