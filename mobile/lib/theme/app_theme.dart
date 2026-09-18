import 'package:flutter/material.dart';

/// Port of the web app's `src/app/globals.css` — the stationery palette as a
/// ThemeExtension, plus Material color scheme + typography mapping.
/// Light values come from `:root`, dark values from `.dark`.
///
/// Fonts are the same families the web app loads via next/font/google,
/// bundled as assets (see pubspec.yaml) so everything renders offline.

class SemColors extends ThemeExtension<SemColors> {
  final Color paper;
  final Color paperDeep;
  final Color card;
  final Color ink;
  final Color inkSoft;
  final Color line;
  final Color grid;
  final Color accent;
  final Color accentSoft;
  final Color marker;
  final Color info;
  final Color amber;

  const SemColors({
    required this.paper,
    required this.paperDeep,
    required this.card,
    required this.ink,
    required this.inkSoft,
    required this.line,
    required this.grid,
    required this.accent,
    required this.accentSoft,
    required this.marker,
    required this.info,
    required this.amber,
  });

  static const light = SemColors(
    paper: Color(0xFFF5F2EA),
    paperDeep: Color(0xFFEDEADE),
    card: Color(0xFFFDFCF8),
    ink: Color(0xFF26221B),
    inkSoft: Color(0xFF756E60),
    line: Color(0xFFE0DACB),
    grid: Color(0xFFE8E3D5),
    accent: Color(0xFF31633F),
    accentSoft: Color(0xFFE2EADD),
    marker: Color(0xFFC14B26),
    info: Color(0xFF38618C),
    amber: Color(0xFF8A6A10),
  );

  static const dark = SemColors(
    paper: Color(0xFF17150F),
    paperDeep: Color(0xFF1E1B14),
    card: Color(0xFF211E17),
    ink: Color(0xFFECE6D6),
    inkSoft: Color(0xFFA29A88),
    line: Color(0xFF353025),
    grid: Color(0xFF251F15),
    accent: Color(0xFF8FB99A),
    accentSoft: Color(0xFF253528),
    marker: Color(0xFFE08A63),
    info: Color(0xFF8FB4DD),
    amber: Color(0xFFD9B95C),
  );

  @override
  SemColors copyWith({
    Color? paper,
    Color? paperDeep,
    Color? card,
    Color? ink,
    Color? inkSoft,
    Color? line,
    Color? grid,
    Color? accent,
    Color? accentSoft,
    Color? marker,
    Color? info,
    Color? amber,
  }) =>
      SemColors(
        paper: paper ?? this.paper,
        paperDeep: paperDeep ?? this.paperDeep,
        card: card ?? this.card,
        ink: ink ?? this.ink,
        inkSoft: inkSoft ?? this.inkSoft,
        line: line ?? this.line,
        grid: grid ?? this.grid,
        accent: accent ?? this.accent,
        accentSoft: accentSoft ?? this.accentSoft,
        marker: marker ?? this.marker,
        info: info ?? this.info,
        amber: amber ?? this.amber,
      );

  @override
  SemColors lerp(SemColors? other, double t) {
    if (other == null) return this;
    return SemColors(
      paper: Color.lerp(paper, other.paper, t)!,
      paperDeep: Color.lerp(paperDeep, other.paperDeep, t)!,
      card: Color.lerp(card, other.card, t)!,
      ink: Color.lerp(ink, other.ink, t)!,
      inkSoft: Color.lerp(inkSoft, other.inkSoft, t)!,
      line: Color.lerp(line, other.line, t)!,
      grid: Color.lerp(grid, other.grid, t)!,
      accent: Color.lerp(accent, other.accent, t)!,
      accentSoft: Color.lerp(accentSoft, other.accentSoft, t)!,
      marker: Color.lerp(marker, other.marker, t)!,
      info: Color.lerp(info, other.info, t)!,
      amber: Color.lerp(amber, other.amber, t)!,
    );
  }
}

