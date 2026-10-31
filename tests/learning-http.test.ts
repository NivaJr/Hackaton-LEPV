import { describe, expect, it } from "vitest";
import { AttemptResultSchema, QuestionForStudentSchema, StudentPreferencesSchema, StudentSummarySchema } from "@/contracts";
import { createLearningHttpHandler } from "@/features/learning/server/http";
import { LearningError } from "@/features/learning/server/model";
import { LearningService } from "@/features/learning/server/service";
import { MemoryLearningRepository, actor, fixtureIds, question, teacher, testNow, testPolicy } from "./helpers/learning-memory";

function setup() {
  const repository = new MemoryLearningRepository();
  let generated = 100;
  const service = new LearningService(repository, { generateRecoveryQuestion: async () => question(generated++) }, testPolicy, testNow);
  const handle = createLearningHttpHandler({ getSessionContext: async () => actor(), createService: () => service });
  const request = (method: string, path: string, body?: unknown, origin?: string) => handle(new Request(`http://localhost:3000/api/learning/${path}`, {
    method, headers: { "Content-Type": "application/json", ...(origin ? { Origin: origin } : {}) },
    ...(method !== "GET" ? { body: JSON.stringify(body ?? {}) } : {}),
  }), path.split("?")[0].split("/"));
  return { request, repository, service, handle };
}

