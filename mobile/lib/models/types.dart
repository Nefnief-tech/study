/* Data model port of the web app's `src/lib/types.ts`.
 *
 * JSON keys are identical to the TypeScript shapes so both clients read and
 * write the same Appwrite snapshot documents interchangeably. */

/* ---------------- planner ---------------- */

enum Priority { low, medium, high }

Priority priorityFromJson(String? s) => Priority.values
    .where((e) => e.name == s)
    .firstOrNull ?? Priority.medium;

class Subject {
  final String id;
  final String name;
  /// hex color, picked from the stationery palette
  final String color;

  const Subject({required this.id, required this.name, required this.color});

  factory Subject.fromJson(Map<String, dynamic> j) => Subject(
        id: j['id'] as String,
        name: (j['name'] as String?) ?? '',
        color: (j['color'] as String?) ?? '#3E6B4F',
      );

  Map<String, dynamic> toJson() => {'id': id, 'name': name, 'color': color};

  Subject copyWith({String? name, String? color}) =>
      Subject(id: id, name: name ?? this.name, color: color ?? this.color);
}

class Todo {
  final String id;
  final String title;
  final String? notes;
  /// datetime-local string, e.g. "2026-09-21T17:00"; absent when no due date
  final String? due;
  final Priority priority;
  final String? subjectId;
  final bool done;
  final int createdAt;

  const Todo({
    required this.id,
    required this.title,
    this.notes,
    this.due,
    required this.priority,
    this.subjectId,
    required this.done,
    required this.createdAt,
  });

  factory Todo.fromJson(Map<String, dynamic> j) => Todo(
        id: j['id'] as String,
        title: (j['title'] as String?) ?? '',
        notes: j['notes'] as String?,
        due: j['due'] as String?,
        priority: priorityFromJson(j['priority'] as String?),
        subjectId: j['subjectId'] as String?,
        done: (j['done'] as bool?) ?? false,
        createdAt: (j['createdAt'] as num?)?.toInt() ?? 0,
      );

  Map<String, dynamic> toJson() => {
        'id': id,
        'title': title,
        if (notes != null) 'notes': notes,
        if (due != null) 'due': due,
        'priority': priority.name,
        if (subjectId != null) 'subjectId': subjectId,
        'done': done,
        'createdAt': createdAt,
      };

  Todo copyWith({
    String? title,
    String? notes,
    String? due,
    Priority? priority,
    String? subjectId,
    bool? done,
    bool clearNotes = false,
    bool clearDue = false,
    bool clearSubject = false,
  }) =>
      Todo(
        id: id,
        title: title ?? this.title,
        notes: clearNotes ? null : (notes ?? this.notes),
        due: clearDue ? null : (due ?? this.due),
        priority: priority ?? this.priority,
        subjectId: clearSubject ? null : (subjectId ?? this.subjectId),
        done: done ?? this.done,
        createdAt: createdAt,
      );
}

class GradeEntry {
  final String id;
  final String? subjectId;
  final String title;
  /// Punkte (Oberstufe): 0–15, 15 is best
  final num points;
  /// relative weight — typically sums to 100 within a subject
  final num weight;
  /// yyyy-MM-dd
  final String? date;

  const GradeEntry({
    required this.id,
    this.subjectId,
    required this.title,
    required this.points,
    required this.weight,
    this.date,
  });

  factory GradeEntry.fromJson(Map<String, dynamic> j) => GradeEntry(
        id: j['id'] as String,
        subjectId: j['subjectId'] as String?,
        title: (j['title'] as String?) ?? '',
        points: (j['points'] as num?) ?? 0,
        weight: (j['weight'] as num?) ?? 1,
        date: j['date'] as String?,
      );

  Map<String, dynamic> toJson() => {
        'id': id,
        if (subjectId != null) 'subjectId': subjectId,
        'title': title,
        'points': points,
        'weight': weight,
        if (date != null) 'date': date,
      };

