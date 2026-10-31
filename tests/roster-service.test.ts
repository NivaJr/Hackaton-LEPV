import { beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import type { SessionContext, StudentSummary } from "@/contracts";
import { fixtureRosterMetrics } from "@/features/roster/fixtures";
import { createLearningStudentResults } from "@/features/roster/server/learning-results";
import { createRosterHttpHandler } from "@/features/roster/http";
import { RosterService } from "@/features/roster/service";
import { MemoryDirectory, MemoryRoster, OTHER_SCHOOL, SCHOOL } from "./helpers/roster-memory";

const coordinator: SessionContext = {
  userId: randomUUID(), roles: ["coordenador"], institutionId: SCHOOL, guardianStudentIds: [],
  teacherAssignments: [], coordinatorInstitutionIds: [SCHOOL],
};
const otherCoordinator: SessionContext = { ...coordinator, userId: randomUUID(), institutionId: OTHER_SCHOOL, coordinatorInstitutionIds: [OTHER_SCHOOL] };
const teacher: SessionContext = { ...coordinator, roles: ["professor"], coordinatorInstitutionIds: [] };
const guardian: SessionContext = { ...coordinator, roles: ["responsavel"], coordinatorInstitutionIds: [] };
const student: SessionContext = { ...coordinator, roles: ["aluno"], studentId: coordinator.userId, coordinatorInstitutionIds: [] };

const realSummary: StudentSummary = {
  studentId: "aluno", periodStart: "2026-10-01", periodEnd: "2026-10-30", accessDays: 5, activityDays: 4,
  correctAnswers: 8, incorrectAnswers: 2, xp: 219, rankPoints: 219, rankName: "Bronze (proposta)", difficultSkillCodes: [],
};
const noResults = { studentResults: async () => ({ source: "unavailable" as const, summary: null }) };

const file = (text: string, name = "alunos.csv") => ({ name, bytes: new TextEncoder().encode(text) });
const header = "nome completo,email\n";

let repository: MemoryRoster;
let directory: MemoryDirectory;
let service: RosterService;
let classA: { id: string; name: string };
let classB: { id: string; name: string };

beforeEach(() => {
  repository = new MemoryRoster();
  directory = new MemoryDirectory();
  service = new RosterService({ repository, directory, metrics: fixtureRosterMetrics, results: noResults });
  classA = repository.addClassroom("6A");
  classB = repository.addClassroom("7B");
});

async function enrolledStudent(email: string, classroomId: string) {
  const id = directory.add(email, SCHOOL, ["aluno"], "Aluno Existente");
  return { id, enrollment: await repository.enroll(SCHOOL, classroomId, id) };
}

describe("turmas e alocação", () => {
  it("usa a escola da sessão, valida série e ano e informa nome repetido", async () => {
    const created = await service.createClassroom(coordinator, { name: " 8C ", grade: 8, schoolYear: 2026 });
    expect(repository.classrooms.find((item) => item.id === created.id)).toMatchObject({ schoolId: SCHOOL, name: "8C" });
    await expect(service.createClassroom(coordinator, { name: "5A", grade: 5, schoolYear: 2026 })).rejects.toThrow();
    await expect(service.createClassroom(coordinator, { name: "X", grade: 6, schoolYear: 2026, schoolId: OTHER_SCHOOL })).rejects.toThrow();
    await expect(service.createClassroom(coordinator, { name: "8C", grade: 8, schoolYear: 2026 })).rejects.toMatchObject({ code: "DUPLICATE" });
  });

  it("atualiza e exclui apenas turma da própria escola", async () => {
    await expect(service.updateClassroom(otherCoordinator, classA.id, { name: "invadida" })).rejects.toMatchObject({ status: 404 });
    await expect(service.deleteClassroom(otherCoordinator, classA.id)).rejects.toMatchObject({ status: 404 });
    expect(await service.updateClassroom(coordinator, classA.id, { name: "6A Manhã" })).toMatchObject({ name: "6A Manhã" });
    await expect(service.updateClassroom(coordinator, classA.id, {})).rejects.toThrow();
    expect(await service.deleteClassroom(coordinator, classA.id)).toEqual({ deleted: true });
  });

  it("atribui professor somente a matéria do catálogo e turma da escola", async () => {
    const teacherId = randomUUID();
    const assignment = await service.createAssignment(coordinator, { classroomId: classA.id, teacherId, subjectId: "biologia" });
    expect(assignment).toMatchObject({ teacherId, subjectId: "biologia" });
    await expect(service.createAssignment(coordinator, { classroomId: classA.id, teacherId, subjectId: "fisica" })).rejects.toThrow();
    await expect(service.createAssignment(otherCoordinator, { classroomId: classA.id, teacherId, subjectId: "biologia" })).rejects.toMatchObject({ status: 404 });
    expect(await service.deleteAssignment(coordinator, assignment.id)).toEqual({ deleted: true });
  });

  it("alocação manual não transfere sem a matrícula confirmada", async () => {
    const { id, enrollment } = await enrolledStudent("a@b.com", classA.id);
    await expect(service.allocateStudent(coordinator, { classroomId: classB.id, studentId: id }))
      .rejects.toMatchObject({ code: "TRANSFER_CONFIRMATION_REQUIRED", status: 409 });
    expect((await repository.activeEnrollment(SCHOOL, id))?.classroomId).toBe(classA.id);
    const moved = await service.allocateStudent(coordinator, { classroomId: classB.id, studentId: id, expectedEnrollmentId: enrollment.id });
    expect(moved).toMatchObject({ status: "transferred", enrollment: { classroomId: classB.id } });
    const repeated = await service.allocateStudent(coordinator, { classroomId: classB.id, studentId: id, expectedEnrollmentId: enrollment.id });
    expect(repeated.status).toBe("already_applied");
    expect(repository.enrollments.filter((item) => item.studentId === id)).toHaveLength(2);
  });

  it("a visão geral identifica métricas de fixture e o engajamento é frequência", async () => {
    const { metrics } = await service.overview(coordinator);
    expect(metrics.source).toBe("fixture");
    expect(Object.keys(metrics.classes[0]).sort()).toEqual(["classroomId", "correctPercent", "frequencyPercent"]);
  });
});

describe("resultados por aluno", () => {
  it("audita um lote parcial com ator da sessão e omite os links de cadastro", async () => {
    directory.failInviteFor.add("falha@fixture.test");
    const result = await service.confirmImport(coordinator, { kind: "students", classroomId: classA.id, rows: [
      { line: 2, fullName: "Aluno fictício", email: "novo@fixture.test", decision: "apply" },
      { line: 3, fullName: "Outra linha fictícia", email: "falha@fixture.test", decision: "apply" },
    ] });
    expect(result.rows.map((row) => row.status)).toEqual(["created", "failed"]);
    expect(result.rows[0].accessLink).toBeTruthy();
    expect(repository.audits).toHaveLength(1);
    expect(repository.audits[0]).toMatchObject({ actorId: coordinator.userId, schoolId: SCHOOL, classroomId: classA.id });
    expect(JSON.stringify(repository.audits[0].results)).not.toContain("accessLink");
    expect(JSON.stringify(repository.audits[0].results)).not.toContain("/convite");
    expect(await service.importAudits(otherCoordinator)).toEqual([]);
    await expect(service.importAudits(student)).rejects.toMatchObject({ status: 403 });
  });

  const studentId = randomUUID();
  beforeEach(() => { repository.people.push({ id: studentId, fullName: "Aluno Exemplo", schoolId: SCHOOL, role: "aluno" }); });

  it("repassa o ator e o período ao núcleo e devolve os valores sem alterar", async () => {
    const calls: unknown[] = [];
    const results = createLearningStudentResults(() => ({
      summary: async (...args) => { calls.push(args); return { summary: realSummary }; },
    }));
    const real = new RosterService({ repository, directory, metrics: fixtureRosterMetrics, results, now: () => new Date("2026-10-30T15:00:00Z") });
    expect(await real.studentResults(coordinator, studentId)).toEqual({ source: "real", summary: realSummary });
    expect(calls[0]).toEqual([coordinator, studentId, "2026-10-01", "2026-10-30"]);
  });

  it("falha no núcleo vira indisponível, nunca número de exemplo", async () => {
    const results = createLearningStudentResults(() => { throw new Error("sem configuração"); });
    const real = new RosterService({ repository, directory, metrics: fixtureRosterMetrics, results });
    expect(await real.studentResults(coordinator, studentId)).toEqual({ source: "unavailable", summary: null });
  });

  it("aluno de outra escola, outro ID e outros papéis não consultam", async () => {
    await expect(service.studentResults(otherCoordinator, studentId)).rejects.toMatchObject({ status: 404 });
    await expect(service.studentResults(coordinator, randomUUID())).rejects.toMatchObject({ status: 404 });
    await expect(service.studentResults(teacher, studentId)).rejects.toMatchObject({ status: 403 });
    await expect(service.studentResults(guardian, studentId)).rejects.toMatchObject({ status: 403 });
    await expect(service.studentResults(student, studentId)).rejects.toMatchObject({ status: 403 });
  });
});

describe("vínculos de responsável", () => {
  const studentId = randomUUID();
  const input = { studentId, fullName: "Responsável Exemplo", email: "resp@b.com" };
  beforeEach(() => { repository.people.push({ id: studentId, fullName: "Aluno Exemplo", schoolId: SCHOOL, role: "aluno" }); });

  it("cria conta convidada com vínculo pendente, sem duplicar no reenvio", async () => {
    const link = await service.createGuardianLink(coordinator, input);
    expect(link.status).toBe("pending");
    expect(await service.createGuardianLink(coordinator, input)).toMatchObject({ id: link.id });
    expect(directory.invites).toEqual(["resp@b.com"]);
    expect(repository.links).toHaveLength(1);
  });

  it("devolve o link de cadastro só para conta nova", async () => {
    const created = await service.createGuardianLink(coordinator, input);
    expect(created).toHaveProperty("accessLink");
    expect(await service.createGuardianLink(coordinator, input)).not.toHaveProperty("accessLink");
  });

  it("reutiliza responsável existente; recusa outra escola, outro papel e dados inválidos", async () => {
    const guardianId = directory.add("resp@b.com", SCHOOL, ["responsavel"]);
    expect(await service.createGuardianLink(coordinator, input)).toMatchObject({ guardianId });
    directory.add("fora@b.com", OTHER_SCHOOL, ["responsavel"]);
    directory.add("aluno@b.com", SCHOOL, ["aluno"]);
    await expect(service.createGuardianLink(coordinator, { ...input, email: "fora@b.com" })).rejects.toMatchObject({ code: "OTHER_SCHOOL" });
    await expect(service.createGuardianLink(coordinator, { ...input, email: "aluno@b.com" })).rejects.toMatchObject({ code: "ROLE_CONFLICT" });
    await expect(service.createGuardianLink(coordinator, { ...input, email: "ruim" })).rejects.toMatchObject({ code: "INVALID_EMAIL" });
    expect(repository.links).toHaveLength(1);
  });

  it("aluno de outra escola não gera convite", async () => {
    await expect(service.createGuardianLink(otherCoordinator, input)).rejects.toMatchObject({ status: 404 });
    expect(directory.invites).toEqual([]);
  });

  it("confirma e revoga somente na própria escola e não aceita voltar a pendente", async () => {
    const link = await service.createGuardianLink(coordinator, input);
    expect(await service.setGuardianLinkStatus(coordinator, link.id, { status: "confirmed" })).toMatchObject({ status: "confirmed" });
    expect(await service.setGuardianLinkStatus(coordinator, link.id, { status: "revoked" })).toMatchObject({ status: "revoked" });
    await expect(service.setGuardianLinkStatus(coordinator, link.id, { status: "pending" })).rejects.toThrow();
    await expect(service.setGuardianLinkStatus(otherCoordinator, link.id, { status: "confirmed" })).rejects.toMatchObject({ status: 404 });
    await expect(service.setGuardianLinkStatus(guardian, link.id, { status: "confirmed" })).rejects.toMatchObject({ status: 403 });
  });
});

describe("prévia da importação", () => {
  it("classifica cada linha sem gravar nem convidar ninguém", async () => {
    await enrolledStudent("na-turma@b.com", classA.id);
    await enrolledStudent("outra-turma@b.com", classB.id);
    directory.add("sem-turma@b.com", SCHOOL, ["aluno"]);
    directory.add("outra-escola@b.com", OTHER_SCHOOL, ["aluno"]);
    directory.add("professor@b.com", SCHOOL, ["professor"]);
    const enrollmentsBefore = repository.enrollments.length;
    const accountsBefore = directory.accounts.size;
    const preview = await service.previewImport(coordinator, { kind: "students", classroomId: classA.id, file: file(
      `${header}Nova Pessoa,nova@b.com\nNa Turma,na-turma@b.com\nOutra Turma,outra-turma@b.com\nSem Turma,sem-turma@b.com\nDe Fora,outra-escola@b.com\nProf Lima,professor@b.com\nNova Pessoa,nova@b.com\nSem Email,\n`,
    ) });
    expect(preview.rows.map((row) => [row.line, row.status, row.issues[0]?.code])).toEqual([
      [2, "new", undefined], [3, "already_in_class", undefined], [4, "transfer_available", undefined], [5, "enroll_existing", undefined],
      [6, "invalid", "OTHER_SCHOOL"], [7, "invalid", "ROLE_CONFLICT"], [8, "invalid", "DUPLICATE_IN_FILE"], [9, "invalid", "EMAIL_REQUIRED"],
    ]);
    expect(preview.rows[2]).toMatchObject({ existingName: "Aluno Existente", currentEnrollment: { classroomName: "7B" } });
    expect(preview.counts).toMatchObject({ new: 1, invalid: 4, transfer_available: 1 });
    expect(repository.enrollments).toHaveLength(enrollmentsBefore);
    expect(directory.accounts.size).toBe(accountsBefore);
    expect(directory.invites).toEqual([]);
  });

  it("professores: distingue novo, existente e já atribuído", async () => {
    const id = directory.add("existe@b.com", SCHOOL, ["professor"]);
    await repository.createAssignment(SCHOOL, { classroomId: classA.id, teacherId: id, subjectId: "matematica" });
    const preview = await service.previewImport(coordinator, { kind: "teachers", classroomId: classA.id, file: file(
      "nome completo,email,matéria\nProf Novo,novo@b.com,Inglês\nProf Existe,existe@b.com,Matemática\nProf Existe,existe@b.com,História\n", "p.csv",
    ) });
    expect(preview.rows.map((row) => row.status)).toEqual(["new", "already_assigned", "assign_existing"]);
  });

  it("recusa turma de outra escola e não simula provisionamento sem a chave do servidor", async () => {
    await expect(service.previewImport(otherCoordinator, { kind: "students", classroomId: classA.id, file: file(`${header}Ana Lima,a@b.com\n`) }))
      .rejects.toMatchObject({ status: 404 });
    const unconfigured = new RosterService({ repository, directory: null, metrics: fixtureRosterMetrics, results: noResults });
    await expect(unconfigured.previewImport(coordinator, { kind: "students", classroomId: classA.id, file: file(`${header}Ana Lima,a@b.com\n`) }))
      .rejects.toMatchObject({ code: "PROVISIONING_UNAVAILABLE", status: 503 });
  });
});

describe("confirmação da importação", () => {
  const confirm = (rows: unknown[], actor = coordinator, classroomId = classA.id) => service.confirmImport(actor, { kind: "students", classroomId, rows });
  const row = (line: number, email: string, extra: object = {}) => ({ line, fullName: "Ana Lima", email, decision: "apply", ...extra });

  it("reenvio do lote não duplica identidade, convite nem matrícula", async () => {
    const rows = [row(2, "a@b.com"), row(3, "b@b.com")];
    const first = await confirm(rows);
    expect(first.counts).toMatchObject({ created: 2, failed: 0 });
    const second = await confirm(rows);
    expect(second.counts).toMatchObject({ created: 0, already_applied: 2 });
    expect(directory.invites).toEqual(["a@b.com", "b@b.com"]);
    expect(repository.enrollments).toHaveLength(2);
  });

  it("lote parcial informa o estado por linha e a repetição conclui só as falhas", async () => {
    directory.failInviteFor.add("b@b.com");
    const rows = [row(2, "a@b.com"), row(3, "b@b.com"), row(4, "invalido")];
    const first = await confirm(rows);
    expect(first.rows.map((item) => [item.line, item.status, item.issue?.code])).toEqual([
      [2, "created", undefined], [3, "failed", "PROVISIONING_FAILED"], [4, "failed", "INVALID_EMAIL"],
    ]);
    const retry = await confirm(first.rows.filter((item) => item.status === "failed" && item.line === 3).map(() => rows[1]));
    expect(retry.rows).toMatchObject([{ line: 3, email: "b@b.com", status: "created" }]);
    expect(repository.enrollments).toHaveLength(2);
  });

  it("retoma provisionamento parcial sem criar outra identidade", async () => {
    const orphan = directory.add("orfao@b.com", null, [], null);
    const partial = directory.add("sem-papel@b.com", SCHOOL, []);
    repository.failEnrollFor.add(orphan);
    expect((await confirm([row(2, "orfao@b.com")])).rows[0].status).toBe("failed");
    expect((await confirm([row(2, "orfao@b.com")])).rows[0].status).toBe("enrolled");
    expect((await confirm([row(3, "sem-papel@b.com")])).rows[0].status).toBe("created");
    expect(repository.enrollments.map((item) => item.studentId).sort()).toEqual([orphan, partial].sort());
    expect(directory.invites).toEqual([]);
  });

  it("aluno de outra turma só muda com decisão explícita", async () => {
    const { id, enrollment } = await enrolledStudent("x@b.com", classB.id);
    const withoutDecision = await confirm([row(2, "x@b.com")]);
    expect(withoutDecision.rows[0]).toMatchObject({ status: "failed", issue: { code: "TRANSFER_CONFIRMATION_REQUIRED" } });
    expect((await confirm([row(2, "x@b.com", { decision: "keep" })])).rows[0].status).toBe("kept");
    expect((await repository.activeEnrollment(SCHOOL, id))?.classroomId).toBe(classB.id);
    const moved = await confirm([row(2, "x@b.com", { decision: "transfer", expectedEnrollmentId: enrollment.id })]);
    expect(moved.rows[0].status).toBe("transferred");
    expect((await repository.activeEnrollment(SCHOOL, id))?.classroomId).toBe(classA.id);
    const resent = await confirm([row(2, "x@b.com", { decision: "transfer", expectedEnrollmentId: enrollment.id })]);
    expect(resent.rows[0].status).toBe("already_applied");
    expect(repository.enrollments.filter((item) => item.studentId === id && item.status === "active")).toHaveLength(1);
  });

  it("transferência baseada em prévia antiga é recusada", async () => {
    const { id, enrollment } = await enrolledStudent("x@b.com", classB.id);
    await repository.closeEnrollment(SCHOOL, enrollment.id, "transferred");
    const classC = repository.addClassroom("8C");
    await repository.enroll(SCHOOL, classC.id, id);
    const result = await confirm([row(2, "x@b.com", { decision: "transfer", expectedEnrollmentId: enrollment.id })]);
    expect(result.rows[0]).toMatchObject({ status: "failed", issue: { code: "STALE_PREVIEW" } });
    expect((await repository.activeEnrollment(SCHOOL, id))?.classroomId).toBe(classC.id);
  });

  it("falha na nova matrícula restaura a anterior", async () => {
    const { id, enrollment } = await enrolledStudent("x@b.com", classB.id);
    repository.failEnrollFor.add(id);
    const result = await confirm([row(2, "x@b.com", { decision: "transfer", expectedEnrollmentId: enrollment.id })]);
    expect(result.rows[0]).toMatchObject({ status: "failed", issue: { code: "TRANSFER_FAILED" } });
    expect(await repository.activeEnrollment(SCHOOL, id)).toMatchObject({ id: enrollment.id, classroomId: classB.id });
  });

  it("revalida no servidor em vez de confiar na linha enviada", async () => {
    directory.add("fora@b.com", OTHER_SCHOOL, ["aluno"]);
    const result = await confirm([row(2, "fora@b.com", { decision: "transfer" }), row(3, "ruim"), { ...row(4, "ok@b.com"), fullName: "=CMD()" }, row(5, "dup@b.com"), row(6, "DUP@b.com")]);
    expect(result.rows.map((item) => item.issue?.code)).toEqual(["OTHER_SCHOOL", "INVALID_EMAIL", "FORMULA_CELL", undefined, "DUPLICATE_IN_FILE"]);
    await expect(service.confirmImport(coordinator, { kind: "students", classroomId: classA.id, rows: [{ ...row(2, "a@b.com"), schoolId: OTHER_SCHOOL }] })).rejects.toThrow();
  });

  it("professor novo em duas matérias gera uma identidade e duas atribuições", async () => {
    const rows = [
      { line: 2, fullName: "Prof Lima", email: "p@b.com", subject: "Matemática", decision: "apply" },
      { line: 3, fullName: "Prof Lima", email: "p@b.com", subject: "Inglês", decision: "apply" },
    ];
    const first = await service.confirmImport(coordinator, { kind: "teachers", classroomId: classA.id, rows });
    expect(first.rows.map((item) => item.status)).toEqual(["created", "assigned"]);
    const second = await service.confirmImport(coordinator, { kind: "teachers", classroomId: classA.id, rows });
    expect(second.counts.already_applied).toBe(2);
    expect(directory.invites).toEqual(["p@b.com"]);
    expect(new Set(repository.assignments.map((item) => item.teacherId)).size).toBe(1);
    expect(repository.assignments).toHaveLength(2);
  });
});

describe("links de cadastro", () => {
  it("devolve um link por conta nova e nenhum para conta existente", async () => {
    const existing = "existe@b.com";
    directory.add(existing, SCHOOL, ["aluno"]);
    const result = await service.confirmImport(coordinator, {
      kind: "students", classroomId: classA.id,
      rows: [existing, "novo@b.com"].map((email, index) => ({ line: index + 2, fullName: "Aluno Teste", email, decision: "apply" })),
    });
    expect(result.rows.map((row) => [row.status, Boolean(row.accessLink)])).toEqual([["enrolled", false], ["created", true]]);
  });

  it("gera novo link para pessoa pendente da própria escola", async () => {
    const { userId } = await directory.ensureAccount({ email: "p@b.com", fullName: "Pessoa Pendente", role: "aluno", schoolId: SCHOOL });
    repository.people.push({ id: userId, fullName: "Pessoa Pendente", schoolId: SCHOOL, role: "aluno" });
    expect((await service.issueAccessLink(coordinator, { personId: userId })).accessLink).toContain(userId);
  });

  it("recusa conta já ativada, pessoa de outra escola e outros perfis", async () => {
    const active = directory.add("ativo@b.com", SCHOOL, ["aluno"]);
    repository.people.push({ id: active, fullName: "Conta Ativa", schoolId: SCHOOL, role: "aluno" });
    await expect(service.issueAccessLink(coordinator, { personId: active })).rejects.toMatchObject({ code: "ACCOUNT_ALREADY_ACTIVE", status: 409 });
    await expect(service.issueAccessLink(otherCoordinator, { personId: active })).rejects.toMatchObject({ status: 404 });
    await expect(service.issueAccessLink({ ...coordinator, roles: ["professor"] }, { personId: active })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("gera os links da turma só para quem está nela e ainda não ativou", async () => {
    const { userId } = await directory.ensureAccount({ email: "p@b.com", fullName: "Pessoa Pendente", role: "aluno", schoolId: SCHOOL });
    repository.people.push({ id: userId, fullName: "Pessoa Pendente", schoolId: SCHOOL, role: "aluno" });
    await repository.enroll(SCHOOL, classA.id, userId);
    const fora = await directory.ensureAccount({ email: "fora@b.com", fullName: "Outra Turma", role: "aluno", schoolId: SCHOOL });
    await repository.enroll(SCHOOL, classB.id, fora.userId);
    await enrolledStudent("ativo@b.com", classA.id);
    const result = await service.classAccessLinks(coordinator, classA.id);
    expect(result.links.map((item) => [item.fullName, item.email])).toEqual([["Pessoa Pendente", "p@b.com"]]);
    expect(result.activeCount).toBe(1);
  });

  it("recusa links de turma de outra escola", async () => {
    await expect(service.classAccessLinks(otherCoordinator, classA.id)).rejects.toMatchObject({ status: 404 });
  });

  it("não aceita coordenador como destino do link", async () => {
    const other = directory.add("coord@b.com", SCHOOL, ["coordenador"]);
    await expect(service.issueAccessLink(coordinator, { personId: other })).rejects.toMatchObject({ status: 404 });
  });
});

describe("autorização e HTTP", () => {
  const handlerFor = (actor: SessionContext | null) => createRosterHttpHandler({ getSessionContext: async () => actor, createService: async () => service });
  const json = (method: string, body: unknown, origin?: string) => new Request("http://localhost/api/roster/x", {
    method, body: JSON.stringify(body), headers: origin ? { origin } : {},
  });

  it.each([["professor", teacher], ["responsável", guardian], ["aluno", student]] as const)("%s não executa mutações de coordenador", async (_label, actor) => {
    const handle = handlerFor(actor);
    const responses = await Promise.all([
      handle(new Request("http://localhost/x"), ["overview"]),
      handle(json("POST", { name: "X", grade: 6, schoolYear: 2026 }), ["classrooms"]),
      handle(json("DELETE", {}), ["classrooms", classA.id]),
      handle(json("POST", { kind: "students", classroomId: classA.id, rows: [{ line: 2, fullName: "Ana Lima", email: "a@b.com", decision: "apply" }] }), ["imports", "confirm"]),
      handle(new Request("http://localhost/x", { method: "POST", body: new FormData() }), ["imports", "preview"]),
      handle(new Request("http://localhost/x"), ["templates", "modelo-alunos.csv"]),
    ]);
    expect(responses.map((response) => response.status)).toEqual([403, 403, 403, 403, 403, 403]);
    expect(repository.classrooms).toHaveLength(2);
    expect(directory.invites).toEqual([]);
  });

  it("exige sessão, recusa outra origem e retorna erros no formato comum", async () => {
    expect((await handlerFor(null)(new Request("http://localhost/x"), ["overview"])).status).toBe(401);
    const crossSite = await handlerFor(coordinator)(json("POST", {}, "https://outro.example"), ["classrooms"]);
    expect(crossSite.status).toBe(403);
    const invalid = await handlerFor(coordinator)(json("POST", { name: "" }), ["classrooms"]);
    expect(invalid.status).toBe(422);
    expect((await invalid.json()).error.code).toBe("INVALID_INPUT");
    expect((await handlerFor(coordinator)(new Request("http://localhost/x"), ["nada"])).status).toBe(404);
  });

  it("compara a origem com o Host pedido, não com a URL interna do Next", async () => {
    const call = (origin: string) => handlerFor(coordinator)(new Request("http://localhost:3000/x", {
      method: "POST", headers: { Host: "eai.example", Origin: origin, "X-Forwarded-Host": "outro.example" }, body: JSON.stringify({ name: "Host", grade: 6, schoolYear: 2026 }),
    }), ["classrooms"]);
    expect((await call("http://eai.example")).status).toBe(201);
    expect((await call("http://outro.example")).status).toBe(403);
  });

  it("resultados por aluno respondem pelo handler e validam o ID", async () => {
    const studentId = randomUUID();
    repository.people.push({ id: studentId, fullName: "Aluno Exemplo", schoolId: SCHOOL, role: "aluno" });
    const ok = await handlerFor(coordinator)(new Request("http://localhost/x"), ["students", studentId, "results"]);
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ source: "unavailable", summary: null });
    expect((await handlerFor(coordinator)(new Request("http://localhost/x"), ["students", "nao-uuid", "results"])).status).toBe(422);
    expect((await handlerFor(teacher)(new Request("http://localhost/x"), ["students", studentId, "results"])).status).toBe(403);
  });

  it("prévia por formulário e modelos CSV funcionam pelo handler", async () => {
    const form = new FormData();
    form.set("kind", "students");
    form.set("classroomId", classA.id);
    form.set("file", new File([`${header}Ana Lima,a@b.com\n`], "alunos.csv"));
    const preview = await handlerFor(coordinator)(new Request("http://localhost/x", { method: "POST", body: form }), ["imports", "preview"]);
    expect(preview.status).toBe(200);
    expect(preview.headers.get("cache-control")).toContain("no-store");
    expect((await preview.json()).rows[0]).toMatchObject({ line: 2, status: "new" });
    const template = await handlerFor(coordinator)(new Request("http://localhost/x"), ["templates", "modelo-professores.csv"]);
    expect(template.headers.get("content-type")).toContain("text/csv");
    expect(await template.text()).toContain("matéria");
  });
});
