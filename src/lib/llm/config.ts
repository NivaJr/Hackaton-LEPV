import "server-only";

export const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";
export const DEFAULT_GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";
export const DEFAULT_LLM_TIMEOUT_MS = 15_000;

export type LlmEnv = Partial<Record<"LLM_PROVIDER" | "LLM_MODEL" | "LLM_API_KEY" | "LLM_BASE_URL" | "LLM_TIMEOUT_MS", string>>;

export type GeminiConfig = {
  provider: "gemini";
  model: string;
  apiKey: string;
  baseUrl: string;
  timeoutMs: number;
};

export type LlmConfig = { provider: "disabled"; reason?: string } | GeminiConfig;

const disabled = (reason: string): LlmConfig => ({ provider: "disabled", reason });

/** Server environment only. A missing or invalid setting disables the provider instead of guessing. */
export function readLlmConfig(env: LlmEnv): LlmConfig {
  const provider = env.LLM_PROVIDER?.trim().toLowerCase() || "disabled";
  if (provider === "disabled") return { provider: "disabled" };
  if (provider !== "gemini") return disabled(`LLM_PROVIDER "${provider}" não é suportado. Use "disabled" ou "gemini".`);

  const apiKey = env.LLM_API_KEY?.trim();
  if (!apiKey) return disabled("LLM_API_KEY está vazia para o provedor gemini.");

  const model = env.LLM_MODEL?.trim() || DEFAULT_GEMINI_MODEL;
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(model)) return disabled("LLM_MODEL tem formato inválido.");

  const rawBase = env.LLM_BASE_URL?.trim() || DEFAULT_GEMINI_BASE_URL;
  let baseUrl: URL;
  try { baseUrl = new URL(rawBase); } catch { return disabled("LLM_BASE_URL não é uma URL válida."); }
  if (baseUrl.protocol !== "https:" || baseUrl.username || baseUrl.password || baseUrl.search || baseUrl.hash) {
    return disabled("LLM_BASE_URL precisa usar https, sem credenciais nem parâmetros.");
  }

  const rawTimeout = env.LLM_TIMEOUT_MS?.trim();
  const timeoutMs = rawTimeout ? Number(rawTimeout) : DEFAULT_LLM_TIMEOUT_MS;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1_000 || timeoutMs > 120_000) {
    return disabled("LLM_TIMEOUT_MS deve ser um inteiro entre 1000 e 120000.");
  }

  return { provider: "gemini", model, apiKey, baseUrl: baseUrl.toString().replace(/\/+$/, ""), timeoutMs };
}
