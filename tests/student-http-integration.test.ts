import { afterEach, describe, expect, it, vi } from "vitest";
import { createHttpStudentLearningClient } from "@/features/learning/client";
import { createLearningHttpHandler } from "@/features/learning/server/http";
import { LearningService } from "@/features/learning/server/service";
import { AiNotConfiguredError } from "@/lib/llm/gateway";
import { MemoryLearningRepository, actor, question, testNow, testPolicy } from "./helpers/learning-memory";

vi.mock("server-only", () => ({}));

afterEach(() => vi.unstubAllGlobals());

function setup(disabledAi = false) {
  const repository = new MemoryLearningRepository();
  let generated = 100;
  const service = new LearningService(repository, { generateRecoveryQuestion: async () => {
    if (disabledAi) throw new AiNotConfiguredError();
    return question(generated++); // Explicit synthetic test adapter, never a production provider.
  } }, testPolicy, testNow);
  const handle = createLearningHttpHandler({ getSessionContext: async () => actor(), createService: () => service });
  const fetchMock = vi.fn(async (input: string, init?: RequestInit) => {
    const url = new URL(input, "http://localhost:3000");
    return handle(new Request(url, init), url.pathname.replace("/api/learning/", "").split("/").map(decodeURIComponent));
  });
  vi.stubGlobal("fetch", fetchMock);
  return { client: createHttpStudentLearningClient(), fetchMock };
}

describe("cliente HTTP do aluno conectado ao handler e ao serviço", () => {
  it("carrega turma, salva e relê ficha, responde e consulta créditos sem duplicar", async () => {
    const { client, fetchMock } = setup();
    await client.recordAccess();
    const before = await client.loadSnapshot();
    expect(before.activities.className).toBe("6A fictícia");
    expect(before.summary.accessDays).toBe(1);
    expect(before.activities.activities.every((activity) => activity.grade === 6)).toBe(true);
    await client.savePreferences({ interests: ["xadrez"], context: "Desafios curtos." });
    expect((await client.loadSnapshot()).preferences).toMatchObject({ interests: ["xadrez"], context: "Desafios curtos." });
    const opened = await client.openActivity("root-02");
    expect(JSON.stringify(opened)).not.toMatch(/correctOptionId|answerKey|explanation/);
    const input = { questionInstanceId: opened.question.questionInstanceId, selectedOptionId: "a", idempotencyKey: "student-http-correct" };
    const result = await client.submitAttempt(input);
    expect(await client.submitAttempt(input)).toEqual(result);
    expect((await client.openActivity("root-02"))).toMatchObject({ status: "answered", result: result.result });
    expect(await client.getQuestion(opened.question.questionInstanceId)).toMatchObject({ status: "answered" });
    const after = await client.loadSnapshot();
    expect(after.summary).toMatchObject({ xp: 100, rankPoints: 100, correctAnswers: 1, activityDays: 1 });
    expect(after.ranking.top10[0]).toMatchObject({ xp: 100, rankPoints: 100 });
    expect(after.activityDates).toEqual(["2026-10-30"]);
    const sent = fetchMock.mock.calls.filter(([url]) => url.endsWith("/attempts"));
    expect(sent.map(([, init]) => JSON.parse(init!.body as string))).toEqual([input, input]);
  });

  it("recuperação sintética percorre dica e interrupção e informa estado atual ao reabrir", async () => {
    const { client } = setup();
    const opened = await client.openActivity("root-01");
    const wrong = await client.submitAttempt({ questionInstanceId: opened.question.questionInstanceId, selectedOptionId: "b", idempotencyKey: "student-http-wrong" });
    const recovery = await client.getNextRecoveryQuestion(wrong.recoveryId!);
    expect((await client.getHint(recovery.question.questionInstanceId)).text).toBe("Conte dois pares.");
    await client.submitAttempt({ questionInstanceId: recovery.question.questionInstanceId, selectedOptionId: "a", idempotencyKey: "student-http-recovery" });
    expect((await client.loadSnapshot()).activities.activities[0]).toMatchObject({ recoveryStatus: "in_progress", recoveryConsecutiveCorrect: 1 });
    await client.interruptRecovery(wrong.recoveryId!);
    expect((await client.loadSnapshot()).activities.activities[0].recoveryStatus).toBe("interrupted");
    await expect(client.getNextRecoveryQuestion(wrong.recoveryId!)).rejects.toMatchObject({ code: "RECOVERY_CLOSED" });
  });

  it("propaga indisponibilidade da IA e preserva a tentativa sem fixture", async () => {
    const { client } = setup(true);
    const opened = await client.openActivity("root-01");
    const wrong = await client.submitAttempt({ questionInstanceId: opened.question.questionInstanceId, selectedOptionId: "b", idempotencyKey: "student-http-ai-unavailable" });
    await expect(client.getNextRecoveryQuestion(wrong.recoveryId!)).rejects.toMatchObject({ code: "AI_UNAVAILABLE", status: 503 });
    expect((await client.getQuestion(opened.question.questionInstanceId)).status).toBe("answered");
  });
});
