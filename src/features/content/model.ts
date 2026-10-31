import { z } from "zod";
import { GeneratedQuestionSchema, GradeSchema, IdSchema, QuestionSourceTypeSchema, SubjectIdSchema, type GeneratedQuestion, type SessionContext, type SubjectId } from "@/contracts";
import { DraftQuestionSchema } from "@/lib/llm/draft-question";

const timestamp = z.string().datetime();

export const ContentOriginSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("pdf"), fileName: z.string().trim().min(1).max(255) }).strict(),
  z.object({ kind: z.literal("docx"), fileName: z.string().trim().min(1).max(255) }).strict(),
  z.object({ kind: z.literal("texto") }).strict(),
  z.object({ kind: z.literal("exemplo"), exampleId: IdSchema }).strict(),
]);
export type ContentOrigin = z.infer<typeof ContentOriginSchema>;

export const ContentStatusSchema = z.enum(["rascunho", "publicada"]);
/** Who chose correctOptionId last. Only "professor" can be published. */
export const AnswerKeySourceSchema = z.enum(["ia", "exemplo", "professor"]);

/**
 * Teacher-side question record. Contains the answer key: never project it to a student response.
 * An imported draft may have no BNCC skill yet; saving and publishing require GeneratedQuestion.
 */
export const ContentQuestionSchema = z.object({
  id: IdSchema,
  institutionId: IdSchema,
  classId: IdSchema,
  status: ContentStatusSchema,
  sourceType: QuestionSourceTypeSchema,
  rootQuestionId: IdSchema,
  origin: ContentOriginSchema,
  body: DraftQuestionSchema,
  answerKeySource: AnswerKeySourceSchema,
  reviewed: z.boolean(),
  version: z.number().int().positive(),
  createdBy: IdSchema,
  createdAt: timestamp,
  updatedAt: timestamp,
  publishedAt: timestamp.nullable(),
}).strict();
export type ContentQuestion = z.infer<typeof ContentQuestionSchema>;

export const ContentClassSchema = z.object({ id: IdSchema, name: z.string().trim().min(1).max(100), grade: GradeSchema }).strict();
export type ContentClass = z.infer<typeof ContentClassSchema>;

export const ContentScopeSchema = z.object({
  classId: IdSchema,
  className: z.string(),
  grade: GradeSchema,
  subjectId: SubjectIdSchema,
}).strict();
export type ContentScope = z.infer<typeof ContentScopeSchema>;

export const ScopeQuerySchema = z.object({ classId: IdSchema, subjectId: SubjectIdSchema }).strict();

export const MAX_PASTED_TEXT_LENGTH = 60_000;
export const MAX_QUESTIONS_PER_IMPORT = 40;
/** AI reads per user per school day. Proposal for the hackathon; adjust with the team. */
export const AI_IMPORTS_PER_DAY = 20;

export const TextImportSchema = z.object({
  classId: IdSchema,
  subjectId: SubjectIdSchema,
  text: z.string().trim().min(20, "Cole pelo menos uma questão completa.").max(MAX_PASTED_TEXT_LENGTH),
}).strict();

export const ExampleImportSchema = z.object({ classId: IdSchema, subjectId: SubjectIdSchema, exampleId: IdSchema }).strict();

/** body is parsed separately so the teacher sees which field failed. */
export const DraftUpdateSchema = z.object({
  version: z.number().int().positive(),
  reviewed: z.boolean(),
  body: z.unknown(),
}).strict();

export type ContentIssue = { path: string; message: string };

export class ContentError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status = 409,
    public readonly issues?: ContentIssue[],
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "ContentError";
  }
}

export function contentNotFound(): never {
  throw new ContentError("NOT_FOUND", "Questão não encontrada para esta conta.", 404);
}

export function isCoordinatorOf(actor: SessionContext): boolean {
  return actor.roles.includes("coordenador") && actor.coordinatorInstitutionIds.includes(actor.institutionId);
}

export function canManageContent(actor: SessionContext, classId: string, subjectId: SubjectId): boolean {
  if (isCoordinatorOf(actor)) return true;
  return actor.roles.includes("professor") && actor.teacherAssignments.some((item) => item.institutionId === actor.institutionId
    && item.classId === classId && item.subjectId === subjectId);
}

export function zodIssues(error: z.ZodError): ContentIssue[] {
  return error.issues.slice(0, 20).map((issue) => ({ path: issue.path.join("."), message: issue.message }));
}

const MISSING_SKILL = "Informe pelo menos uma habilidade BNCC.";

export function parseQuestionBody(input: unknown): GeneratedQuestion {
  const parsed = GeneratedQuestionSchema.safeParse(input);
  if (!parsed.success) {
    const issues = zodIssues(parsed.error).map((issue) => issue.path === "skillCodes" ? { ...issue, message: MISSING_SKILL } : issue);
    throw new ContentError("INVALID_QUESTION", "A questão tem campos inválidos. Confira os itens destacados.", 422, issues);
  }
  return parsed.data;
}
