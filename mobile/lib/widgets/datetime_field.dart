import 'package:flutter/material.dart';

import '../utils/utils.dart';

/// mobile replacement for `<input type="datetime-local">` — date picker then
/// time picker; produces the same "yyyy-MM-ddTHH:mm" string the stores use.
Future<String?> pickDueDateTime(BuildContext context, String? current) async {
  final initial = parseDue(current) ?? DateTime.now();
  final date = await showDatePicker(
    context: context,
    initialDate: initial,
    firstDate: DateTime(initial.year - 2),
    lastDate: DateTime(initial.year + 3),
    builder: (context, child) => child!,
  );
  if (date == null || !context.mounted) return null;
  final time = await showTimePicker(
    context: context,
    initialTime: TimeOfDay.fromDateTime(current != null && current.contains('T') ? initial : DateTime(2026, 1, 1, 17, 0)),
  );
  final d = time == null ? date : DateTime(date.year, date.month, date.day, time.hour, time.minute);
  return '${toDayKey(d)}T${d.hour.toString().padLeft(2, '0')}:${d.minute.toString().padLeft(2, '0')}';
}

/// plain yyyy-MM-dd picker (events, grades)
Future<String?> pickDate(BuildContext context, String? current) async {
  final initial = DateTime.tryParse(current ?? '') ?? DateTime.now();
  final date = await showDatePicker(
    context: context,
    initialDate: initial,
    firstDate: DateTime(initial.year - 2),
    lastDate: DateTime(initial.year + 3),
    builder: (context, child) => child!,
  );
  return date == null ? null : toDayKey(date);
}

/// plain HH:mm picker
Future<String?> pickTime(BuildContext context, String? current) async {
  final parts = (current ?? '').split(':');
  final initial = parts.length == 2
      ? TimeOfDay(hour: int.tryParse(parts[0]) ?? 12, minute: int.tryParse(parts[1]) ?? 0)
      : TimeOfDay.now();
  final time = await showTimePicker(context: context, initialTime: initial);
  if (time == null) return null;
  return '${time.hour.toString().padLeft(2, '0')}:${time.minute.toString().padLeft(2, '0')}';
}

String dueLabel(String? due) {
  final d = parseDue(due);
  if (d == null) return '';
  final hasTime = (due ?? '').contains('T');
  return '${toDayKey(d)}${hasTime ? ' · ${d.hour.toString().padLeft(2, '0')}:${d.minute.toString().padLeft(2, '0')}' : ''}';
}
