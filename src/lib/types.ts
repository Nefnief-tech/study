export type Priority = "low" | "medium" | "high";

export interface Subject {
  id: string;
  name: string;
  /** hex color, picked from the stationery palette */
  color: string;
}

export interface Todo {
  id: string;
  title: string;
  notes?: string;
  /** datetime-local string, e.g. "2026-09-21T17:00"; absent when no due date */
  due?: string;
  priority: Priority;
  subjectId?: string;
  done: boolean;
  createdAt: number;
}

export interface GradeEntry {
  id: string;
  subjectId?: string;
  title: string;
  /** Punkte (Oberstufe): 0–15, 15 is best */
  points: number;
  /** relative weight — typically sums to 100 within a subject */
  weight: number;
  date?: string; // yyyy-MM-dd
}

export interface Homework {
  id: string;
  title: string;
  subjectId?: string;
  /** datetime-local string, e.g. "2026-09-21T17:00"; absent when no due date */
  due?: string;
  priority: Priority;
  done: boolean;
  notes?: string;
  createdAt: number;
}

export interface TimetableEntry {
  /** normalized day: Mon, Tue, Wed, Thu, Fri, Sat, Sun */
  day: string;
  /** 1-based period number */
  period: number;
  /** e.g. "08:00 - 08:45" */
  time?: string;
  subject: string;
  teacher?: string;
  room?: string;
}

export type EventType = "study" | "deadline" | "exam" | "event";

export interface StudyEvent {
  id: string;
  title: string;
  date: string; // yyyy-MM-dd
  time?: string; // HH:mm
  type: EventType;
  subjectId?: string;
  notes?: string;
}

/* ---------------- AI study room ---------------- */

export type DocKind = "pdf" | "docx" | "pptx" | "txt" | "md";

/** metadata as the client sees it (extracted text stays on the server) */
export interface StudyDoc {
  id: string;
  name: string;
  kind: DocKind;
  size: number;
  chars: number;
  uploadedAt: number;
  /** set when the raw file was also persisted to the Appwrite storage bucket */
  bucketFileId?: string;
}

export interface Flashcard {
  id: string;
  front: string;
  back: string;
}

export interface Deck {
  id: string;
  title: string;
  documentIds: string[];
  createdAt: number;
  updatedAt: number;
  cards: Flashcard[];
}

export interface ChatMessage {
  /** stable identity for row sync — stamped by the store on append */
  id?: string;
  role: "user" | "assistant";
  content: string;
  /** document names that were in context for this answer */
  sources?: string[];
  /** wall-clock ms, used to order messages across devices */
  sentAt?: number;
}
