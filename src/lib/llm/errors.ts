export const AI_ERROR_STATUS = {
  NOT_CONFIGURED: 503,
  INVALID_INPUT: 422,
  TIMEOUT: 504,
  RATE_LIMITED: 429,
  INVALID_OUTPUT: 502,
  PROVIDER_ERROR: 502,
} as const;
export type AiErrorCode = keyof typeof AI_ERROR_STATUS;

/** Messages never carry the API key, the prompt or the raw provider body. */
export class AiProviderError extends Error {
  readonly code: AiErrorCode;
  readonly status: number;
  readonly retryAfterSeconds?: number;

  constructor(code: AiErrorCode, message: string, options: { retryAfterSeconds?: number } = {}) {
    super(message);
    this.name = "AiProviderError";
    this.code = code;
    this.status = AI_ERROR_STATUS[code];
    this.retryAfterSeconds = options.retryAfterSeconds;
  }
}

export class AiNotConfiguredError extends AiProviderError {
  constructor(reason = "Defina LLM_PROVIDER e as variáveis do fornecedor no servidor.") {
    super("NOT_CONFIGURED", `A IA não está configurada neste ambiente. ${reason}`);
    this.name = "AiNotConfiguredError";
  }
}