describe("contratos HTTP reais consumidos pela interface", () => {
  it("ficha e atividades usam os schemas existentes e a questão pública não contém dados protegidos", async () => {
    const { request } = setup();
    const preferences = await (await request("GET", "preferences")).json();
    expect(StudentPreferencesSchema.safeParse(preferences.preferences).success).toBe(true);
    const saved = await request("PUT", "preferences", { interests: ["música"], context: "Instrumentos" });
    expect(saved.status).toBe(200);
    expect(StudentPreferencesSchema.safeParse(await saved.json()).success).toBe(true);
    const list = await (await request("GET", "activities")).json();
    expect(list.activities).toHaveLength(10);
    expect(list.activities[0]).toMatchObject({ rootQuestionId: "root-01", questionInstanceId: null, status: "not_started", recoveryId: null });
    const openedResponse = await request("POST", "activities/root-01/open");
    const opened = await openedResponse.json();
    expect(QuestionForStudentSchema.safeParse(opened.question).success).toBe(true);
    expect(opened.status).toBe("pending");
    expect(openedResponse.headers.get("cache-control")).toBe("private, no-store");
    expect(JSON.stringify(opened)).not.toMatch(/answerKey|correctOptionId|explanation|hint|nominalPoints|scoring/);
    expect(await (await request("GET", `instances/${opened.question.questionInstanceId}`)).json()).toEqual(opened);
  });

  it("resposta, próxima questão, dica, interrupção e ranking formam um percurso com payloads reais", async () => {
    const { request } = setup();
    const original = await (await request("POST", "activities/root-01/open")).json();
    const answered = await (await request("POST", "attempts", { questionInstanceId: original.question.questionInstanceId, selectedOptionId: "b", idempotencyKey: "http-original" })).json();
    expect(AttemptResultSchema.safeParse(answered.result).success).toBe(true);
    expect(answered.result).toMatchObject({ isCorrect: false, xpAwarded: 0, recoveryStatus: "in_progress" });
    expect(answered.recoveryId).toEqual(expect.any(String));
    const next = await (await request("POST", `recoveries/${answered.recoveryId}/next`)).json();
    const hint = await (await request("POST", `instances/${next.question.questionInstanceId}/hint`)).json();
    expect(hint).toEqual({ questionInstanceId: next.question.questionInstanceId, text: "Conte dois pares." });
    expect(JSON.stringify(hint)).not.toContain("correctOptionId");
    const result = await (await request("POST", "attempts", { questionInstanceId: next.question.questionInstanceId, selectedOptionId: "a", idempotencyKey: "http-recovery" })).json();
    expect(result.result).toMatchObject({ xpAwarded: 70, rankPointsAwarded: 70, consecutiveCorrect: 1 });
    const interruption = await (await request("POST", `recoveries/${answered.recoveryId}/interrupt`)).json();
    expect(interruption).toMatchObject({ recoveryId: answered.recoveryId, state: { status: "interrupted", consecutiveCorrect: 1, answeredCount: 1 } });
    const ranking = await (await request("GET", `ranking?classId=${fixtureIds.classId}`)).json();
    expect(ranking.top10[0]).toMatchObject({ studentId: fixtureIds.student, position: 1, xp: 70, rankPoints: 70 });
    const summary = await (await request("GET", "summary?from=2026-10-01&to=2026-10-31")).json();
    expect(StudentSummarySchema.safeParse(summary.summary).success).toBe(true);
    const ended = await request("POST", `recoveries/${answered.recoveryId}/next`);
    expect(ended.status).toBe(409);
    expect((await ended.json()).error.code).toBe("RECOVERY_CLOSED");
  });

  it("nega autenticação ausente e campos de identidade ou crédito forjados", async () => {
    const { request, service } = setup();
    const anonymous = createLearningHttpHandler({ getSessionContext: async () => null, createService: () => service });
    const response = await anonymous(new Request("http://localhost:3000/api/learning/preferences"), ["preferences"]);
    expect(response.status).toBe(401);
    expect(response.headers.get("vary")).toBe("Cookie");
    const opened = await (await request("POST", "activities/root-01/open")).json();
    const forged = await request("POST", "attempts", { questionInstanceId: opened.question.questionInstanceId, selectedOptionId: "a", idempotencyKey: "forged-request", xpAwarded: 999, studentId: "outro-aluno" });
    expect(forged.status).toBe(422);
    expect((await forged.json()).error.code).toBe("INVALID_INPUT");
    expect((await request("PUT", "preferences", { interests: [], context: "", version: 999 })).status).toBe(422);
    expect((await request("GET", "ranking?classId=invalid")).status).toBe(422);
  });

  it("outro perfil e origem externa não conseguem mutar a ficha do aluno", async () => {
    const { request, service } = setup();
    expect((await request("PUT", "preferences", { interests: [], context: "" }, "https://outro-site.example")).status).toBe(403);
    const asTeacher = createLearningHttpHandler({ getSessionContext: async () => teacher(), createService: () => service });
    const response = await asTeacher(new Request("http://localhost:3000/api/learning/preferences", { method: "PUT", body: JSON.stringify({ interests: [], context: "" }) }), ["preferences"]);
    expect(response.status).toBe(403);
  });

  it("uma falha de IA retorna erro recuperável e a tentativa permanece consultável", async () => {
    const { repository } = setup();
    const service = new LearningService(repository, { generateRecoveryQuestion: async () => { throw new Error("private provider details"); } }, testPolicy, testNow);
    const handle = createLearningHttpHandler({ getSessionContext: async () => actor(), createService: () => service });
    const opened = await service.openActivity(actor(), "root-01");
    const answer = await service.submitAttempt(actor(), { questionInstanceId: opened.question.questionInstanceId, selectedOptionId: "b", idempotencyKey: "provider-failure" });
    const response = await handle(new Request("http://localhost:3000/api/learning/recoveries/any/next", { method: "POST" }), ["recoveries",answer.recoveryId!,"next"]);
    expect(response.status).toBe(503);
    const payload = await response.json();
    expect(payload.error.code).toBe("AI_UNAVAILABLE");
    expect(JSON.stringify(payload)).not.toContain("private provider details");
    expect((await service.getInstance(actor(), opened.question.questionInstanceId)).status).toBe("answered");
  });

  it("configuração ausente não cria demonstração fictícia como se fosse persistência real", async () => {
    const handler = createLearningHttpHandler({ getSessionContext: async () => actor(), createService: () => {
      throw new LearningError("PERSISTENCE_NOT_CONFIGURED", "Configure o Supabase no servidor.", 503);
    } });
    const response = await handler(new Request("http://localhost:3000/api/learning/preferences"), ["preferences"]);
    expect(response.status).toBe(503);
    expect((await response.json()).error.code).toBe("PERSISTENCE_NOT_CONFIGURED");
  });
});
