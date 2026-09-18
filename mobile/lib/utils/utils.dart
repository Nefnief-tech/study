import 'package:uuid/uuid.dart';

import '../models/types.dart';

/// Port of the web app's `src/lib/utils.ts`.

const uuid = Uuid();
String uid() => uuid.v4();

/// stationery palette for subject colors
const PALETTE = [
  "#3E6B4F", // bottle green
  "#38618C", // ink blue
  "#C15B33", // terracotta
  "#B98A1C", // mustard
  "#8A4F7D", // plum
  "#3E7C7B", // teal
];

Subject? findSubject(List<Subject> subjects, String? id) =>
    id == null ? null : subjects.where((s) => s.id == id).firstOrNull;

String formatBytes(num n) {
  if (n < 1024) return '$n B';
  if (n < 1024 * 1024) return '${(n / 1024).toStringAsFixed(0)} KB';
  return '${(n / (1024 * 1024)).toStringAsFixed(1)} MB';
}

String formatClock(int at) {
  final d = DateTime.fromMillisecondsSinceEpoch(at);
  return '${d.hour.toString().padLeft(2, '0')}:${d.minute.toString().padLeft(2, '0')}';
}

/// "11,7" — one decimal, German decimal comma
String formatPoints(num points) => points.toStringAsFixed(1).replaceFirst('.', ',');

int formatChars(int chars) => chars;

/* ---------------- dates ---------------- */

/// parses a datetime-local ("2026-09-21T17:00") or date ("2026-09-21") string
DateTime? parseDue(String? due) {
  if (due == null || due.isEmpty) return null;
  try {
    return DateTime.parse(due);
  } on FormatException {
    return null;
  }
}

DateTime startOfDay(DateTime d) => DateTime(d.year, d.month, d.day);

class DueInfo {
  final DateTime date;
  final bool overdue;
  final bool isToday;
  /// "Today · 17:00" / "Tomorrow" / "Fri 25 Sep"
  final String label;

  const DueInfo(this.date, this.overdue, this.isToday, this.label);
}

const _weekdayNames = [
  'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday',
];
const _monthNames = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];
const _weekdayShort = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

String formatDayMonth(DateTime d) => '${d.day} ${_monthNames[d.month - 1]}';

/// "Mon 21 Sep" style label for a yyyy-MM-dd key
String dayKeyLabel(String key) {
  final d = DateTime.tryParse(key);
  if (d == null) return key;
  return '${_weekdayShort[d.weekday - 1]} ${formatDayMonth(d)}';
}

/// "Monday, 21 September 2026"
String longDateLabel(DateTime d) =>
    '${_weekdayNames[d.weekday - 1]}, ${d.day} ${_monthFullNames[d.month - 1]} ${d.year}';

const _monthFullNames = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

DueInfo? dueInfo(String? due) {
  final date = parseDue(due);
  if (date == null) return null;
  final today = DateTime.now();
  final dayDiff =
      startOfDay(date).difference(startOfDay(today)).inDays;
  String label;
  if (dayDiff == 0) {
    label = 'Today';
  } else if (dayDiff == 1) {
    label = 'Tomorrow';
  } else if (dayDiff == -1) {
    label = 'Yesterday';
  } else if (dayDiff > 1 && dayDiff < 7) {
    label = _weekdayNames[date.weekday - 1];
  } else {
    label = formatDayMonth(date);
  }
  if (due!.contains('T')) {
    label += ' · ${date.hour.toString().padLeft(2, '0')}:${date.minute.toString().padLeft(2, '0')}';
  }
  return DueInfo(date, dayDiff < 0, dayDiff == 0, label);
}

/// yyyy-MM-dd for a DateTime (local time)
String toDayKey(DateTime d) =>
    '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

/* ---------------- grades (German Punkte system: 15 best → 0 worst) ---------------- */

/// weighted mean of Punkte; null when there is nothing to average
double? weightedAverage(Iterable<GradeEntry> entries) {
  final valid = entries.where((e) => e.weight > 0).toList();
  if (valid.isEmpty) return null;
  final wSum = valid.fold<num>(0, (s, e) => s + e.weight);
  final sum = valid.fold<num>(0, (s, e) => s + e.points * e.weight);
  return sum / wSum;
}

num weightSum(Iterable<GradeEntry> entries) =>
    entries.fold<num>(0, (s, e) => s + e.weight);

enum Tone { good, ok, warn, bad, neutral }

Tone pointsTone(num points) {
  if (points >= 13) return Tone.good;
  if (points >= 10) return Tone.ok;
  if (points >= 4) return Tone.warn;
  return Tone.bad;
}

/// converts pre-Punkte entries (score/max) to Punkte and clamps to 0–15
num percentToPoints(num pct) =>
    ((pct / 100) * 15).round().clamp(0, 15);

/// The Oberstufe table: every whole grade spans 3 points with +/− steps.
class PointsRow {
  final int points;
  final String grade;
  final String note;
  const PointsRow(this.points, this.grade, this.note);
}

const POINTS_TABLE = [
  PointsRow(15, "1+", "sehr gut"),
  PointsRow(14, "1", "sehr gut"),
  PointsRow(13, "1-", "sehr gut"),
  PointsRow(12, "2+", "gut"),
  PointsRow(11, "2", "gut"),
  PointsRow(10, "2-", "gut"),
  PointsRow(9, "3+", "befriedigend"),
  PointsRow(8, "3", "befriedigend"),
  PointsRow(7, "3-", "befriedigend"),
  PointsRow(6, "4+", "ausreichend"),
  PointsRow(5, "4", "ausreichend"),
  PointsRow(4, "4-", "ausreichend"),
  PointsRow(3, "5+", "mangelhaft"),
  PointsRow(2, "5", "mangelhaft"),
  PointsRow(1, "5-", "mangelhaft"),
  PointsRow(0, "6", "ungenügend"),
];

class GradeTranslation {
  final String grade;
  final String note;
  final Tone tone;
  const GradeTranslation(this.grade, this.note, this.tone);
}

/// translates a points value into the classic +/− grade (3 → 5+, 4 → 4− …)
GradeTranslation pointsToGrade(num points) {
  final p = points.round().clamp(0, 15);
  final row = POINTS_TABLE.firstWhere((r) => r.points == p,
      orElse: () => POINTS_TABLE.first);
  return GradeTranslation(row.grade, row.note, pointsTone(p));
}

const PRIORITY_LABEL = {
  Priority.high: 'High',
  Priority.medium: 'Medium',
  Priority.low: 'Low',
};

const PRIORITY_ORDER = {
  Priority.high: 0,
  Priority.medium: 1,
  Priority.low: 2,
};
