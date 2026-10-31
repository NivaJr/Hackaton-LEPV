import { vi } from "vitest";
import type { QuestionForStudent } from "@/contracts";
import type { FetchLike } from "@/lib/llm/gemini";

export const TEST_KEY = "test-key-not-real";
export const geminiEnv = { LLM_PROVIDER: "gemini", LLM_API_KEY: TEST_KEY, LLM_TIMEOUT_MS: "1000" };

export const original: QuestionForStudent = {
  questionInstanceId: "instance-1",
  questionId: "question-1",
  rootQuestionId: "question-1",
  subjectId: "matematica",
  grade: 6,
  skillCodes: ["EF06MA01"],
  statement: "Qual número é maior: 1.250 ou 1.205?",
  options: [{ id: "a", text: "1.250" }, { id: "b", text: "1.205" }],
  sourceType: "original",
  preferencesVersion: 1,
};

export const preferences = { interests: ["futebol"], context: "Gosto de jogar bola no fim de semana.", version: 2 };

export const generated = {
  statement: "Num campeonato, o time A fez 1.340 passes e o time B fez 1.304. Quem fez mais passes?",
  options: [
    { id: "A", text: "a) Time A" },
    { id: "B", text: "Time B" },
    { id: "C", text: "Os dois fizeram o mesmo número" },
    { id: "D", text: "Não dá para saber" },
  ],
  correctOptionId: "A",
  explanation: "Compare da esquerda para a direita: 3 centenas é mais que 0 centenas.",
  hint: "Olhe primeiro o algarismo das centenas.",
  difficulty: "média",
};

export function geminiResponse(payload: unknown, finishReason = "STOP") {
  return new Response(JSON.stringify({
    candidates: [{ content: { parts: [{ text: typeof payload === "string" ? payload : JSON.stringify(payload) }] }, finishReason }],
  }), { status: 200, headers: { "content-type": "application/json" } });
}

export function mockFetch(...responses: Array<Response | (() => Promise<Response>)>) {
  const queue = [...responses];
  return vi.fn<FetchLike>(async () => {
    const next = queue.shift();
    if (!next) throw new Error("Sem resposta simulada.");
    return typeof next === "function" ? next() : next;
  });
}

export function requestBody(fetchMock: ReturnType<typeof mockFetch>, call = 0) {
  return JSON.parse(String(fetchMock.mock.calls[call][1].body));
}
