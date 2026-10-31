import "server-only";
import { z } from "zod";
import { SUBJECTS } from "@/config/catalog";
import {
  GradeSchema,
  QuestionAnswerKeySchema,
  QuestionForStudentSchema,
  StudentPreferencesSchema,
  StudentSummarySchema,
  SubjectIdSchema,
  type GeneratedQuestion,
  type QuestionAnswerKey,
  type QuestionForStudent,
  type StudentSummary,
} from "@/contracts";
import type { GeminiConfig } from "./config";
import { AiProviderError } from "./errors";
import { collectExtractedQuestions, parseJsonText, requireQuestion, requireText } from "./output";
import {
  ADAPTATION_TEMPLATE,
  dataBlock,
  EXPLANATION_TEMPLATE,
  EXTRACTION_TEMPLATE,
  FAMILY_SUMMARY_TEMPLATE,
  fillTemplate,
  HINT_TEMPLATE,
  questionScope,
  RECOVERY_TEMPLATE,
} from "./prompts";
import type {
  DocumentExtractionInput,
  DraftQuestion,
  ExtractionReport,
  GenerationContext,
  LearningAiGatewayWithReports,
  TextExtractionInput,
} from "./types";

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;
export const MAX_EXTRACTION_TEXT_LENGTH = 200_000;

type GeminiPart = { text: string } | { inline_data: { mime_type: string; data: string } };
type GenerateRequest = {
  systemInstruction: string;
  parts: GeminiPart[];
  temperature: number;
  responseSchema: Record<string, unknown>;
  timeoutMs: number;
};

const STRING = { type: "STRING" };
const QUESTION_RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    statement: STRING,
    options: { type: "ARRAY", items: { type: "OBJECT", properties: { id: STRING, text: STRING }, required: ["id", "text"] } },
    correctOptionId: STRING,
    explanation: STRING,
    hint: STRING,
    difficulty: STRING,
  },
  required: ["statement", "options", "correctOptionId", "explanation", "hint", "difficulty"],
};
const EXTRACTION_RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    questions: {
      type: "ARRAY",
      items: {
        ...QUESTION_RESPONSE_SCHEMA,
        properties: { ...QUESTION_RESPONSE_SCHEMA.properties, skillCodes: { type: "ARRAY", items: STRING } },
      },
    },
  },
  required: ["questions"],
};
const TEXT_RESPONSE_SCHEMA = { type: "OBJECT", properties: { text: STRING }, required: ["text"] };

const GeminiResponseSchema = z.object({
  candidates: z.array(z.object({
    content: z.object({ parts: z.array(z.object({ text: z.string().optional(), thought: z.boolean().optional() })).optional() }).optional(),
    finishReason: z.string().optional(),
  })).optional(),
  promptFeedback: z.object({ blockReason: z.string().optional() }).optional(),
});

const TextInputSchema = z.object({
  text: z.string().trim().min(1).max(MAX_EXTRACTION_TEXT_LENGTH),
  subjectId: SubjectIdSchema,
  grade: GradeSchema,
});
const DocumentInputSchema = z.object({
  mimeType: z.literal("application/pdf"),
  dataBase64: z.string().min(1),
  subjectId: SubjectIdSchema,
  grade: GradeSchema,
});
const GenerationInputSchema = z.object({
  original: QuestionForStudentSchema,
  preferences: StudentPreferencesSchema.pick({ interests: true, context: true, version: true }),
});

function invalidInput(message: string): never {
  throw new AiProviderError("INVALID_INPUT", message);
}

function parseInput<T>(schema: z.ZodType<T>, input: unknown, message: string): T {
  const parsed = schema.safeParse(input);
  return parsed.success ? parsed.data : invalidInput(message);
}

function decodedPdfSize(dataBase64: string): number {
  if (dataBase64.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(dataBase64)) invalidInput("O PDF precisa chegar em base64 válido.");
  const padding = dataBase64.endsWith("==") ? 2 : dataBase64.endsWith("=") ? 1 : 0;
  const size = (dataBase64.length / 4) * 3 - padding;
  if (size > MAX_DOCUMENT_BYTES) invalidInput("O PDF passa do limite de 10 MB.");
  if (!atob(dataBase64.slice(0, 8)).startsWith("%PDF-")) invalidInput("O arquivo enviado não é um PDF.");
  return size;
}

/** Only content fields go to the provider; instance, question and student IDs stay on the server. */
function questionPayload(question: QuestionForStudent) {
  return {
    enunciado: question.statement,
    alternativas: question.options.map((option) => ({ id: option.id, texto: option.text })),
  };
}

function summaryPayload(summary: StudentSummary) {
  const subjects = new Set(summary.difficultSkillCodes
    .map((code) => SUBJECTS.find((subject) => subject.bnccComponent === code.slice(4, 6))?.name)
    .filter((name): name is (typeof SUBJECTS)[number]["name"] => Boolean(name)));
  return {
    periodo: { inicio: summary.periodStart, fim: summary.periodEnd },
    diasComAcesso: summary.accessDays,
    diasComAtividade: summary.activityDays,
    acertos: summary.correctAnswers,
    erros: summary.incorrectAnswers,
    xp: summary.xp,
    pontosDePatente: summary.rankPoints,
    patente: summary.rankName,
    materiasComDificuldade: [...subjects],
    habilidadesComDificuldade: summary.difficultSkillCodes,
  };
}

