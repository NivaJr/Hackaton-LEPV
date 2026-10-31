import { z } from "zod";
import { GradeSchema, SubjectIdSchema, type Role, type StudentSummary, type SubjectId } from "@/contracts";

export class RosterError extends Error {
  constructor(public readonly code: string, message: string, public readonly status: number) {
    super(message);
    this.name = "RosterError";
  }
}

const classroomFields = {
  name: z.string().trim().min(1).max(100),
  grade: GradeSchema,
  schoolYear: z.number().int().min(2000).max(2200),
};
export const ClassroomInputSchema = z.object(classroomFields).strict();
export const ClassroomPatchSchema = z.object(classroomFields).partial().strict()
  .refine((patch) => Object.keys(patch).length > 0, { message: "Informe ao menos um campo." });
export type ClassroomInput = z.infer<typeof ClassroomInputSchema>;
export type ClassroomPatch = z.infer<typeof ClassroomPatchSchema>;

export const AssignmentInputSchema = z.object({
  classroomId: z.uuid(), teacherId: z.uuid(), subjectId: SubjectIdSchema,
}).strict();
/** expectedEnrollmentId confirms which active enrollment the coordinator saw before transferring. */
export const EnrollmentInputSchema = z.object({
  classroomId: z.uuid(), studentId: z.uuid(), expectedEnrollmentId: z.uuid().optional(),
}).strict();

export const GuardianLinkInputSchema = z.object({
  studentId: z.uuid(), fullName: z.string().max(300), email: z.string().max(320),
}).strict();
/** Confirmation is a human check by the school; "pending" is only the initial state. */
export const GuardianLinkStatusSchema = z.object({ status: z.enum(["confirmed", "revoked"]) }).strict();

export const AccessLinkInputSchema = z.object({ personId: z.uuid() }).strict();

export const ImportKindSchema = z.enum(["students", "teachers"]);
export type ImportKind = z.infer<typeof ImportKindSchema>;
export const MAX_IMPORT_ROWS = 1_000;

/** Names and emails are revalidated by the server; the client only chooses a decision per line. */
export const ImportConfirmRowSchema = z.object({
  line: z.number().int().positive(),
  fullName: z.string().max(300),
  email: z.string().max(320),
  subject: z.string().max(100).optional(),
  decision: z.enum(["apply", "transfer", "keep"]),
  expectedEnrollmentId: z.uuid().nullable().optional(),
}).strict();
export const ImportConfirmSchema = z.object({
  kind: ImportKindSchema, classroomId: z.uuid(),
  rows: z.array(ImportConfirmRowSchema).min(1).max(MAX_IMPORT_ROWS),
}).strict();
export type ImportConfirmRow = z.infer<typeof ImportConfirmRowSchema>;
export type ImportConfirm = z.infer<typeof ImportConfirmSchema>;

export interface RowIssue { code: string; message: string; }
export type PreviewStatus = "new" | "enroll_existing" | "already_in_class" | "transfer_available"
  | "assign_existing" | "already_assigned" | "invalid";
export interface CurrentEnrollment { id: string; classroomId: string; classroomName: string; }

export interface PreviewRow {
  line: number;
  fullName: string;
  email: string;
  subject?: string;
  subjectId?: SubjectId;
  status: PreviewStatus;
  issues: RowIssue[];
  existingName?: string;
  currentEnrollment?: CurrentEnrollment;
}
export interface ImportPreview {
  kind: ImportKind;
  classroom: { id: string; name: string };
  rows: PreviewRow[];
  counts: Record<PreviewStatus, number>;
}

export type ConfirmStatus = "created" | "enrolled" | "transferred" | "assigned" | "kept" | "already_applied" | "failed";
/** accessLink is a one-time credential: it is returned once and never stored. */
export interface ConfirmRowResult { line: number; email: string; status: ConfirmStatus; issue?: RowIssue; accessLink?: string; }
export interface ImportResult {
  rows: ConfirmRowResult[];
  counts: Record<ConfirmStatus, number>;
}

export interface ClassroomRecord { id: string; name: string; grade: number; schoolYear: number; }
export interface PersonRecord { id: string; fullName: string; }
export interface EnrollmentRecord extends CurrentEnrollment { studentId: string; }
export interface AssignmentRecord { id: string; classroomId: string; teacherId: string; subjectId: SubjectId; }
export interface AccountRecord { userId: string; schoolId: string | null; fullName: string | null; roles: Role[]; }
export interface ProvisionedAccount { userId: string; accessLink: string | null; }
export interface GuardianLinkRecord { id: string; guardianId: string; studentId: string; status: "pending" | "confirmed" | "revoked"; }
export type StudentResults = { source: "real"; summary: StudentSummary } | { source: "unavailable"; summary: null };
export interface ClassMetrics { classroomId: string; frequencyPercent: number; correctPercent: number; }
