import { z } from "zod";
import { getSubject } from "@/config/catalog";
import { GeneratedQuestionSchema, GradeSchema, SubjectIdSchema, type GeneratedQuestion } from "@/contracts";

/**
 * Extracted question whose BNCC skill may still be missing. Most school lists carry no code, so the
 * teacher picks it during review. Saving and publishing still require a full GeneratedQuestion.
 */
export type DraftQuestion = Omit<GeneratedQuestion, "skillCodes"> & { skillCodes: string[] };

export type DraftParseResult = { success: true; data: DraftQuestion } | { success: false; error: z.ZodError };

/** Placeholder used only to run the shared schema on the other fields; it never leaves this function. */
function placeholderCode(input: Record<string, unknown>): string {
  const subject = SubjectIdSchema.safeParse(input.subjectId);
  const grade = GradeSchema.safeParse(input.grade);
  if (!subject.success || !grade.success) return "EF06MA01";
  return `EF0${grade.data}${getSubject(subject.data).bnccComponent}01`;
}

export function safeParseDraftQuestion(input: unknown): DraftParseResult {
  const record = typeof input === "object" && input !== null && !Array.isArray(input) ? input as Record<string, unknown> : null;
  const missingSkill = !!record && Array.isArray(record.skillCodes) && record.skillCodes.length === 0;
  if (!missingSkill) {
    const parsed = GeneratedQuestionSchema.safeParse(input);
    return parsed.success ? { success: true, data: parsed.data } : { success: false, error: parsed.error };
  }
  const parsed = GeneratedQuestionSchema.safeParse({ ...record, skillCodes: [placeholderCode(record)] });
  if (parsed.success) return { success: true, data: { ...parsed.data, skillCodes: [] } };
  const issues = parsed.error.issues.filter((issue) => issue.path[0] !== "skillCodes");
  return { success: false, error: new z.ZodError(issues.length ? issues : parsed.error.issues) };
}

export const DraftQuestionSchema = z.unknown().transform((value, ctx): DraftQuestion => {
  const parsed = safeParseDraftQuestion(value);
  if (parsed.success) return parsed.data;
  for (const issue of parsed.error.issues) ctx.addIssue({ code: "custom", path: issue.path, message: issue.message });
  return z.NEVER;
});