  GradeEntry copyWith({
    String? title,
    num? points,
    num? weight,
    String? date,
    bool clearDate = false,
  }) =>
      GradeEntry(
        id: id,
        subjectId: subjectId,
        title: title ?? this.title,
        points: points ?? this.points,
        weight: weight ?? this.weight,
        date: clearDate ? null : (date ?? this.date),
      );
}

class Homework {
  final String id;
  final String title;
  final String? subjectId;
  final String? due;
  final Priority priority;
  final bool done;
  final String? notes;
  final int createdAt;

  const Homework({
    required this.id,
    required this.title,
    this.subjectId,
    this.due,
    required this.priority,
    required this.done,
    this.notes,
    required this.createdAt,
  });

  factory Homework.fromJson(Map<String, dynamic> j) => Homework(
        id: j['id'] as String,
        title: (j['title'] as String?) ?? '',
        subjectId: j['subjectId'] as String?,
        due: j['due'] as String?,
        priority: priorityFromJson(j['priority'] as String?),
        done: (j['done'] as bool?) ?? false,
        notes: j['notes'] as String?,
        createdAt: (j['createdAt'] as num?)?.toInt() ?? 0,
      );

  Map<String, dynamic> toJson() => {
        'id': id,
        'title': title,
        if (subjectId != null) 'subjectId': subjectId,
        if (due != null) 'due': due,
        'priority': priority.name,
        'done': done,
        if (notes != null) 'notes': notes,
        'createdAt': createdAt,
      };

  Homework copyWith({
    String? title,
    String? notes,
    String? due,
    Priority? priority,
    String? subjectId,
    bool? done,
    bool clearNotes = false,
    bool clearDue = false,
    bool clearSubject = false,
  }) =>
      Homework(
        id: id,
        title: title ?? this.title,
        notes: clearNotes ? null : (notes ?? this.notes),
        due: clearDue ? null : (due ?? this.due),
        priority: priority ?? this.priority,
        subjectId: clearSubject ? null : (subjectId ?? this.subjectId),
        done: done ?? this.done,
        createdAt: createdAt,
      );
}

class TimetableEntry {
  /// normalized day: Mon, Tue, Wed, Thu, Fri, Sat, Sun
  final String day;
  /// 1-based period number
  final int period;
  /// e.g. "08:00 - 08:45"
  final String? time;
  final String subject;
  final String? teacher;
  final String? room;

  const TimetableEntry({
    required this.day,
    required this.period,
    this.time,
    required this.subject,
    this.teacher,
    this.room,
  });

  factory TimetableEntry.fromJson(Map<String, dynamic> j) => TimetableEntry(
        day: (j['day'] as String?) ?? 'Mon',
        period: (j['period'] as num?)?.toInt() ?? 1,
        time: j['time'] as String?,
        subject: (j['subject'] as String?) ?? '',
        teacher: j['teacher'] as String?,
        room: j['room'] as String?,
      );

  Map<String, dynamic> toJson() => {
        'day': day,
        'period': period,
        if (time != null) 'time': time,
        'subject': subject,
        if (teacher != null) 'teacher': teacher,
        if (room != null) 'room': room,
      };
}

enum EventType { study, deadline, exam, event }

EventType eventTypeFromJson(String? s) => EventType.values
    .where((e) => e.name == s)
    .firstOrNull ?? EventType.study;

class StudyEvent {
  final String id;
  final String title;
  /// yyyy-MM-dd
  final String date;
  /// HH:mm
  final String? time;
  final EventType type;
  final String? subjectId;
  final String? notes;

  const StudyEvent({
    required this.id,
    required this.title,
    required this.date,
    this.time,
    required this.type,
    this.subjectId,
    this.notes,
  });

  factory StudyEvent.fromJson(Map<String, dynamic> j) => StudyEvent(
        id: j['id'] as String,
        title: (j['title'] as String?) ?? '',
        date: (j['date'] as String?) ?? '',
        time: j['time'] as String?,
        type: eventTypeFromJson(j['type'] as String?),
        subjectId: j['subjectId'] as String?,
        notes: j['notes'] as String?,
      );

