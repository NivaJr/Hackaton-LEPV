import { z } from "zod";
import { isSkillCompatible, SUBJECT_IDS } from "@/config/catalog";
import { APPROVED_STUDENT_INTERESTS } from "@/config/student-interests";

export const IdSchema = z.string().trim().min(1).max(128);
export const RoleSchema = z.enum(["aluno", "coordenador", "professor", "responsavel"]);
export type Role = z.infer<typeof RoleSchema>;
export const GradeSchema = z.union([z.literal(6), z.literal(7), z.literal(8), z.literal(9)]);
export const SubjectIdSchema = z.enum(SUBJECT_IDS);
export const SkillCodeSchema = z.string().regex(/^EF(0[6-9]|67|69|89)(MA|LP|LI|HI|GE|CI)\d{2}$/);

const text = z.string().trim().min(1);
const optionSchema = z.object({ id: IdSchema, text: text.max(2_000) }).strict();
const optionsSchema = z.array(optionSchema).min(2).max(6);

export const TeacherAssignmentSchema = z.object({
  institutionId: IdSchema,
  classId: IdSchema,
  subjectId: SubjectIdSchema,
}).strict();

/** Internal server context. Construct from authenticated identity/database, never request JSON. */
export const SessionContextSchema = z.object({
  userId: IdSchema,
  roles: z.array(RoleSchema).min(1),
  institutionId: IdSchema,
  studentId: IdSchema.optional(),
  guardianStudentIds: z.array(IdSchema).default([]),
  teacherAssignments: z.array(TeacherAssignmentSchema).default([]),
  coordinatorInstitutionIds: z.array(IdSchema).default([]),
}).strict();
export type SessionContext = z.infer<typeof SessionContextSchema>;

export const StudentAccessScopeSchema = z.object({
  studentId: IdSchema,
  institutionId: IdSchema,
  classIds: z.array(IdSchema),
}).strict();
export type StudentAccessScope = z.infer<typeof StudentAccessScopeSchema>;

export const StudentPreferencesSchema = z.object({
  studentId: IdSchema,
  interests: z.array(text.max(100)).max(20),
  context: z.string().trim().max(2_000),
  version: z.number().int().positive(),
  updatedAt: z.string().datetime().optional(),
}).strict();
export type StudentPreferences = z.infer<typeof StudentPreferencesSchema>;

/** Writable fields only; student ID and version come from the authenticated server context. */
export const StudentPreferencesUpdateSchema = z.object({
  interests: z.array(z.enum(APPROVED_STUDENT_INTERESTS, { error: "Escolha somente interesses saudáveis sugeridos pela plataforma." })).max(20),
  context: z.string().trim().max(2_000),
}).strict();
export type StudentPreferencesUpdate = z.infer<typeof StudentPreferencesUpdateSchema>;

export const QuestionSourceTypeSchema = z.enum(["original", "adaptada", "recuperacao"]);
export const QuestionDifficultySchema = z.enum(["facil", "media", "dificil"]);

const questionFields = {
  subjectId: SubjectIdSchema,
  grade: GradeSchema,
  skillCodes: z.array(SkillCodeSchema).min(1).max(10),
  statement: text.max(10_000),
  options: optionsSchema,
};

type QuestionValidationShape = {
  subjectId: z.infer<typeof SubjectIdSchema>;
  grade: z.infer<typeof GradeSchema>;
  skillCodes: string[];
  options: Array<{ id: string; text: string }>;
};

function validateQuestion(question: QuestionValidationShape, ctx: z.RefinementCtx) {
  const optionIds = new Set(question.options.map((option) => option.id));
  const optionTexts = new Set(question.options.map((option) => option.text.toLocaleLowerCase("pt-BR")));
  if (optionIds.size !== question.options.length) {
    ctx.addIssue({ code: "custom", path: ["options"], message: "IDs das alternativas devem ser distintos." });
  }
  if (optionTexts.size !== question.options.length) {
    ctx.addIssue({ code: "custom", path: ["options"], message: "Alternativas devem ter textos distintos." });
  }
  question.skillCodes.forEach((code, index) => {
    if (!isSkillCompatible(code, question.subjectId, question.grade)) {
      ctx.addIssue({ code: "custom", path: ["skillCodes", index], message: "Habilidade incompatível com a matéria ou o ano." });
    }
  });
}