const normalizeStatement = (statement: string) => statement.toLocaleLowerCase("pt-BR").replace(/\s+/g, " ").trim();

function retryAfter(response: Response): number | undefined {
  const value = Number(response.headers.get("retry-after"));
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

function httpError(response: Response): AiProviderError {
  if (response.status === 429) {
    return new AiProviderError("RATE_LIMITED", "O provedor de IA atingiu o limite de uso. Tente de novo em instantes.", { retryAfterSeconds: retryAfter(response) });
  }
  if (response.status === 413) return new AiProviderError("INVALID_INPUT", "O provedor de IA recusou o tamanho do conteúdo.");
  if (response.status === 401 || response.status === 403) return new AiProviderError("PROVIDER_ERROR", "O provedor de IA recusou a credencial configurada.");
  return new AiProviderError("PROVIDER_ERROR", `O provedor de IA respondeu com erro HTTP ${response.status}.`);
}

function candidateText(body: unknown): string {
  const parsed = GeminiResponseSchema.safeParse(body);
  if (!parsed.success) throw new AiProviderError("INVALID_OUTPUT", "Resposta do provedor de IA em formato desconhecido.");
  if (parsed.data.promptFeedback?.blockReason) throw new AiProviderError("INVALID_OUTPUT", "O provedor de IA bloqueou o conteúdo enviado.");
  const candidate = parsed.data.candidates?.[0];
  if (!candidate) throw new AiProviderError("INVALID_OUTPUT", "O provedor de IA não devolveu resposta.");
  if (candidate.finishReason && candidate.finishReason !== "STOP") {
    throw new AiProviderError("INVALID_OUTPUT", `A resposta do provedor de IA foi interrompida (${candidate.finishReason}).`);
  }
  const text = (candidate.content?.parts ?? []).filter((part) => !part.thought).map((part) => part.text ?? "").join("");
  if (!text.trim()) throw new AiProviderError("INVALID_OUTPUT", "O provedor de IA devolveu uma resposta vazia.");
  return text;
}

export class GeminiClient {
  constructor(private readonly config: GeminiConfig, private readonly fetchImpl: FetchLike = fetch) {}

  async generateJson(request: GenerateRequest): Promise<unknown> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), request.timeoutMs);
    let body: unknown;
    try {
      const response = await this.fetchImpl(`${this.config.baseUrl}/models/${encodeURIComponent(this.config.model)}:generateContent`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": this.config.apiKey },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: request.systemInstruction }] },
          contents: [{ role: "user", parts: request.parts }],
          generationConfig: {
            responseMimeType: "application/json",
            responseSchema: request.responseSchema,
            temperature: request.temperature,
          },
        }),
        signal: controller.signal,
        cache: "no-store",
      });
      if (!response.ok) {
        await response.body?.cancel().catch(() => undefined);
        throw httpError(response);
      }
      body = await response.json();
    } catch (error) {
      if (error instanceof AiProviderError) throw error;
      if (controller.signal.aborted) throw new AiProviderError("TIMEOUT", "O provedor de IA demorou demais para responder.");
      if (error instanceof SyntaxError) throw new AiProviderError("INVALID_OUTPUT", "O provedor de IA devolveu uma resposta ilegível.");
      throw new AiProviderError("PROVIDER_ERROR", "Não foi possível falar com o provedor de IA.");
    } finally {
      clearTimeout(timer);
    }
    return parseJsonText(candidateText(body));
  }
}

export class GeminiLearningAiGateway implements LearningAiGatewayWithReports {
  private readonly client: GeminiClient;

  constructor(private readonly config: GeminiConfig, fetchImpl?: FetchLike) {
    this.client = new GeminiClient(config, fetchImpl);
  }

  async extractQuestionsReport(input: TextExtractionInput | DocumentExtractionInput): Promise<ExtractionReport> {
    const isDocument = typeof input === "object" && input !== null && "dataBase64" in input;
    const parsed = isDocument
      ? parseInput(DocumentInputSchema, input, "Envie um PDF com matéria e ano válidos.")
      : parseInput(TextInputSchema, input, "Envie o texto da lista com matéria e ano válidos.");
    const scope = { subjectId: parsed.subjectId, grade: parsed.grade };
    const header = `Extraia as questões do documento ${isDocument ? "PDF anexado" : "abaixo"}.`;
    let parts: GeminiPart[];
    if ("dataBase64" in parsed) {
      decodedPdfSize(parsed.dataBase64);
      parts = [{ text: header }, { inline_data: { mime_type: parsed.mimeType, data: parsed.dataBase64 } }];
    } else {
      parts = [{ text: `${header}\n${dataBlock(parsed.text)}` }];
    }
    const output = await this.client.generateJson({
      systemInstruction: fillTemplate(EXTRACTION_TEMPLATE, questionScope(scope.subjectId, scope.grade)),
      parts,
      temperature: 0.1,
      responseSchema: EXTRACTION_RESPONSE_SCHEMA,
      timeoutMs: isDocument ? this.config.timeoutMs * 2 : this.config.timeoutMs,
    });
    return collectExtractedQuestions(output, scope);
  }