/// `context.sem` — the stationery palette for the current brightness
extension SemColorsContext on BuildContext {
  SemColors get sem => Theme.of(this).extension<SemColors>()!;
}

const kFraunces = 'Fraunces';
const kInstrumentSans = 'Instrument Sans';
const kIbmPlexMono = 'IBM Plex Mono';

TextStyle _display({double? fontSize, FontWeight? fontWeight, double? height, Color? color, FontStyle? fontStyle}) =>
    TextStyle(
      fontFamily: kFraunces,
      fontSize: fontSize,
      fontWeight: fontWeight,
      height: height,
      color: color,
      fontStyle: fontStyle,
    );

TextStyle _body({double? fontSize, FontWeight? fontWeight, double? height, Color? color}) =>
    TextStyle(fontFamily: kInstrumentSans, fontSize: fontSize, fontWeight: fontWeight, height: height, color: color);

TextStyle _mono({double? fontSize, FontWeight? fontWeight, double? letterSpacing, Color? color}) =>
    TextStyle(fontFamily: kIbmPlexMono, fontSize: fontSize, fontWeight: fontWeight, letterSpacing: letterSpacing, color: color);

ThemeData buildSemesterTheme({required bool dark}) {
  final c = dark ? SemColors.dark : SemColors.light;

  final colorScheme = ColorScheme(
    brightness: dark ? Brightness.dark : Brightness.light,
    primary: c.accent,
    onPrimary: dark ? const Color(0xFF17150F) : const Color(0xFFF5F2EA),
    primaryContainer: c.accentSoft,
    onPrimaryContainer: c.accent,
    secondary: c.info,
    onSecondary: dark ? const Color(0xFF17150F) : Colors.white,
    secondaryContainer: c.paperDeep,
    onSecondaryContainer: c.ink,
    tertiary: c.amber,
    onTertiary: dark ? const Color(0xFF17150F) : Colors.white,
    error: c.marker,
    onError: dark ? const Color(0xFF17150F) : Colors.white,
    surface: c.paper,
    onSurface: c.ink,
    surfaceContainerLowest: c.paper,
    surfaceContainerLow: c.card,
    surfaceContainer: c.paperDeep,
    surfaceContainerHigh: c.card,
    surfaceContainerHighest: c.card,
    onSurfaceVariant: c.inkSoft,
    outline: c.line,
    outlineVariant: c.line,
    inverseSurface: c.ink,
    onInverseSurface: c.paper,
    shadow: Colors.black,
    scrim: Colors.black45,
  );

  return ThemeData(
    useMaterial3: true,
    colorScheme: colorScheme,
    scaffoldBackgroundColor: c.paper,
    extensions: [c],
    splashFactory: InkSparkle.splashFactory,
    textTheme: TextTheme(
      displayLarge: _display(fontSize: 40, fontWeight: FontWeight.w600, height: 1.05, color: c.ink),
      displayMedium: _display(fontSize: 34, fontWeight: FontWeight.w600, height: 1.08, color: c.ink),
      displaySmall: _display(fontSize: 28, fontWeight: FontWeight.w600, height: 1.12, color: c.ink),
      headlineMedium: _display(fontSize: 24, fontWeight: FontWeight.w600, height: 1.15, color: c.ink),
      headlineSmall: _display(fontSize: 20, fontWeight: FontWeight.w600, height: 1.2, color: c.ink),
      titleLarge: _display(fontSize: 18, fontWeight: FontWeight.w600, height: 1.25, color: c.ink),
      titleMedium: _body(fontSize: 16, fontWeight: FontWeight.w500, height: 1.3, color: c.ink),
      titleSmall: _body(fontSize: 14, fontWeight: FontWeight.w500, height: 1.3, color: c.ink),
      bodyLarge: _body(fontSize: 15, fontWeight: FontWeight.w400, height: 1.5, color: c.ink),
      bodyMedium: _body(fontSize: 14, fontWeight: FontWeight.w400, height: 1.45, color: c.ink),
      bodySmall: _body(fontSize: 12, fontWeight: FontWeight.w400, height: 1.4, color: c.inkSoft),
      labelLarge: _mono(fontSize: 13, fontWeight: FontWeight.w500, letterSpacing: 0.8, color: c.ink),
      labelMedium: _mono(fontSize: 11, fontWeight: FontWeight.w400, letterSpacing: 0.8, color: c.inkSoft),
      labelSmall: _mono(fontSize: 10, fontWeight: FontWeight.w400, letterSpacing: 1.1, color: c.inkSoft),
    ),
    appBarTheme: AppBarTheme(
      backgroundColor: c.paper,
      foregroundColor: c.ink,
      elevation: 0,
      scrolledUnderElevation: 0,
      surfaceTintColor: Colors.transparent,
      centerTitle: false,
      titleTextStyle: _display(fontSize: 20, fontWeight: FontWeight.w600, color: c.ink),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: c.card,
      isDense: true,
      contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      hintStyle: _body(fontSize: 14, color: c.inkSoft.withValues(alpha: 0.6)),
      labelStyle: _body(fontSize: 14, color: c.inkSoft),
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(10),
        borderSide: BorderSide(color: c.line),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(10),
        borderSide: BorderSide(color: c.line),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(10),
        borderSide: BorderSide(color: c.accent, width: 2),
      ),
      errorBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(10),
        borderSide: BorderSide(color: c.marker),
      ),
      focusedErrorBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(10),
        borderSide: BorderSide(color: c.marker, width: 2),
      ),
    ),
    dividerTheme: DividerThemeData(color: c.line, thickness: 1, space: 1),
    dialogTheme: DialogThemeData(
      backgroundColor: c.card,
      surfaceTintColor: Colors.transparent,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
        side: BorderSide(color: c.line),
      ),
      titleTextStyle: _display(fontSize: 18, fontWeight: FontWeight.w600, color: c.ink),
    ),
    bottomSheetTheme: BottomSheetThemeData(
      backgroundColor: c.card,
      surfaceTintColor: Colors.transparent,
      showDragHandle: true,
      dragHandleColor: c.line,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
      ),
    ),
    snackBarTheme: SnackBarThemeData(
      backgroundColor: c.ink,
      contentTextStyle: _body(fontSize: 14, color: c.paper),
      behavior: SnackBarBehavior.floating,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
    ),
    checkboxTheme: CheckboxThemeData(
      fillColor: WidgetStateProperty.resolveWith(
        (states) => states.contains(WidgetState.selected) ? c.accent : Colors.transparent,
      ),
      side: BorderSide(color: c.line, width: 1.5),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(4)),
    ),
    switchTheme: SwitchThemeData(
      thumbColor: WidgetStateProperty.resolveWith(
        (states) => states.contains(WidgetState.selected) ? c.paper : c.inkSoft,
      ),
      trackColor: WidgetStateProperty.resolveWith(
        (states) => states.contains(WidgetState.selected) ? c.accent : c.line,
      ),
    ),
    dropdownMenuTheme: DropdownMenuThemeData(
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: c.card,
        isDense: true,
        contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(10),
          borderSide: BorderSide(color: c.line),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(10),
          borderSide: BorderSide(color: c.line),
        ),
      ),
    ),
    popupMenuTheme: PopupMenuThemeData(
      color: c.card,
      surfaceTintColor: Colors.transparent,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
        side: BorderSide(color: c.line),
      ),
      textStyle: _body(fontSize: 14, color: c.ink),
    ),
    tooltipTheme: TooltipThemeData(
      decoration: BoxDecoration(color: c.ink, borderRadius: BorderRadius.circular(6)),
      textStyle: _mono(fontSize: 11, color: c.paper),
    ),
    textSelectionTheme: TextSelectionThemeData(
      cursorColor: c.accent,
      selectionColor: c.accent.withValues(alpha: 0.3),
      selectionHandleColor: c.accent,
    ),
  );
}
