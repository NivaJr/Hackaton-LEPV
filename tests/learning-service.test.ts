import { describe, expect, it, vi } from "vitest";
import { AttemptResultSchema, QuestionForStudentSchema, StudentSummarySchema, type GeneratedQuestion } from "@/contracts";
import { readLearningScoringPolicy } from "@/config/scoring";
import { LearningService } from "@/features/learning/server/service";
import { MemoryLearningRepository, actor, catalog, coordinator, fixtureIds, question, teacher, testNow, testPolicy } from "./helpers/learning-memory";

function setup() {
  const repository = new MemoryLearningRepository();
  let count = 100;
  const generate = vi.fn(async () => question(count++));
  const service = new LearningService(repository, { generateRecoveryQuestion: generate }, testPolicy, testNow);
  return { repository, generate, service };
}
async function wrong(service: LearningService) {
  const opened = await service.openActivity(actor(), "root-01");
  return service.submitAttempt(actor(), { questionInstanceId: opened.question.questionInstanceId, selectedOptionId: "b", idempotencyKey: "wrong-original" });
}

describe("aprendizagem: autorização, snapshots e persistência idempotente", () => {
  it("não ativa valores propostos implicitamente e exige as três escolhas explícitas", () => {
    expect(readLearningScoringPolicy({})).toBeNull();
    expect(readLearningScoringPolicy({ LEPV_ORIGINAL_POINTS: "100" })).toBeNull();
    expect(readLearningScoringPolicy({ LEPV_ORIGINAL_POINTS: "100", LEPV_RECOVERY_REFERENCE: "original", LEPV_ADAPTIVE_XP_FOLLOWS_ROOT: "true" })).toEqual(testPolicy);
    expect(readLearningScoringPolicy({ LEPV_ORIGINAL_POINTS: "NaN", LEPV_RECOVERY_REFERENCE: "original", LEPV_ADAPTIVE_XP_FOLLOWS_ROOT: "true" })).toBeNull();
  });

  it("não cria instância sem ficha salva ou configuração explícita", async () => {
    const { repository, service, generate } = setup();
    const disabled = new LearningService(repository, { generateRecoveryQuestion: generate }, null, testNow);
    await expect(disabled.openActivity(actor(), "root-01")).rejects.toMatchObject({ code: "SCORING_NOT_CONFIGURED" });
    repository.students.get(fixtureIds.student)!.preferences = null;
    await expect(service.openActivity(actor(), "root-01")).rejects.toMatchObject({ code: "PREFERENCES_REQUIRED" });
    expect(repository.students.get(fixtureIds.student)!.state.instances).toHaveLength(0);
  });

  it("mantém uma atribuição imutável e não expõe gabarito, explicação ou dica", async () => {
    const { service } = setup();
    const first = await service.openActivity(actor(), "root-01");
    await service.savePreferences(actor(), { interests: ["música"], context: "Orquestra" });
    const again = await service.openActivity(actor(), "root-01");
    expect(again).toEqual(first);
    expect(QuestionForStudentSchema.safeParse(first.question).success).toBe(true);
    expect(JSON.stringify(first)).not.toContain("correctOptionId");
    expect(JSON.stringify(first)).not.toContain("explanation");
    expect(JSON.stringify(first)).not.toContain("hint");
    expect((await service.openActivity(actor(), "root-02")).question.preferencesVersion).toBe(2);
  });

  it("trinta reenvios concorrentes produzem uma tentativa e dois registros de crédito", async () => {
    const { service, repository } = setup();
    const opened = await service.openActivity(actor(), "root-01");
    const submit = { questionInstanceId: opened.question.questionInstanceId, selectedOptionId: "a", idempotencyKey: "same-answer" };
    const results = await Promise.all(Array.from({ length: 30 }, () => service.submitAttempt(actor(), submit)));
    expect(new Set(results.map((value) => value.result.attemptId)).size).toBe(1);
    expect(AttemptResultSchema.safeParse(results[0].result).success).toBe(true);
    expect(repository.students.get(fixtureIds.student)!.state.attempts).toHaveLength(1);
    expect(repository.students.get(fixtureIds.student)!.state.ledger).toHaveLength(2);
    expect((await service.summary(actor(), fixtureIds.student, "2026-10-01", "2026-10-31")).summary).toMatchObject({ xp: 100, rankPoints: 100 });
    await expect(service.submitAttempt(actor(), { ...submit, selectedOptionId: "b", idempotencyKey: "different-key" })).rejects.toMatchObject({ code: "ALREADY_ANSWERED" });
    expect(await service.submitAttempt(actor(), { ...submit, idempotencyKey: "different-key" })).toEqual(results[0]);
    const second = await service.openActivity(actor(), "root-02");
    await expect(service.submitAttempt(actor(), { ...submit, questionInstanceId: second.question.questionInstanceId })).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
  });

  it("nega ator de outro perfil, ID de outro aluno e alternativa inexistente", async () => {
    const { service, repository } = setup();
    const id = "00000000-0000-4000-8000-000000000005";
    repository.addStudent(id);
    const opened = await service.openActivity(actor(), "root-01");
    await expect(service.getInstance(actor({ userId: id, studentId: id }), opened.question.questionInstanceId)).rejects.toMatchObject({ status: 404 });
    await expect(service.openActivity(teacher(), "root-01")).rejects.toMatchObject({ status: 403 });
    await expect(service.submitAttempt(actor(), { questionInstanceId: opened.question.questionInstanceId, selectedOptionId: "z", idempotencyKey: "invalid-option" })).rejects.toMatchObject({ status: 422 });
    expect(repository.students.get(fixtureIds.student)!.state.attempts).toHaveLength(0);
  });
});

