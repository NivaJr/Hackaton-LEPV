import { z } from "zod";
import { IdSchema, SubjectIdSchema, type SubjectId } from "@/contracts";

/** Confirmed rule: positive-behaviour awards go only to annual rank points, never to weekly XP or the ranking. */
export const RECOGNITION_POINTS = 20;
export const RECOGNITION_DAILY_LIMIT = 3;
export const RECOGNITION_TIME_ZONE = "America/Sao_Paulo";
export const RECOGNITION_MAX_STUDENTS = 40;
export const RECOGNITION_NOTE_MAX = 140;

export const RecognitionReasonSchema = z.enum([
  "pergunta_curiosa",
  "ajudou_turma",
  "organizou_sala",
  "colaboracao",
  "superacao",
  "outro",
]);
export type RecognitionReason = z.infer<typeof RecognitionReasonSchema>;

export const RECOGNITION_REASON_LABELS: Record<RecognitionReason, string> = {
  pergunta_curiosa: "Pergunta curiosa",
  ajudou_turma: "Ajudou a turma",
  organizou_sala: "Organizou a sala",
  colaboracao: "Colaboração",
  superacao: "Superação",
  outro: "Outro motivo",
};

/** Client request. Teacher, school, points and limit are resolved on the server. */
export const RecognitionRequestSchema = z.object({
  classId: IdSchema,
  subjectId: SubjectIdSchema,
  studentIds: z.array(IdSchema).min(1).max(RECOGNITION_MAX_STUDENTS),
  reason: RecognitionReasonSchema,
  note: z.string().trim().max(RECOGNITION_NOTE_MAX).optional(),
  idempotencyKey: z.string().trim().min(8).max(128),
}).strict().superRefine((input, ctx) => {
  if (input.reason === "outro" && !input.note) {
    ctx.addIssue({ code: "custom", path: ["note"], message: "Escreva o motivo em poucas palavras." });
  }
});
export type RecognitionRequest = z.infer<typeof RecognitionRequestSchema>;

export const RecognitionOutcomeStatusSchema = z.enum(["concedido", "limite_diario", "sem_vinculo"]);
export type RecognitionOutcomeStatus = z.infer<typeof RecognitionOutcomeStatusSchema>;

export interface RecognitionRecord {
  id: string;
  schoolId: string;
  teacherId: string;
  teacherName: string;
  classId: string;
  subjectId: SubjectId;
  studentId: string;
  reason: RecognitionReason;
  note: string | null;
  points: number;
  schoolYear: number;
  day: string;
  idempotencyKey: string;
  createdAt: string;
}

export type NotificationKind = "recognition";

export interface NotificationRecord {
  id: string;
  schoolId: string;
  userId: string;
  studentId: string;
  kind: NotificationKind;
  recognitionId: string;
  title: string;
  body: string;
  createdAt: string;
  readAt: string | null;
}

export interface NotificationDraft {
  title: string;
  body: string;
}

export interface RecognitionOutcome {
  studentId: string;
  status: RecognitionOutcomeStatus;
  recognitionId?: string;
  points: number;
  repeated?: boolean;
  remainingToday?: number;
}

export interface RecognitionView {
  id: string;
  studentId: string;
  classId: string;
  subjectId: SubjectId;
  reason: RecognitionReason;
  reasonLabel: string;
  note: string | null;
  points: number;
  teacherName: string;
  schoolYear: number;
  createdAt: string;
}

export interface NotificationView {
  id: string;
  kind: NotificationKind;
  studentId: string;
  recognitionId: string;
  title: string;
  body: string;
  createdAt: string;
  read: boolean;
}

export class RecognitionError extends Error {
  constructor(readonly code: string, message: string, readonly status: number) {
    super(message);
    this.name = "RecognitionError";
  }
}

const dayFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: RECOGNITION_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit",
});

/** Calendar day in São Paulo, YYYY-MM-DD. The daily limit resets at local midnight. */
export function recognitionDay(at: Date): string {
  return dayFormatter.format(at);
}

export function initialsOf(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  const picked = parts.length > 1 ? [parts[0], parts[parts.length - 1]] : parts.slice(0, 1);
  return picked.map((part) => part[0]!.toLocaleUpperCase("pt-BR")).join("");
}

export function toRecognitionView(record: RecognitionRecord): RecognitionView {
  return {
    id: record.id, studentId: record.studentId, classId: record.classId, subjectId: record.subjectId,
    reason: record.reason, reasonLabel: RECOGNITION_REASON_LABELS[record.reason], note: record.note,
    points: record.points, teacherName: record.teacherName, schoolYear: record.schoolYear, createdAt: record.createdAt,
  };
}

export function toNotificationView(record: NotificationRecord): NotificationView {
  return {
    id: record.id, kind: record.kind, studentId: record.studentId, recognitionId: record.recognitionId,
    title: record.title, body: record.body, createdAt: record.createdAt, read: record.readAt !== null,
  };
}

/** Unread first, then newest first. */
export function sortNotifications<T extends { readAt: string | null; createdAt: string; id: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => Number(a.readAt !== null) - Number(b.readAt !== null)
    || b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id));
}
