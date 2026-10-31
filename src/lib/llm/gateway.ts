import "server-only";
import type { GeneratedQuestion } from "@/contracts";
import { readLlmConfig, type LlmEnv } from "./config";
import { AiNotConfiguredError } from "./errors";
import { GeminiLearningAiGateway, type FetchLike } from "./gemini";
import type { DraftQuestion, ExtractionReport, LearningAiGatewayWithReports } from "./types";

export { AI_ERROR_STATUS, AiNotConfiguredError, AiProviderError, type AiErrorCode } from "./errors";
export type {
  DocumentExtractionInput,
  DraftQuestion,
  ExtractionIssue,
  ExtractionReport,
  ExtractionReportingGateway,
  GenerationContext,
  LearningAiGateway,
  LearningAiGatewayWithReports,
  TextExtractionInput,
} from "./types";

class DisabledLearningAiGateway implements LearningAiGatewayWithReports {
  constructor(private readonly reason?: string) {}
  private reject<T>(): Promise<T> { return Promise.reject(new AiNotConfiguredError(this.reason)); }
  extractQuestions(): Promise<DraftQuestion[]> { return this.reject(); }
  extractQuestionsFromDocument(): Promise<DraftQuestion[]> { return this.reject(); }
  extractQuestionsReport(): Promise<ExtractionReport> { return this.reject(); }
  adaptQuestion(): Promise<GeneratedQuestion> { return this.reject(); }
  generateRecoveryQuestion(): Promise<GeneratedQuestion> { return this.reject(); }
  generateHint(): Promise<{ text: string }> { return this.reject(); }
  explainAnswer(): Promise<{ text: string }> { return this.reject(); }
  summarizeStudent(): Promise<{ text: string }> { return this.reject(); }
}

/** Disabled unless LLM_PROVIDER selects a provider with complete server configuration. No synthetic output is returned. */
export function createLearningAiGateway(env: LlmEnv, deps: { fetch?: FetchLike } = {}): LearningAiGatewayWithReports {
  const config = readLlmConfig(env);
  if (config.provider === "gemini") return new GeminiLearningAiGateway(config, deps.fetch);
  return new DisabledLearningAiGateway(config.reason);
}

export function getLearningAiGateway(): LearningAiGatewayWithReports {
  const { LLM_PROVIDER, LLM_MODEL, LLM_API_KEY, LLM_BASE_URL, LLM_TIMEOUT_MS } = process.env;
  return createLearningAiGateway({ LLM_PROVIDER, LLM_MODEL, LLM_API_KEY, LLM_BASE_URL, LLM_TIMEOUT_MS });
}