  async extractQuestions(input: TextExtractionInput): Promise<DraftQuestion[]> {
    return (await this.extractQuestionsReport(input)).questions;
  }

  async extractQuestionsFromDocument(input: DocumentExtractionInput): Promise<DraftQuestion[]> {
    return (await this.extractQuestionsReport(input)).questions;
  }

  async adaptQuestion(input: GenerationContext): Promise<GeneratedQuestion> {
    const { original, preferences } = parseInput(GenerationInputSchema, input, "Questão original ou preferências inválidas.");
    return this.variant(ADAPTATION_TEMPLATE, original, {
      questaoOriginal: questionPayload(original),
      interessesDoAluno: preferences.interests,
      contextoDoAluno: preferences.context,
    });
  }

  async generateRecoveryQuestion(input: GenerationContext & { selectedOptionId: string }): Promise<GeneratedQuestion> {
    const { original, preferences } = parseInput(GenerationInputSchema, input, "Questão original ou preferências inválidas.");
    const selected = original.options.find((option) => option.id === input.selectedOptionId)
      ?? invalidInput("A alternativa escolhida não existe na questão original.");
    return this.variant(RECOVERY_TEMPLATE, original, {
      questaoOriginal: questionPayload(original),
      alternativaEscolhidaPeloAluno: { id: selected.id, texto: selected.text },
      interessesDoAluno: preferences.interests,
      contextoDoAluno: preferences.context,
    });
  }

  async generateHint(input: { question: QuestionForStudent }): Promise<{ text: string }> {
    const question = parseInput(QuestionForStudentSchema, input?.question, "Questão inválida para gerar dica.");
    return this.text(HINT_TEMPLATE, question, { questao: questionPayload(question) }, 500);
  }

  async explainAnswer(input: { question: QuestionForStudent; answerKey: QuestionAnswerKey; selectedOptionId: string }): Promise<{ text: string }> {
    const question = parseInput(QuestionForStudentSchema, input?.question, "Questão inválida para explicar.");
    const answerKey = parseInput(QuestionAnswerKeySchema, input?.answerKey, "Gabarito inválido para explicar.");
    if (answerKey.questionId !== question.questionId) invalidInput("O gabarito não pertence a esta questão.");
    const correct = question.options.find((option) => option.id === answerKey.correctOptionId)
      ?? invalidInput("O gabarito aponta para uma alternativa inexistente.");
    const selected = question.options.find((option) => option.id === input.selectedOptionId)
      ?? invalidInput("A alternativa escolhida não existe na questão.");
    return this.text(EXPLANATION_TEMPLATE, question, {
      questao: questionPayload(question),
      alternativaCorreta: { id: correct.id, texto: correct.text },
      alternativaEscolhidaPeloAluno: { id: selected.id, texto: selected.text },
      explicacaoDoProfessor: answerKey.explanation,
    }, 1_500);
  }

  async summarizeStudent(input: { summary: StudentSummary }): Promise<{ text: string }> {
    const summary = parseInput(StudentSummarySchema, input?.summary, "Resumo do aluno inválido.");
    const output = await this.client.generateJson({
      systemInstruction: FAMILY_SUMMARY_TEMPLATE,
      parts: [{ text: dataBlock(JSON.stringify(summaryPayload(summary), null, 2)) }],
      temperature: 0.3,
      responseSchema: TEXT_RESPONSE_SCHEMA,
      timeoutMs: this.config.timeoutMs,
    });
    return requireText(output, 1_200);
  }

  private async variant(template: string, original: QuestionForStudent, payload: unknown): Promise<GeneratedQuestion> {
    const output = await this.client.generateJson({
      systemInstruction: fillTemplate(template, questionScope(original.subjectId, original.grade, original.skillCodes)),
      parts: [{ text: dataBlock(JSON.stringify(payload, null, 2)) }],
      temperature: 0.4,
      responseSchema: QUESTION_RESPONSE_SCHEMA,
      timeoutMs: this.config.timeoutMs,
    });
    const question = requireQuestion(output, { subjectId: original.subjectId, grade: original.grade, skillCodes: [...original.skillCodes] });
    if (normalizeStatement(question.statement) === normalizeStatement(original.statement)) {
      throw new AiProviderError("INVALID_OUTPUT", "A IA repetiu o enunciado da questão original.");
    }
    return question;
  }

  private async text(template: string, question: QuestionForStudent, payload: unknown, maxLength: number): Promise<{ text: string }> {
    const output = await this.client.generateJson({
      systemInstruction: fillTemplate(template, questionScope(question.subjectId, question.grade, question.skillCodes)),
      parts: [{ text: dataBlock(JSON.stringify(payload, null, 2)) }],
      temperature: 0.3,
      responseSchema: TEXT_RESPONSE_SCHEMA,
      timeoutMs: this.config.timeoutMs,
    });
    return requireText(output, maxLength);
  }
}