  Map<String, dynamic> toJson() => {
        'id': id,
        'title': title,
        'date': date,
        if (time != null) 'time': time,
        'type': type.name,
        if (subjectId != null) 'subjectId': subjectId,
        if (notes != null) 'notes': notes,
      };

  StudyEvent copyWith({
    String? title,
    String? date,
    String? time,
    EventType? type,
    String? subjectId,
    String? notes,
    bool clearTime = false,
    bool clearSubject = false,
    bool clearNotes = false,
  }) =>
      StudyEvent(
        id: id,
        title: title ?? this.title,
        date: date ?? this.date,
        time: clearTime ? null : (time ?? this.time),
        type: type ?? this.type,
        subjectId: clearSubject ? null : (subjectId ?? this.subjectId),
        notes: clearNotes ? null : (notes ?? this.notes),
      );
}

/* ---------------- AI study room ---------------- */

enum DocKind { pdf, docx, pptx, txt, md }

DocKind docKindFromJson(String? s) => DocKind.values
    .where((e) => e.name == s)
    .firstOrNull ?? DocKind.txt;

/// metadata as the client sees it (extracted text stays on the server)
class StudyDoc {
  final String id;
  final String name;
  final DocKind kind;
  final int size;
  final int chars;
  final int uploadedAt;
  /// set when the raw file was also persisted to the Appwrite storage bucket
  final String? bucketFileId;

  const StudyDoc({
    required this.id,
    required this.name,
    required this.kind,
    required this.size,
    required this.chars,
    required this.uploadedAt,
    this.bucketFileId,
  });

  factory StudyDoc.fromJson(Map<String, dynamic> j) => StudyDoc(
        id: j['id'] as String,
        name: (j['name'] as String?) ?? '',
        kind: docKindFromJson(j['kind'] as String?),
        size: (j['size'] as num?)?.toInt() ?? 0,
        chars: (j['chars'] as num?)?.toInt() ?? 0,
        uploadedAt: (j['uploadedAt'] as num?)?.toInt() ?? 0,
        bucketFileId: j['bucketFileId'] as String?,
      );

  Map<String, dynamic> toJson() => {
        'id': id,
        'name': name,
        'kind': kind.name,
        'size': size,
        'chars': chars,
        'uploadedAt': uploadedAt,
        if (bucketFileId != null) 'bucketFileId': bucketFileId,
      };
}

class Flashcard {
  final String id;
  final String front;
  final String back;

  const Flashcard({required this.id, required this.front, required this.back});

  factory Flashcard.fromJson(Map<String, dynamic> j) => Flashcard(
        id: (j['id'] as String?) ?? '',
        front: (j['front'] as String?) ?? '',
        back: (j['back'] as String?) ?? '',
      );

  Map<String, dynamic> toJson() => {'id': id, 'front': front, 'back': back};
}

class Deck {
  final String id;
  final String title;
  final List<String> documentIds;
  final int createdAt;
  final int updatedAt;
  final List<Flashcard> cards;

  const Deck({
    required this.id,
    required this.title,
    required this.documentIds,
    required this.createdAt,
    required this.updatedAt,
    required this.cards,
  });

  factory Deck.fromJson(Map<String, dynamic> j) => Deck(
        id: j['id'] as String,
        title: (j['title'] as String?) ?? 'Deck',
        documentIds:
            ((j['documentIds'] as List?) ?? []).map((e) => e as String).toList(),
        createdAt: (j['createdAt'] as num?)?.toInt() ?? 0,
        updatedAt: (j['updatedAt'] as num?)?.toInt() ?? 0,
        cards: ((j['cards'] as List?) ?? [])
            .map((e) => Flashcard.fromJson(e as Map<String, dynamic>))
            .toList(),
      );

