import type { NotificationDraft, NotificationRecord, RecognitionRecord } from "./model";

export interface ClassroomInfo {
  id: string;
  schoolId: string;
  name: string;
  grade: number;
  schoolYear: number;
}

export interface RosterStudent {
  studentId: string;
  fullName: string;
}

/** Reads school records scoped by the school resolved from the session. Never fed from request JSON. */
export interface RosterReader {
  getClassrooms(schoolId: string, classIds: string[]): Promise<ClassroomInfo[]>;
  listActiveStudents(schoolId: string, classId: string): Promise<RosterStudent[]>;
  getActiveClassId(schoolId: string, studentId: string): Promise<string | null>;
  listConfirmedGuardians(schoolId: string, studentId: string): Promise<string[]>;
}

export type GrantResult =
  | { status: "created"; recognition: RecognitionRecord }
  | { status: "duplicate"; recognition: RecognitionRecord }
  | { status: "limit" }
  | { status: "not_enrolled" };

export interface GrantInput {
  recognition: RecognitionRecord;
  dailyLimit: number;
  guardianIds: string[];
  studentNotification: NotificationDraft;
  guardianNotification: NotificationDraft;
}

export interface RecognitionRepository {
  /**
   * Atomic: replays the same (teacher, idempotencyKey, student) as duplicate, refuses once the teacher
   * already awarded dailyLimit times to the student on recognition.day, otherwise stores the record
   * and one notification per recipient in the same transaction.
   */
  grant(input: GrantInput): Promise<GrantResult>;
  findByIdempotency(schoolId: string, teacherId: string, idempotencyKey: string, studentId: string): Promise<RecognitionRecord | null>;
  countForDay(schoolId: string, teacherId: string, day: string, studentIds: string[]): Promise<Map<string, number>>;
  listForStudent(schoolId: string, studentId: string, limit: number): Promise<RecognitionRecord[]>;
  sumAnnualPoints(schoolId: string, studentId: string, schoolYear: number): Promise<number>;
}

export interface NotificationRepository {
  listForUser(schoolId: string, userId: string, limit: number): Promise<NotificationRecord[]>;
  markRead(schoolId: string, userId: string, notificationId: string, readAt: string): Promise<NotificationRecord | null>;
}
