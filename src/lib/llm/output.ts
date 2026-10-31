import { z } from "zod";
import { isSkillCompatible, type Grade, type SubjectId } from "@/config/catalog";
import { GeneratedQuestionSchema, type GeneratedQuestion } from "@/contracts";
import { safeParseDraftQuestion, type DraftQuestion } from "./draft-question";
import { AiProviderError } from "./errors";
import type { ExtractionReport } from "./types";

const OPTION_IDS = ["A", "B", "C", "D", "E", "F"] as const;
export const MAX_EXTRACTED_QUESTIONS = 100;

const looseId = z.union([z.string(), z.number()]);
const RawQuestionSchema = z.object({
  statement: z.string(),
  options: z.array(z.union([z.string(), z.object({ id: looseId.optional(), text: z.string() })])).min(2).max(OPTION_IDS.length),
  correctOptionId: looseId,
  explanation: z.string(),
  hint: z.string(),
  difficulty: z.string(),
  skillCodes: z.array(z.string()).optional(),
});

const TextOutputSchema = z.object({ text: z.string().trim().min(1) });
const ExtractionOutputSchema = z.union([z.object({ questions: z.array(z.unknown()) }), z.array(z.unknown())]);

export type QuestionScope = { subjectId: SubjectId; grade: Grade; skillCodes?: string[] };
export type NormalizedQuestion = { ok: true; question: GeneratedQuestion } | { ok: false; reason: string };
export type NormalizedDraft = { ok: true; question: DraftQuestion } | { ok: false; reason: string };

export function parseJsonText(text: string): unknown {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    return JSON.parse(cleaned);
  } catch {
    throw new AiProviderError("INVALID_OUTPUT", "O provedor de IA devolveu um JSON inválido.");
  }
}

const normalizeKey = (value: string | number) => String(value).trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
const stripOptionLabel = (text: string) => text.trim().replace(/^\(?[A-Fa-f]\)\s*/, "").replace(/\s+/g, " ");
const normalizeDifficulty = (value: string) => value.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();

function uniqueCodes(codes: string[], scope: QuestionScope): string[] {
  const normalized = codes.map((code) => code.trim().toUpperCase());
  return [...new Set(normalized)].filter((code) => isSkillCompatible(code, scope.subjectId, scope.grade));
}

type Rebuilt = { ok: true; candidate: Record<string, unknown> } | { ok: false; reason: string };

function rebuild(raw: unknown, scope: QuestionScope): Rebuilt {
  const parsed = RawQuestionSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, reason: "Formato de questão incompleto." };
  const source = parsed.data;

  const originalKeys = source.options.map((option, index) =>
    typeof option === "string" || option.id === undefined ? OPTION_IDS[index] : normalizeKey(option.id));
  const options = source.options.map((option, index) => ({
    id: OPTION_IDS[index],
    text: stripOptionLabel(typeof option === "string" ? option : option.text),
  }));
  const answer = normalizeKey(source.correctOptionId);
  let correctIndex = originalKeys.indexOf(answer);
  if (correctIndex < 0) correctIndex = OPTION_IDS.findIndex((id) => id === answer);
  if (correctIndex < 0 || correctIndex >= options.length) return { ok: false, reason: "Gabarito não corresponde a uma alternativa." };

  return {
    ok: true,
    candidate: {
      subjectId: scope.subjectId,
      grade: scope.grade,
      skillCodes: scope.skillCodes ?? uniqueCodes(source.skillCodes ?? [], scope),
      statement: source.statement.trim(),
      options,
      correctOptionId: options[correctIndex].id,
      explanation: source.explanation.trim(),
      hint: source.hint.trim(),
      difficulty: normalizeDifficulty(source.difficulty),
    },
  };
}

/**
 * Rebuilds a provider question with stable option IDs (A, B, C...) and server-chosen subject, grade
 * and, when given, skills. The strict shared schema decides validity; nothing is invented on failure.
 */
export function normalizeQuestion(raw: unknown, scope: QuestionScope): NormalizedQuestion {
  const rebuilt = rebuild(raw, scope);
  if (!rebuilt.ok) return rebuilt;
  const result = GeneratedQuestionSchema.safeParse(rebuilt.candidate);
  if (!result.success) return { ok: false, reason: result.error.issues[0]?.message ?? "Questão inválida." };
  return { ok: true, question: result.data };
}

/** Extraction keeps a question whose skill is missing: codes come only from the document and the teacher fills the rest. */
export function normalizeExtractedQuestion(raw: unknown, scope: Omit<QuestionScope, "skillCodes">): NormalizedDraft {
  const rebuilt = rebuild(raw, { subjectId: scope.subjectId, grade: scope.grade });
  if (!rebuilt.ok) return rebuilt;
  const result = safeParseDraftQuestion(rebuilt.candidate);
  if (!result.success) return { ok: false, reason: result.error.issues[0]?.message ?? "Questão inválida." };
  return { ok: true, question: result.data };
}

export function requireQuestion(raw: unknown, scope: QuestionScope): GeneratedQuestion {
  const normalized = normalizeQuestion(raw, scope);
  if (!normalized.ok) throw new AiProviderError("INVALID_OUTPUT", `A questão gerada não passou na validação: ${normalized.reason}`);
  return normalized.question;
}

export function collectExtractedQuestions(raw: unknown, scope: QuestionScope): ExtractionReport {
  const parsed = ExtractionOutputSchema.safeParse(raw);
  if (!parsed.success) throw new AiProviderError("INVALID_OUTPUT", "O provedor de IA não devolveu a lista de questões no formato esperado.");
  const items = Array.isArray(parsed.data) ? parsed.data : parsed.data.questions;
  const report: ExtractionReport = { questions: [], discarded: 0, issues: [] };
  const statements = new Set<string>();

  items.forEach((item, index) => {
    if (index >= MAX_EXTRACTED_QUESTIONS) {
      report.discarded += 1;
      report.issues.push({ index, reason: `Limite de ${MAX_EXTRACTED_QUESTIONS} questões por importação.` });
      return;
    }
    const normalized = normalizeExtractedQuestion(item, scope);
    const key = normalized.ok ? normalized.question.statement.toLocaleLowerCase("pt-BR").replace(/\s+/g, " ") : "";
    if (normalized.ok && statements.has(key)) {
      report.discarded += 1;
      report.issues.push({ index, reason: "Questão repetida no documento." });
    } else if (normalized.ok) {
      statements.add(key);
      report.questions.push(normalized.question);
    } else {
      report.discarded += 1;
      report.issues.push({ index, reason: normalized.reason });
    }
  });
  return report;
}

export function requireText(raw: unknown, maxLength: number): { text: string } {
  const parsed = TextOutputSchema.safeParse(raw);
  const text = parsed.success ? parsed.data.text.replace(/\s+/g, " ") : "";
  if (!text || text.length > maxLength) throw new AiProviderError("INVALID_OUTPUT", "O texto gerado pela IA veio vazio ou longo demais.");
  return { text };
}
