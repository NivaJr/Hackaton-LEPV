import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { readLlmConfig } from "@/lib/llm/config";
import { AiNotConfiguredError, AiProviderError, createLearningAiGateway } from "@/lib/llm/gateway";
import { geminiEnv, mockFetch, original, preferences, TEST_KEY } from "./llm-fixtures";

describe("configuração do gateway de IA", () => {
  it("fica desabilitado por padrão", () => {
    expect(readLlmConfig({})).toEqual({ provider: "disabled" });
    expect(readLlmConfig({ LLM_PROVIDER: "disabled", LLM_API_KEY: TEST_KEY })).toEqual({ provider: "disabled" });
  });

  it("aplica os padrões do Gemini", () => {
    expect(readLlmConfig({ LLM_PROVIDER: "gemini", LLM_API_KEY: TEST_KEY })).toEqual({
      provider: "gemini",
      model: "gemini-2.5-flash",
      apiKey: TEST_KEY,
      baseUrl: "https://generativelanguage.googleapis.com/v1beta",
      timeoutMs: 15_000,
    });
  });

  it.each([
    [{ LLM_PROVIDER: "gemini" }, "LLM_API_KEY"],
    [{ LLM_PROVIDER: "openai", LLM_API_KEY: TEST_KEY }, "não é suportado"],
    [{ ...geminiEnv, LLM_BASE_URL: "http://localhost:8080" }, "https"],
    [{ ...geminiEnv, LLM_MODEL: "../../outro" }, "LLM_MODEL"],
    [{ ...geminiEnv, LLM_TIMEOUT_MS: "abc" }, "LLM_TIMEOUT_MS"],
  ])("desabilita com motivo explícito quando a configuração está incompleta", (env, reason) => {
    const config = readLlmConfig(env);
    expect(config.provider).toBe("disabled");
    expect(config.provider === "disabled" && config.reason).toContain(reason);
  });
});

describe("gateway desabilitado", () => {
  it("rejeita todas as operações com AiNotConfiguredError sem chamar a rede", async () => {
    const fetchMock = mockFetch();
    const gateway = createLearningAiGateway({}, { fetch: fetchMock });
    const calls = [
      gateway.extractQuestions({ text: "1) Quanto é 2 + 2?", subjectId: "matematica", grade: 6 }),
      gateway.extractQuestionsFromDocument({ mimeType: "application/pdf", dataBase64: "JVBERi0x", subjectId: "matematica", grade: 6 }),
      gateway.extractQuestionsReport({ text: "x", subjectId: "matematica", grade: 6 }),
      gateway.adaptQuestion({ original, preferences }),
      gateway.generateRecoveryQuestion({ original, preferences, selectedOptionId: "b" }),
      gateway.generateHint({ question: original }),
      gateway.summarizeStudent({ summary: {} as never }),
    ];
    for (const call of calls) {
      const error = await call.catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(AiNotConfiguredError);
      expect(error).toBeInstanceOf(AiProviderError);
      expect(error).toMatchObject({ code: "NOT_CONFIGURED", status: 503 });
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("explica a chave ausente sem expor valores", async () => {
    const error = await createLearningAiGateway({ LLM_PROVIDER: "gemini", LLM_API_KEY: " " })
      .adaptQuestion({ original, preferences }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(AiNotConfiguredError);
    expect((error as Error).message).toContain("LLM_API_KEY");
  });
});
