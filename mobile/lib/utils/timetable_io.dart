import 'dart:convert';

import '../models/types.dart';

/// Port of the web app's `src/lib/timetable.ts` — accepts the same JSON
/// formats and normalizes to the same entry shape.

const DAY_ORDER = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const _dayAliases = <String, String>{
  'mon': 'Mon', 'monday': 'Mon', 'mo': 'Mon',
  'tue': 'Tue', 'tues': 'Tue', 'tuesday': 'Tue', 'di': 'Tue',
  'wed': 'Wed', 'weds': 'Wed', 'wednesday': 'Wed', 'mi': 'Wed',
  'thu': 'Thu', 'thur': 'Thu', 'thursday': 'Thu', 'do': 'Thu', 'don': 'Thu',
  'fri': 'Fri', 'friday': 'Fri', 'fr': 'Fri',
  'sat': 'Sat', 'saturday': 'Sat',
  'sun': 'Sun', 'sunday': 'Sun', 'so': 'Sun',
};

String? _normalizeDay(Object? raw) {
  if (raw is! String) return null;
  return _dayAliases[raw.trim().toLowerCase()];
}

String? _pick(Map<String, dynamic> obj, List<String> keys) {
  final lower = <String, dynamic>{};
  obj.forEach((k, v) => lower[k.toLowerCase()] = v);
  for (final k in keys) {
    final v = lower[k];
    if (v != null && v.toString().trim().isNotEmpty) return v.toString().trim();
  }
  return null;
}

int? _pickPeriod(Map<String, dynamic> obj) {
  for (final k in ['period', 'hour', 'stunde', 'lesson']) {
    final v = obj[k] ?? obj[k.toLowerCase()];
    final n = v is num ? v.toInt() : (v is String ? int.tryParse(v) : null);
    if (n != null) return n;
  }
  return null;
}

class ParseResult {
  final List<TimetableEntry> entries;
  final List<String> warnings;
  const ParseResult(this.entries, this.warnings);
}

/// Accepts either a flat JSON array of lessons
///   [{ "day": "mon", "period": 1, "time": "08:00", "subject": "Math", … }]
/// or an object grouped by day
///   { "mon": [{ "period": 1, "subject": "Math" }], "tue": [ … ] }
/// Keys are matched case-insensitively; day names in EN or DE.
ParseResult parseTimetable(String raw) {
  Object? data;
  try {
    data = jsonDecode(raw);
  } on FormatException {
    throw FormatException("That isn't valid JSON — check for missing commas or quotes.");
  }

  final warnings = <String>[];
  final rows = <MapEntry<Object?, Map<String, dynamic>>>[];

  if (data is List) {
    for (var i = 0; i < data.length; i++) {
      final item = data[i];
      if (item is Map<String, dynamic>) {
        rows.add(MapEntry(item['day'], item));
      } else if (item is Map) {
        rows.add(MapEntry(item['day'], Map<String, dynamic>.from(item)));
      } else {
        warnings.add('Row ${i + 1} skipped — not an object.');
      }
    }
  } else if (data is Map) {
    data.forEach((key, value) {
      if (value is! List) {
        warnings.add('Skipped "$key" — the value isn\'t a list.');
        return;
      }
      for (final item in value) {
        if (item is Map) rows.add(MapEntry(key, Map<String, dynamic>.from(item)));
      }
    });
  } else {
    throw FormatException('Expected a JSON array of lessons or an object grouped by day.');
  }

  final entries = <TimetableEntry>[];
  for (var i = 0; i < rows.length; i++) {
    final rawDay = rows[i].key;
    final item = rows[i].value;
    final subject = _pick(item, ['subject', 'name', 'fach', 'lesson']);
    if (subject == null) {
      warnings.add('Row ${i + 1}: no subject found — skipped.');
      continue;
    }
    final day = _normalizeDay(rawDay ?? _pick(item, ['day', 'tag']));
    if (day == null) {
      warnings.add('Row ${i + 1}: unknown day "${rawDay ?? ""}" — skipped.');
      continue;
    }
    final time = _pick(item, ['time', 'zeit', 'times', 'slot']);
    final period = _pickPeriod(item) ??
        (time != null ? _parsePeriodFromTime(time) ?? i + 1 : i + 1);
    entries.add(TimetableEntry(
      day: day,
      period: period,
      time: time,
      subject: subject,
      teacher: _pick(item, ['teacher', 'lehrer']),
      room: _pick(item, ['room', 'raum']),
    ));
  }

  if (entries.isEmpty) {
    throw FormatException(
        'No lessons found — each entry needs at least a day and a subject.');
  }

  entries.sort((a, b) {
    final byDay = DAY_ORDER.indexOf(a.day) - DAY_ORDER.indexOf(b.day);
    if (byDay != 0) return byDay;
    return a.period - b.period;
  });
  return ParseResult(entries, warnings);
}

int? _parsePeriodFromTime(String time) {
  final hour = int.tryParse(time.split(':').first);
  if (hour == null) return null;
  // typical German school day 08:00–17:00 → ~8 periods
  return (hour - 7).clamp(1, 8);
}

/// rebuilds the flat JSON form from stored entries (for the edit panel)
String timetableToJson(List<TimetableEntry> entries) {
  final encoder = JsonEncoder.withIndent('  ');
  return encoder.convert([
    for (final e in entries)
      {
        'day': e.day,
        'period': e.period,
        if (e.time != null) 'time': e.time,
        'subject': e.subject,
        if (e.teacher != null) 'teacher': e.teacher,
        if (e.room != null) 'room': e.room,
      }
  ]);
}

const EXAMPLE_TIMETABLE = '''[
  { "day": "mon", "period": 1, "time": "08:00 - 08:45", "subject": "Mathematics", "teacher": "Ms. Curve", "room": "B102" },
  { "day": "mon", "period": 2, "time": "08:50 - 09:35", "subject": "Mathematics", "teacher": "Ms. Curve", "room": "B102" },
  { "day": "mon", "period": 3, "time": "09:55 - 10:40", "subject": "English", "teacher": "Mr. Words", "room": "A204" },
  { "day": "tue", "period": 1, "time": "08:00 - 08:45", "subject": "Biology", "teacher": "Ms. Cell", "room": "Lab 2" },
  { "day": "tue", "period": 3, "time": "09:55 - 10:40", "subject": "History", "teacher": "Mr. Past", "room": "C110" },
  { "day": "wed", "period": 2, "time": "08:50 - 09:35", "subject": "Spanish", "teacher": "Sr. Lopez", "room": "B004" },
  { "day": "thu", "period": 1, "time": "08:00 - 08:45", "subject": "Physics", "teacher": "Ms. Newton", "room": "Lab 1" },
  { "day": "fri", "period": 4, "time": "10:45 - 11:30", "subject": "Sports", "teacher": "Coach Run", "room": "Gym" }
]''';