/** Public projection. strict() rejects answer keys, explanations, hints and unknown fields. */
export const QuestionForStudentSchema = z.object({
  questionInstanceId: IdSchema,
  questionId: IdSchema,
  rootQuestionId: IdSchema,
  ...questionFields,
  sourceType: QuestionSourceTypeSchema,
  preferencesVersion: z.number().int().positive(),
}).strict().superRefine(validateQuestion);
export type QuestionForStudent = z.infer<typeof QuestionForStudentSchema>;

/** Protected server-only answer data; never join into a student GET response. */
export const QuestionAnswerKeySchema = z.object({
  questionId: IdSchema,
  correctOptionId: IdSchema,
  explanation: text.max(10_000),
  hint: text.max(5_000),
}).strict();
export type QuestionAnswerKey = z.infer<typeof QuestionAnswerKeySchema>;

/** LLM output cannot choose student IDs, instance IDs, roles or awarded points. */
export const GeneratedQuestionSchema = z.object({
  ...questionFields,
  correctOptionId: IdSchema,
  explanation: text.max(10_000),
  hint: text.max(5_000),
  difficulty: QuestionDifficultySchema,
}).strict().superRefine((question, ctx) => {
  validateQuestion(question, ctx);
  if (!question.options.some((option) => option.id === question.correctOptionId)) {
    ctx.addIssue({ code: "custom", path: ["correctOptionId"], message: "A resposta correta deve identificar uma alternativa existente." });
  }
});
export type GeneratedQuestion = z.infer<typeof GeneratedQuestionSchema>;

/** Client request contains no trusted identity, correctness or scoring fields. */
export const AttemptSubmissionSchema = z.object({
  questionInstanceId: IdSchema,
  selectedOptionId: IdSchema,
  idempotencyKey: z.string().trim().min(8).max(128),
}).strict();
export type AttemptSubmission = z.infer<typeof AttemptSubmissionSchema>;

export const RecoveryStatusSchema = z.enum(["in_progress", "recovered", "interrupted"]);
export type RecoveryStatus = z.infer<typeof RecoveryStatusSchema>;
export const RecoveryStateSchema = z.object({
  status: RecoveryStatusSchema,
  consecutiveCorrect: z.number().int().min(0).max(2),
  answeredCount: z.number().int().nonnegative(),
}).strict().superRefine((state, ctx) => {
  if (state.answeredCount < state.consecutiveCorrect) {
    ctx.addIssue({ code: "custom", path: ["answeredCount"], message: "Total de respostas menor que a sequência de acertos." });
  }
  if ((state.status === "recovered") !== (state.consecutiveCorrect === 2)) {
    ctx.addIssue({ code: "custom", path: ["consecutiveCorrect"], message: "Recuperação concluída exige exatamente dois acertos consecutivos." });
  }
});
export type RecoveryState = z.infer<typeof RecoveryStateSchema>;

export const AttemptResultSchema = z.object({
  attemptId: IdSchema,
  questionInstanceId: IdSchema,
  isCorrect: z.boolean(),
  explanation: text.max(10_000),
  xpAwarded: z.number().nonnegative(),
  rankPointsAwarded: z.number().nonnegative(),
  consecutiveCorrect: z.number().int().min(0).max(2),
  recoveryStatus: RecoveryStatusSchema.nullable(),
}).strict();
export type AttemptResult = z.infer<typeof AttemptResultSchema>;

export const StudentSummarySchema = z.object({
  studentId: IdSchema,
  periodStart: z.string().date(),
  periodEnd: z.string().date(),
  accessDays: z.number().int().nonnegative(),
  activityDays: z.number().int().nonnegative(),
  correctAnswers: z.number().int().nonnegative(),
  incorrectAnswers: z.number().int().nonnegative(),
  xp: z.number().nonnegative(),
  rankPoints: z.number().nonnegative(),
  rankName: text,
  difficultSkillCodes: z.array(SkillCodeSchema),
}).strict().refine((summary) => summary.periodStart <= summary.periodEnd, {
  path: ["periodEnd"], message: "Fim do período anterior ao início.",
});
export type StudentSummary = z.infer<typeof StudentSummarySchema>;

export type { Grade, SubjectId } from "@/config/catalog";