  Map<String, dynamic> toJson() => {
        'id': id,
        'title': title,
        'documentIds': documentIds,
        'createdAt': createdAt,
        'updatedAt': updatedAt,
        'cards': cards.map((c) => c.toJson()).toList(),
      };
}

class ChatMessage {
  /// "user" | "assistant"
  final String role;
  final String content;
  /// document names that were in context for this answer
  final List<String>? sources;

  const ChatMessage({required this.role, required this.content, this.sources});

  bool get isUser => role == 'user';

  factory ChatMessage.fromJson(Map<String, dynamic> j) => ChatMessage(
        role: (j['role'] as String?) ?? 'assistant',
        content: (j['content'] as String?) ?? '',
        sources: ((j['sources'] as List?) ?? []).map((e) => e as String).toList(),
      );

  Map<String, dynamic> toJson() => {
        'role': role,
        'content': content,
        if (sources != null && sources!.isNotEmpty) 'sources': sources,
      };
}

/* ---------------- school portal (device-local) ---------------- */

class PortalSub {
  /// 18.09.2026
  final String date;
  /// Fr
  final String weekday;
  /// "1"
  final String period;
  /// "" when nobody steps in
  final String substitute;
  final String course;
  /// original course when it was swapped
  final String? courseOld;
  final String room;
  final String info;
  final bool cancelled;

  const PortalSub({
    required this.date,
    required this.weekday,
    required this.period,
    required this.substitute,
    required this.course,
    this.courseOld,
    required this.room,
    required this.info,
    required this.cancelled,
  });

  factory PortalSub.fromJson(Map<String, dynamic> j) => PortalSub(
        date: (j['date'] as String?) ?? '',
        weekday: (j['weekday'] as String?) ?? '',
        period: (j['period'] as String?) ?? '',
        substitute: (j['substitute'] as String?) ?? '',
        course: (j['course'] as String?) ?? '',
        courseOld: j['courseOld'] as String?,
        room: (j['room'] as String?) ?? '',
        info: (j['info'] as String?) ?? '',
        cancelled: (j['cancelled'] as bool?) ?? false,
      );

  Map<String, dynamic> toJson() => {
        'date': date,
        'weekday': weekday,
        'period': period,
        'substitute': substitute,
        'course': course,
        if (courseOld != null) 'courseOld': courseOld,
        'room': room,
        'info': info,
        'cancelled': cancelled,
      };
}

class PortalDay {
  final String date;
  final String weekday;
  final List<PortalSub> entries;

  const PortalDay({required this.date, required this.weekday, required this.entries});

  factory PortalDay.fromJson(Map<String, dynamic> j) => PortalDay(
        date: (j['date'] as String?) ?? '',
        weekday: (j['weekday'] as String?) ?? '',
        entries: ((j['entries'] as List?) ?? [])
            .map((e) => PortalSub.fromJson(e as Map<String, dynamic>))
            .toList(),
      );

  Map<String, dynamic> toJson() => {
        'date': date,
        'weekday': weekday,
        'entries': entries.map((e) => e.toJson()).toList(),
      };
}

class PortalPlan {
  final List<PortalDay> days;
  /// the student's course codes ("Mitglied in Kursen")
  final List<String> courses;
  final String? stand;

  const PortalPlan({required this.days, required this.courses, this.stand});

  factory PortalPlan.fromJson(Map<String, dynamic> j) => PortalPlan(
        days: ((j['days'] as List?) ?? [])
            .map((e) => PortalDay.fromJson(e as Map<String, dynamic>))
            .toList(),
        courses: ((j['courses'] as List?) ?? []).map((e) => e as String).toList(),
        stand: j['stand'] as String?,
      );

  Map<String, dynamic> toJson() => {
        'days': days.map((d) => d.toJson()).toList(),
        'courses': courses,
        'stand': stand,
      };

  /// every substitution across all days
  List<PortalSub> get allEntries => [for (final d in days) ...d.entries];
}
