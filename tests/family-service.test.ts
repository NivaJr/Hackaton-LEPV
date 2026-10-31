import { beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import type { SessionContext, StudentSummary } from "@/contracts";
import { fixtureFamilyMetrics } from "@/features/family/fixtures";
import { createFamilyHttpHandler } from "@/features/family/http";
import type { FamilyRecord, FamilyRecordCategory, MetricsResult } from "@/features/family/model";
import type { FamilyRepository } from "@/features/family/ports";
import { FamilyService } from "@/features/family/service";

const SCHOOL = "11111111-1111-4111-8111-111111111111";
const child = randomUUID();
const colleague = randomUUID();

const guardian: SessionContext = {
  userId: randomUUID(), roles: ["responsavel"], institutionId: SCHOOL, guardianStudentIds: [child],
  teacherAssignments: [], coordinatorInstitutionIds: [],
};
const coordinator: SessionContext = { ...guardian, roles: ["coordenador"], guardianStudentIds: [], coordinatorInstitutionIds: [SCHOOL] };
const teacher: SessionContext = { ...guardian, roles: ["professor"], guardianStudentIds: [], teacherAssignments: [{ institutionId: SCHOOL, classId: randomUUID(), subjectId: "matematica" }] };
const student: SessionContext = { ...guardian, roles: ["aluno"], studentId: child, guardianStudentIds: [] };

const realSummary: StudentSummary = {
  studentId: child, periodStart: "2026-10-01", periodEnd: "2026-10-30", accessDays: 5, activityDays: 4,
  correctAnswers: 8, incorrectAnswers: 2, xp: 10, rankPoints: 10, rankName: "Bronze", difficultSkillCodes: [],
};
const realMetrics = { async studentSummary(): Promise<MetricsResult> { return { source: "real", summary: realSummary }; } };

class MemoryFamily implements FamilyRepository {
  records = new Map<string, FamilyRecord>();
  async getChildren(_schoolId: string, ids: string[]) {
    return ids.filter((id) => id === child).map((id) => ({ id, fullName: "Aluno Vinculado", classroomName: "6A", grade: 6 }));
  }
  async getRecord(_schoolId: string, studentId: string, category: FamilyRecordCategory) {
    return this.records.get(`${studentId}:${category}`) ?? { details: "", updatedAt: null };
  }
  async saveRecord(_schoolId: string, studentId: string, category: FamilyRecordCategory, details: string) {
    const record = { details, updatedAt: "2026-10-30T12:00:00.000Z" };
    this.records.set(`${studentId}:${category}`, record);
    return record;
  }
  async getHistory() {
    return [{ id: "h1", subjectId: "matematica", schoolYear: 2026, period: "Primeiro período", grade: 8, notes: "" }];
  }
}

let repository: MemoryFamily;
let summarized: unknown[];
let service: FamilyService;

beforeEach(() => {
  repository = new MemoryFamily();
  summarized = [];
  service = new FamilyService({
    repository, metrics: fixtureFamilyMetrics,
    summarize: async (input) => { summarized.push(input); return { text: "Texto da IA" }; },
    now: () => new Date("2026-10-30T15:00:00Z"),
  });
});

describe("painel do responsável", () => {
  it("lista só filhos vinculados e consulta resultados, saúde, apoio e histórico", async () => {
    expect((await service.listChildren(guardian)).map((item) => item.id)).toEqual([child]);
    await service.saveRecord(guardian, child, "health", { details: "Registro fictício" });
    const overview = await service.overview(guardian, child);
    expect(overview).toMatchObject({ student: { id: child }, health: { details: "Registro fictício" }, support: { details: "" } });
    expect(overview.history).toHaveLength(1);
    expect(overview.metrics).toMatchObject({ source: "fixture", summary: { periodStart: "2026-10-01", periodEnd: "2026-10-30" } });
  });

  it("ID de outro aluno não concede leitura nem edição e responde como inexistente", async () => {
    await expect(service.overview(guardian, colleague)).rejects.toMatchObject({ status: 404 });
    await expect(service.saveRecord(guardian, colleague, "health", { details: "x" })).rejects.toMatchObject({ status: 404 });
    await expect(service.feedback(guardian, colleague)).rejects.toMatchObject({ status: 404 });
    expect(repository.records.size).toBe(0);
  });

  it.each([["coordenador", coordinator], ["professor", teacher], ["aluno", student]] as const)("%s não usa a área do responsável nem edita saúde", async (_label, actor) => {
    await expect(service.listChildren(actor)).rejects.toMatchObject({ status: 403 });
    await expect(service.saveRecord(actor, child, "support", { details: "x" })).rejects.toMatchObject({ status: 403 });
    expect(repository.records.size).toBe(0);
  });

  it("coordenador que também é responsável só alcança o próprio filho", async () => {
    const both: SessionContext = { ...coordinator, roles: ["coordenador", "responsavel"], guardianStudentIds: [child] };
    await expect(service.saveRecord(both, colleague, "health", { details: "x" })).rejects.toMatchObject({ status: 404 });
    expect(await service.saveRecord(both, child, "health", { details: "ok" })).toMatchObject({ details: "ok" });
  });

  it("edita somente saúde e apoio: histórico e interesses não são categorias aceitas", async () => {
    await expect(service.saveRecord(guardian, child, "academic_history", { details: "x" })).rejects.toThrow();
    await expect(service.saveRecord(guardian, child, "preferences", { details: "x" })).rejects.toThrow();
    await expect(service.saveRecord(guardian, child, "health", { details: "x".repeat(10_001) })).rejects.toThrow();
    await expect(service.saveRecord(guardian, child, "health", { details: "x", studentId: colleague })).rejects.toThrow();
    expect(await service.saveRecord(guardian, child, "support", { details: "" })).toMatchObject({ details: "" });
  });
});

describe("feedback", () => {
  it("métrica de exemplo nunca é enviada ao fornecedor", async () => {
    const feedback = await service.feedback(guardian, child);
    expect(feedback).toMatchObject({ origin: "automatica", metricsSource: "fixture" });
    expect(summarized).toEqual([]);
  });

  it("com métricas reais envia só o resumo, sem saúde ou apoio", async () => {
    await repository.saveRecord(SCHOOL, child, "health", "SEGREDO-SAUDE");
    const real = new FamilyService({ repository, metrics: realMetrics, summarize: async (input) => { summarized.push(input); return { text: "Texto da IA" }; } });
    expect(await real.feedback(guardian, child)).toEqual({ text: "Texto da IA", origin: "ia", metricsSource: "real" });
    expect(summarized).toEqual([{ summary: realSummary }]);
    expect(JSON.stringify(summarized)).not.toContain("SEGREDO-SAUDE");
  });

  it("sem IA mostra mensagem automática identificada, sem inventar geração", async () => {
    const disabled = new FamilyService({ repository, metrics: realMetrics, summarize: () => Promise.reject(new Error("desabilitado")) });
    const feedback = await disabled.feedback(guardian, child);
    expect(feedback.origin).toBe("automatica");
    expect(feedback.text).toContain("8 de 10");
  });
});

describe("HTTP da família", () => {
  const handlerFor = (actor: SessionContext | null) => createFamilyHttpHandler({ getSessionContext: async () => actor, createService: async () => service });
  const put = (body: string, origin?: string) => new Request("http://localhost/x", { method: "PUT", body, headers: origin ? { origin } : {} });

  it("expõe consulta e edição e recusa sessão ausente, outra origem e JSON inválido", async () => {
    const handle = handlerFor(guardian);
    expect((await (await handle(new Request("http://localhost/x"), ["children"])).json()).children).toHaveLength(1);
    expect((await handle(put(JSON.stringify({ details: "ok" })), ["students", child, "support"])).status).toBe(200);
    expect((await handle(new Request("http://localhost/x"), ["students", child, "feedback"])).status).toBe(200);
    expect((await handle(put("{"), ["students", child, "health"])).status).toBe(422);
    expect((await handle(put("{}", "https://outro.example"), ["students", child, "health"])).status).toBe(403);
    expect((await handle(put(JSON.stringify({ details: "x" })), ["students", child, "academic_history"])).status).toBe(422);
    expect((await handle(new Request("http://localhost/x"), ["students", "nao-uuid"])).status).toBe(422);
    expect((await handlerFor(null)(new Request("http://localhost/x"), ["children"])).status).toBe(401);
  });
});