describe("recuperação e falhas externas", () => {
  it("preserva tentativa após falha de IA e permite retomar a mesma cadeia", async () => {
    const { service, generate, repository } = setup();
    const attempt = await wrong(service);
    generate.mockRejectedValueOnce(new Error("fornecedor indisponível"));
    await expect(service.nextRecovery(actor(), attempt.recoveryId!)).rejects.toMatchObject({ code: "AI_UNAVAILABLE" });
    expect(repository.students.get(fixtureIds.student)!.state.attempts).toHaveLength(1);
    const next = await service.nextRecovery(actor(), attempt.recoveryId!);
    expect(next!.question.sourceType).toBe("recuperacao");
    expect((await service.nextRecovery(actor(), attempt.recoveryId!))!.question.questionInstanceId).toBe(next!.question.questionInstanceId);
    expect(generate).toHaveBeenCalledTimes(2);
  });

  it("uma solicitação concorrente não cria duas próximas questões nem repete a chamada à IA", async () => {
    const { service, generate, repository } = setup();
    const attempt = await wrong(service);
    const results = await Promise.allSettled(Array.from({ length: 20 }, () => service.nextRecovery(actor(), attempt.recoveryId!)));
    expect(results.some((result) => result.status === "fulfilled")).toBe(true);
    expect(generate).toHaveBeenCalledTimes(1);
    expect(repository.students.get(fixtureIds.student)!.state.instances).toHaveLength(2);
  });

  it("zera sequência após erro, encerra após dois acertos e preserva 70 + 70 sem teto implícito", async () => {
    const { service } = setup();
    const first = await wrong(service);
    const answers = ["a", "b", "a", "a"];
    let last;
    for (let index = 0; index < answers.length; index++) {
      const next = await service.nextRecovery(actor(), first.recoveryId!);
      expect((await service.hint(actor(), next!.question.questionInstanceId)).text).toBe("Conte dois pares.");
      last = await service.submitAttempt(actor(), { questionInstanceId: next!.question.questionInstanceId, selectedOptionId: answers[index], idempotencyKey: `recovery-${index}` });
      expect(last.result.consecutiveCorrect).toBe([1, 0, 1, 2][index]);
      await expect(service.hint(actor(), next!.question.questionInstanceId)).rejects.toMatchObject({ code: "HINT_UNAVAILABLE" });
    }
    expect(last!.result.recoveryStatus).toBe("recovered");
    expect((await service.summary(actor(), fixtureIds.student, "2026-10-01", "2026-10-31")).summary).toMatchObject({ xp: 210, rankPoints: 210 });
    await expect(service.nextRecovery(actor(), first.recoveryId!)).rejects.toMatchObject({ code: "RECOVERY_CLOSED" });
  });

  it("interrupção é idempotente e impede responder uma instância pendente", async () => {
    const { service } = setup();
    const first = await wrong(service);
    const pending = await service.nextRecovery(actor(), first.recoveryId!);
    const interrupted = await service.interrupt(actor(), first.recoveryId!);
    expect(interrupted.state.status).toBe("interrupted");
    expect(await service.interrupt(actor(), first.recoveryId!)).toEqual(interrupted);
    await expect(service.submitAttempt(actor(), { questionInstanceId: pending!.question.questionInstanceId, selectedOptionId: "a", idempotencyKey: "after-interrupt" })).rejects.toMatchObject({ code: "RECOVERY_CLOSED" });
  });

  it("respeita referência na questão anterior quando ela é escolhida explicitamente", async () => {
    const { repository, generate } = setup();
    const service = new LearningService(repository, { generateRecoveryQuestion: generate }, { ...testPolicy, recoveryReference: "previous" }, testNow);
    const first = await wrong(service);
    const awards = [];
    for (let i = 0; i < 2; i++) {
      const next = await service.nextRecovery(actor(), first.recoveryId!);
      awards.push((await service.submitAttempt(actor(), { questionInstanceId: next!.question.questionInstanceId, selectedOptionId: "a", idempotencyKey: `previous-reference-${i}` })).result.xpAwarded);
    }
    expect(awards).toEqual([70,49]);
  });

  it("interromper durante a geração impede persistir a variante atrasada", async () => {
    const { service, generate, repository } = setup();
    let finish!: (value: GeneratedQuestion) => void;
    let started!: () => void;
    const inFlight = new Promise<void>((resolve) => { started = resolve; });
    generate.mockImplementationOnce(async () => { started(); return new Promise<GeneratedQuestion>((resolve) => { finish = resolve; }); });
    const first = await wrong(service);
    const next = service.nextRecovery(actor(), first.recoveryId!);
    await inFlight;
    await service.interrupt(actor(), first.recoveryId!);
    finish(question(999));
    await expect(next).rejects.toMatchObject({ code: "GENERATION_SUPERSEDED" });
    expect(repository.students.get(fixtureIds.student)!.state.instances).toHaveLength(1);
  });

  it.each(["repeated", "wrong_skill", "secret_field"])("rejeita saída de IA %s sem perder a tentativa", async (kind) => {
    const { service, generate, repository } = setup();
    const first = await wrong(service);
    if (kind === "repeated") generate.mockResolvedValueOnce(question(1));
    if (kind === "wrong_skill") generate.mockResolvedValueOnce({ ...question(999), skillCodes: ["EF06MA02"] });
    if (kind === "secret_field") generate.mockResolvedValueOnce({ ...question(999), points: 999 } as GeneratedQuestion);
    await expect(service.nextRecovery(actor(), first.recoveryId!)).rejects.toMatchObject({ status: 503 });
    expect(repository.students.get(fixtureIds.student)!.state.attempts).toHaveLength(1);
    expect(repository.students.get(fixtureIds.student)!.state.instances).toHaveLength(1);
  });
});

