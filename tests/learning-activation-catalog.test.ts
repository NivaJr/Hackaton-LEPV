import { describe, expect, it } from "vitest";
import type { SessionContext } from "@/contracts";
import { createLearningHttpHandler } from "@/features/learning/server/http";
import { LearningService } from "@/features/learning/server/service";
import { MemoryLearningRepository, actor, coordinator, fixtureIds, question, teacher, testNow, testPolicy } from "./helpers/learning-memory";

function setup(session: () => SessionContext = coordinator) {
  const repository = new MemoryLearningRepository();
  const service = new LearningService(repository, { generateRecoveryQuestion: async () => question(100) }, testPolicy, testNow);
  const handle = createLearningHttpHandler({ getSessionContext: async () => session(), createService: () => service });
  const request = (method: string, path: string, body?: unknown) => handle(new Request(`http://localhost:3000/api/learning/${path}`, {
    method, headers: { "Content-Type": "application/json" },
    ...(method !== "GET" ? { body: JSON.stringify(body ?? {}) } : {}),
  }), path.split("?")[0].split("/"));
  return { request, repository };
}

const catalogPath = (classId = fixtureIds.classId, subjectId = "matematica") => `catalog?classId=${classId}&subjectId=${subjectId}`;

describe("catálogo de originais para ativação pelo coordenador", () => {
  it("lista ativas e inativas da matéria sem gabarito, explicação ou dica", async () => {
    const { request } = setup();
    const response = await request("GET", catalogPath());
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({ classId: fixtureIds.classId, subjectId: "matematica", grade: 6 });
    expect(body.activities).toHaveLength(12);
    expect(body.activities.filter((item: { active: boolean }) => item.active)).toHaveLength(10);
    expect(body.activities[0]).toEqual({
      rootQuestionId: "root-01", statement: expect.stringContaining("Questão sintética"), skillCodes: ["EF06MA01"],
      difficulty: "facil", active: true, activatedAt: "2026-10-29T12:00:00Z",
    });
    expect(JSON.stringify(body)).not.toMatch(/correctOptionId|explanation|hint|options/);
  });

  it("filtra pela matéria pedida", async () => {
    const { request } = setup();
    const body = await (await request("GET", catalogPath(fixtureIds.classId, "historia"))).json();
    expect(body.activities).toEqual([]);
  });

  it("recusa professor, aluno, turma de outra escola e consulta malformada", async () => {
    expect((await setup(teacher).request("GET", catalogPath())).status).toBe(403);
    expect((await setup(() => actor()).request("GET", catalogPath())).status).toBe(403);
    const other = setup(() => actor({ userId: fixtureIds.coordinator, studentId: undefined, institutionId: fixtureIds.otherSchool, roles: ["coordenador"], coordinatorInstitutionIds: [fixtureIds.otherSchool] }));
    expect((await other.request("GET", catalogPath())).status).toBe(404);
    expect((await setup().request("GET", `catalog?classId=${fixtureIds.classId}&subjectId=quimica`)).status).toBe(422);
    expect((await setup().request("GET", `${catalogPath()}&institutionId=${fixtureIds.otherSchool}`)).status).toBe(422);
  });

  it("depois de listar, a ativação inicial das 10 escolhidas libera as questões ao aluno", async () => {
    const { request, repository } = setup();
    const current = repository.catalogs.get(fixtureIds.classId)!;
    current.catalog.activities.forEach((item) => { item.active = false; item.activatedAt = null; });
    const listed = await (await request("GET", catalogPath())).json();
    expect(listed.activities.every((item: { active: boolean }) => !item.active)).toBe(true);
    const chosen = listed.activities.slice(2, 12).map((item: { rootQuestionId: string }) => item.rootQuestionId);
    const activated = await request("POST", "activation", { classId: fixtureIds.classId, subjectId: "matematica", rootQuestionIds: chosen });
    expect(activated.status).toBe(200);
    const after = await (await request("GET", catalogPath())).json();
    expect(after.activities.filter((item: { active: boolean }) => item.active).map((item: { rootQuestionId: string }) => item.rootQuestionId)).toEqual(chosen);
    const again = await request("POST", "activation", { classId: fixtureIds.classId, subjectId: "matematica", rootQuestionIds: listed.activities.slice(0, 10).map((item: { rootQuestionId: string }) => item.rootQuestionId) });
    expect(again.status).toBe(409);
    expect((await again.json()).error.code).toBe("ALREADY_ACTIVATED");
  });
});
