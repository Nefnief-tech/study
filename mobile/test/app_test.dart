import 'package:flutter_test/flutter_test.dart';

import 'package:semester/models/types.dart';
import 'package:semester/utils/timetable_io.dart';
import 'package:semester/utils/utils.dart';

void main() {
  test('timetable parser accepts the example and sorts entries', () {
    final result = parseTimetable(EXAMPLE_TIMETABLE);
    expect(result.warnings, isEmpty);
    expect(result.entries.first.day, 'Mon');
    expect(result.entries.first.period, 1);
    expect(result.entries, hasLength(8));
  });

  test('german grade translation', () {
    expect(pointsToGrade(15).grade, '1+');
    expect(pointsToGrade(4).grade, '4-');
    expect(pointsToGrade(3).grade, '5+');
    expect(pointsTone(13), Tone.good);
    expect(pointsTone(0), Tone.bad);
  });

  test('weighted average of Punkte', () {
    final avg = weightedAverage([
      const GradeEntry(id: 'a', title: 'a', points: 15, weight: 1),
      const GradeEntry(id: 'b', title: 'b', points: 5, weight: 3),
    ]);
    expect(formatPoints(avg!), '7,5');
  });

  test('due info labels', () {
    final tomorrow = DateTime.now().add(const Duration(days: 1));
    final info = dueInfo('${toDayKey(tomorrow)}T17:00');
    expect(info, isNotNull);
    expect(info!.label, contains('17:00'));
  });
}
