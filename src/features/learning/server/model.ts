import { z } from "zod";
import {
  AttemptResultSchema, GeneratedQuestionSchema, GradeSchema, IdSchema,
  QuestionAnswerKeySchema, QuestionForStudentSchema, RecoveryStateSchema,
  StudentPreferencesSchema, SubjectIdSchema,
} from "@/contracts";

const timestamp = z.string().datetime();
const points = z.number().finite().nonnegative();
export const ScoringPolicySchema = z.object({
  originalPoints: points.positive().max(1_000_000),
  recoveryReference: z.enum(["original", "previous"]),
  adaptiveXpFollowsRoot: z.boolean(),
  recoveryCapPoints: z.null(),
}).strict();

export const ActivitySchema = z.object({
  rootQuestionId: IdSchema,
  body: GeneratedQuestionSchema,
  contentVersion: z.number().int().positive(),
  reviewed: z.literal(true),
  active: z.boolean(),
  activatedAt: timestamp.nullable(),
}).strict();
export type LearningActivity = z.infer<typeof ActivitySchema>;

export const CatalogSchema = z.object({
  classId: IdSchema,
  institutionId: IdSchema,
  grade: GradeSchema,
  schoolYear: z.number().int(),
  activities: z.array(ActivitySchema),
  rotations: z.array(z.object({
    subjectId: SubjectIdSchema,
    weekStart: z.string().date(),
    incomingRootIds: z.array(IdSchema).length(2),
    outgoingRootIds: z.array(IdSchema).length(2),
  }).strict()),
}).strict();
export type LearningCatalog = z.infer<typeof CatalogSchema>;

export const InstanceSchema = z.object({
  classId: IdSchema,
  contentVersion: z.number().int().positive(),
  rootContentVersion: z.number().int().positive(),
  question: QuestionForStudentSchema,
  answerKey: QuestionAnswerKeySchema,
  recoveryId: IdSchema.nullable(),
  scoring: ScoringPolicySchema,
  nominalPoints: points,
  issuedAt: timestamp,
}).strict();
export type LearningInstance = z.infer<typeof InstanceSchema>;

export const StoredAttemptSchema = z.object({
  selectedOptionId: IdSchema,
  idempotencyKey: z.string().min(8).max(128),
  classId: IdSchema,
  rootQuestionId: IdSchema,
  subjectId: SubjectIdSchema,
  skillCodes: z.array(z.string()),
  source: z.enum(["original", "recovery"]),
  createdAt: timestamp,
  result: AttemptResultSchema,
}).strict();
export type StoredAttempt = z.infer<typeof StoredAttemptSchema>;

const RecoverySchema = z.object({
  id: IdSchema,
  classId: IdSchema,
  rootQuestionId: IdSchema,
  state: RecoveryStateSchema,
  leaseToken: z.string().nullable(),
  leaseUntil: timestamp.nullable(),
}).strict();
export type LearningRecovery = z.infer<typeof RecoverySchema>;

const LedgerSchema = z.object({
  id: IdSchema,
  attemptId: IdSchema,
  classId: IdSchema,
  rootQuestionId: IdSchema,
  subjectId: SubjectIdSchema,
  schoolYear: z.number().int(),
  kind: z.enum(["xp", "annual"]),
  points,
  keepAfterRotation: z.boolean(),
}).strict();

export const LearningStateSchema = z.object({
  instances: z.array(InstanceSchema),
  attempts: z.array(StoredAttemptSchema),
  recoveries: z.array(RecoverySchema),
  ledger: z.array(LedgerSchema),
  accessDays: z.array(z.string().date()),
}).strict();
export type LearningState = z.infer<typeof LearningStateSchema>;
export function emptyLearningState(): LearningState {
  return { instances: [], attempts: [], recoveries: [], ledger: [], accessDays: [] };
}

export const LoadedStudentSchema = z.object({
  studentId: IdSchema,
  institutionId: IdSchema,
  studentName: z.string(),
  preferences: StudentPreferencesSchema.nullable(),
  catalog: CatalogSchema,
  catalogVersion: z.number().int().nonnegative(),
  state: LearningStateSchema,
  stateVersion: z.number().int().nonnegative(),
}).strict();
export type LoadedStudent = z.infer<typeof LoadedStudentSchema>;
export const VersionedCatalogSchema = z.object({ catalog: CatalogSchema, version: z.number().int().nonnegative() }).strict();
export type VersionedCatalog = z.infer<typeof VersionedCatalogSchema>;

export const RankingRowSchema = z.object({
  studentId: IdSchema, name: z.string(), xp: points, rankPoints: points,
}).strict();
export type RankingRow = z.infer<typeof RankingRowSchema>;

export const LearningClassMetricsSchema = z.object({
  classroomId: z.uuid(), studentsEnrolled: z.number().int().nonnegative(),
  attempts: z.number().int().nonnegative(), correct: z.number().int().nonnegative(),
  accessDays: z.number().int().nonnegative(), eligibleDays: z.number().int().nonnegative(),
  correctPercent: z.number().min(0).max(100), frequencyPercent: z.number().min(0).max(100),
}).strict();
export type LearningClassMetrics = z.infer<typeof LearningClassMetricsSchema>;

export class LearningError extends Error {
  constructor(public readonly code: string, message: string, public readonly status = 409, options?: ErrorOptions) {
    super(message, options);
    this.name = "LearningError";
  }
}
export function notFound(): never { throw new LearningError("NOT_FOUND", "Recurso não encontrado para esta conta.", 404); }
export function brazilDay(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}