describe("rotação, ranking e métricas autorizadas", () => {
  it.each([true,false])("a elegibilidade do XP adaptativo segue a política explícita: followsRoot=%s", async (followsRoot) => {
    const { repository, generate } = setup();
    const service = new LearningService(repository, { generateRecoveryQuestion: generate }, { ...testPolicy, adaptiveXpFollowsRoot: followsRoot }, testNow);
    const first = await wrong(service);
    const next = await service.nextRecovery(actor(), first.recoveryId!);
    await service.submitAttempt(actor(), { questionInstanceId: next!.question.questionInstanceId, selectedOptionId: "a", idempotencyKey: "rotation-adaptive" });
    await service.interrupt(actor(), first.recoveryId!);
    await service.rotate(coordinator(), fixtureIds.classId, "matematica", "2026-10-26", ["root-11","root-12"]);
    expect((await service.summary(actor(), fixtureIds.student, "2026-10-01", "2026-10-31")).summary).toMatchObject({ xp: followsRoot ? 0 : 70, rankPoints: 70 });
  });

  it("professor da turma atual não recebe métricas de uma turma anterior do aluno", async () => {
    const { service, repository } = setup();
    const opened = await service.openActivity(actor(), "root-01");
    await service.submitAttempt(actor(), { questionInstanceId: opened.question.questionInstanceId, selectedOptionId: "a", idempotencyKey: "previous-class" });
    const newClass = catalog();
    newClass.catalog.classId = fixtureIds.otherClass;
    repository.catalogs.set(fixtureIds.otherClass, newClass);
    repository.students.get(fixtureIds.student)!.catalog.classId = fixtureIds.otherClass;
    const currentTeacher = teacher();
    currentTeacher.teacherAssignments[0].classId = fixtureIds.otherClass;
    const result = await service.summary(currentTeacher, fixtureIds.student, "2026-10-01", "2026-10-31");
    expect(result.summary).toMatchObject({ correctAnswers: 0, xp: 0, rankPoints: 0 });
    expect(result.accessDaysScope).toBe("not_available_for_subject");
    expect((await service.summary(actor(), fixtureIds.student, "2026-10-01", "2026-10-31")).summary.rankPoints).toBe(100);
  });

  it("retira XP das raízes removidas sem alterar pontos anuais e processa a semana uma vez", async () => {
    const { service, repository } = setup();
    for (const root of ["root-01", "root-03"]) {
      const opened = await service.openActivity(actor(), root);
      await service.submitAttempt(actor(), { questionInstanceId: opened.question.questionInstanceId, selectedOptionId: "a", idempotencyKey: `correct-${root}` });
    }
    const first = await service.rotate(coordinator(), fixtureIds.classId, "matematica", "2026-10-26", ["root-11", "root-12"]);
    expect(first.outgoingRootIds).toEqual(["root-01", "root-02"]);
    expect(await service.rotate(coordinator(), fixtureIds.classId, "matematica", "2026-10-26", ["root-12", "root-11"])).toEqual(first);
    expect((await service.summary(actor(), fixtureIds.student, "2026-10-01", "2026-10-31")).summary).toMatchObject({ xp: 100, rankPoints: 200 });
    expect((await service.ranking(actor(), fixtureIds.classId)).top10[0]).toMatchObject({ xp: 100, rankPoints: 200 });
    expect(repository.catalogs.get(fixtureIds.classId)!.catalog.activities.filter((item) => item.active)).toHaveLength(10);
    await expect(service.rotate(actor(), fixtureIds.classId, "matematica", "2026-10-26", ["root-01", "root-02"])).rejects.toMatchObject({ status: 403 });
  });

  it("conflito com rotação causa releitura, impedindo resposta à raiz removida", async () => {
    const { service, repository } = setup();
    const opened = await service.openActivity(actor(), "root-01");
    const originalCommit = repository.commitStudent.bind(repository);
    let shouldRotate = true;
    vi.spyOn(repository, "commitStudent").mockImplementation(async (before, state) => {
      if (shouldRotate) { shouldRotate = false; await service.rotate(coordinator(), fixtureIds.classId, "matematica", "2026-10-26", ["root-11", "root-12"]); }
      return originalCommit(before, state);
    });
    await expect(service.submitAttempt(actor(), { questionInstanceId: opened.question.questionInstanceId, selectedOptionId: "a", idempotencyKey: "race-rotation" })).rejects.toMatchObject({ status: 404 });
    expect(repository.students.get(fixtureIds.student)!.state.attempts).toHaveLength(0);
  });

  it("ranking tem dez posições determinísticas e não concede acesso a dados de colegas", async () => {
    const { service, repository } = setup();
    for (let i = 10; i < 25; i++) repository.addStudent(`00000000-0000-4000-8000-${String(i).padStart(12, "0")}`);
    const ranking = await service.ranking(actor(), fixtureIds.classId);
    expect(ranking.top10).toHaveLength(10);
    expect(ranking.top10.map((entry) => entry.position)).toEqual([1,2,3,4,5,6,7,8,9,10]);
    await expect(service.summary(actor(), ranking.top10.find((entry) => entry.studentId !== fixtureIds.student)!.studentId, "2026-10-01", "2026-10-31")).rejects.toMatchObject({ status: 404 });
    await expect(service.ranking(actor(), fixtureIds.otherClass)).rejects.toMatchObject({ status: 404 });
  });

  it("responsável confirmado consulta o filho; vínculo ausente não permite consulta", async () => {
    const { service } = setup();
    const guardian = actor({ userId: fixtureIds.guardian, studentId: undefined, roles: ["responsavel"], guardianStudentIds: [fixtureIds.student] });
    expect((await service.summary(guardian, fixtureIds.student, "2026-10-01", "2026-10-31")).summary.studentId).toBe(fixtureIds.student);
    await expect(service.summary({ ...guardian, guardianStudentIds: [] }, fixtureIds.student, "2026-10-01", "2026-10-31")).rejects.toMatchObject({ status: 404 });
  });

  it("frequência separa acesso de tentativa e usa a data de Brasília", async () => {
    const { service, repository } = setup();
    const midnightUtc = new LearningService(repository, { generateRecoveryQuestion: async () => question(900) }, testPolicy, () => new Date("2026-10-31T01:00:00Z"));
    await midnightUtc.recordAccess(actor());
    await service.recordAccess(actor());
    let summary = (await service.summary(actor(), fixtureIds.student, "2026-10-30", "2026-10-30")).summary;
    expect(summary).toMatchObject({ accessDays: 1, activityDays: 0 });
    await wrong(service);
    summary = (await service.summary(actor(), fixtureIds.student, "2026-10-30", "2026-10-30")).summary;
    expect(summary).toMatchObject({ accessDays: 1, activityDays: 1, incorrectAnswers: 1 });
    expect(StudentSummarySchema.safeParse(summary).success).toBe(true);
  });

  describe("ativação e rotação por turma e matéria", () => {
    const inactive = (repository: MemoryLearningRepository) => {
      const initial = catalog();
      initial.catalog.activities.forEach((item) => { item.active = false; item.activatedAt = null; });
      repository.catalogs.set(fixtureIds.classId, initial);
      return initial.catalog.activities.slice(0, 10).map((item) => item.rootQuestionId);
    };
    const withTeacher = (repository: MemoryLearningRepository) => new LearningService(repository, { generateRecoveryQuestion: async () => question(1) }, testPolicy, testNow, async () => true);

    it("professor da turma e matéria ativa e rotaciona", async () => {
      const { service, repository } = setup();
      const roots = inactive(repository);
      await service.activate(teacher(), fixtureIds.classId, "matematica", roots);
      expect((await service.listActivities(actor())).activities).toHaveLength(10);
      const rotated = await service.rotate(teacher(), fixtureIds.classId, "matematica", "2026-10-26", ["root-11", "root-12"]);
      expect(rotated.outgoingRootIds).toHaveLength(2);
    });

    it("professor de outra matéria e aluno são recusados", async () => {
      const { service, repository } = setup();
      const roots = inactive(repository);
      await expect(service.activate(teacher(), fixtureIds.classId, "historia", roots)).rejects.toMatchObject({ code: "ACTIVITY_MANAGER_REQUIRED", status: 403 });
      await expect(service.activate(actor(), fixtureIds.classId, "matematica", roots)).rejects.toMatchObject({ code: "ACTIVITY_MANAGER_REQUIRED" });
      await expect(service.activityCatalog(actor(), fixtureIds.classId, "matematica")).rejects.toMatchObject({ status: 403 });
    });

    it("coordenador só atua quando a matéria não tem professor", async () => {
      const { repository } = setup();
      const roots = inactive(repository);
      await expect(withTeacher(repository).activate(coordinator(), fixtureIds.classId, "matematica", roots)).rejects.toMatchObject({ code: "TEACHER_ASSIGNED", status: 403 });
      await expect(withTeacher(repository).rotate(coordinator(), fixtureIds.classId, "matematica", "2026-10-26", ["root-11", "root-12"])).rejects.toMatchObject({ code: "TEACHER_ASSIGNED" });
      await withTeacher(repository).activate(teacher(), fixtureIds.classId, "matematica", roots);
      expect(repository.catalogs.get(fixtureIds.classId)!.catalog.activities.filter((item) => item.active)).toHaveLength(10);
    });

    it("o catálogo mostra o estado da semana sem expor gabarito", async () => {
      const { service } = setup();
      const before = await service.activityCatalog(teacher(), fixtureIds.classId, "matematica");
      expect(before).toMatchObject({ weekStart: "2026-10-26", rotatedThisWeek: false, outgoingNext: ["root-01", "root-02"] });
      expect(JSON.stringify(before)).not.toMatch(/correctOptionId|explanation|hint/);
      await service.rotate(teacher(), fixtureIds.classId, "matematica", "2026-10-26", ["root-11", "root-12"]);
      const after = await service.activityCatalog(teacher(), fixtureIds.classId, "matematica");
      expect(after.rotatedThisWeek).toBe(true);
      expect(after.activities.filter((item) => item.retired).map((item) => item.rootQuestionId)).toEqual(["root-01", "root-02"]);
    });
  });

  it("publicação interna exige professor atribuído e não reescreve snapshots", async () => {
    const { service, repository } = setup();
    const input = { rootQuestionId: "new-reviewed", body: question(777), reviewed: true as const, contentVersion: 1 };
    await expect(service.registerActivity(actor(), fixtureIds.classId, input)).rejects.toMatchObject({ status: 403 });
    await service.registerActivity(teacher(), fixtureIds.classId, input);
    await expect(service.registerActivity(teacher(), fixtureIds.classId, { ...input, body: question(778) })).rejects.toMatchObject({ code: "CONTENT_VERSION_CONFLICT" });
    const initial = catalog();
    initial.catalog.activities.forEach((item) => { item.active = false; item.activatedAt = null; });
    repository.catalogs.set(fixtureIds.classId, initial);
    await service.activate(coordinator(), fixtureIds.classId, "matematica", initial.catalog.activities.slice(0, 10).map((item) => item.rootQuestionId));
    expect((await service.listActivities(actor())).activities).toHaveLength(10);
  });
});
