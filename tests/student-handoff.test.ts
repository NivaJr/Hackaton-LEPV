import { describe, expect, it } from "vitest";
import { CONFIRMED_LEARNING_SCORING_POLICY } from "@/config/scoring";
import { ActivitySchema } from "@/features/learning/server/model";
import { LearningService } from "@/features/learning/server/service";
import { InMemoryActivityPublisher, InMemoryClassDirectory, InMemoryContentRepository } from "@/features/content/memory";
import { ContentService } from "@/features/content/service";
import { actor, coordinator, fixtureIds as ids, MemoryLearningRepository, question, teacher, testNow } from "./helpers/learning-memory";

function learningSetup() {
  const repository = new MemoryLearningRepository();
  let generated = 100;
  const service = new LearningService(repository, { generateRecoveryQuestion: async () => question(generated++) }, CONFIRMED_LEARNING_SCORING_POLICY, testNow);
  return { repository, service };
}

describe("conclusão do handoff do Viegas", () => {
  it("não converte um exercício sem tipo em desafio com XP", () => {
    expect(ActivitySchema.parse({ rootQuestionId: "legacy-root", body: question(), reviewed: true, contentVersion: 1, active: true, activatedAt: testNow().toISOString() }).activityType).toBe("exercise");
  });

  it("exige dificuldade alta na publicação de novos desafios semanais", async () => {
    const { service } = learningSetup();
    const value = { rootQuestionId: "new-weekly", body: question(500), contentVersion: 1, reviewed: true as const, activityType: "weekly_challenge" as const };
    await expect(service.registerActivity(teacher(), ids.classId, value)).rejects.toMatchObject({ code: "CHALLENGE_DIFFICULTY_REQUIRED" });
    await expect(service.registerActivity(teacher(), ids.classId, { ...value, body: { ...value.body, difficulty: "dificil" } })).resolves.toMatchObject({ rootQuestionId: "new-weekly" });
  });

  it("mantém dez desafios e uma rotação independente por disciplina sem girar listas regulares", async () => {
    const { repository, service } = learningSetup();
    const catalog = repository.catalogs.get(ids.classId)!.catalog;
    for (const item of catalog.activities) { item.active = false; item.activatedAt = null; }
    catalog.activities.push(...catalog.activities.map((item) => ({ ...structuredClone(item), rootQuestionId: `history-${item.rootQuestionId}`,
      body: { ...item.body, subjectId: "historia" as const, skillCodes: ["EF06HI01"] } })));
    await service.registerActivity(teacher(), ids.classId, { rootQuestionId: "regular", body: question(1000), reviewed: true, contentVersion: 1, contentTitle: "Frações", contentId: "fractions" });
    const math = catalog.activities.filter((item) => item.body.subjectId === "matematica").slice(0, 10).map((item) => item.rootQuestionId);
    const history = catalog.activities.filter((item) => item.body.subjectId === "historia").slice(0, 10).map((item) => item.rootQuestionId);
    await service.activate(coordinator(), ids.classId, "matematica", math);
    await service.activate(coordinator(), ids.classId, "historia", history);
    const original = await service.openActivity(actor(), math[0]);
    await service.submitAttempt(actor(), { questionInstanceId: original.question.questionInstanceId, selectedOptionId: "a", idempotencyKey: "weekly-before-expiry" });
    const before = (await service.summary(actor(), ids.student, "2026-01-01", "2026-12-31")).summary;
    expect(before).toMatchObject({ xp: 100, rankPoints: 100 });
    const rotation = await service.rotate(coordinator(), ids.classId, "matematica", "2026-10-26", ["root-11", "root-12"]);
    expect(rotation.outgoingRootIds).toEqual(["root-01", "root-02"]);
    expect(await service.rotate(coordinator(), ids.classId, "matematica", "2026-10-26", ["root-12", "root-11"])).toEqual(rotation);
    const after = (await service.summary(actor(), ids.student, "2026-01-01", "2026-12-31")).summary;
    expect(after).toMatchObject({ xp: 0, rankPoints: 100 });
    const activities = (await service.listActivities(actor())).activities;
    expect(activities.filter((item) => item.activityType === "weekly_challenge" && item.subjectId === "matematica")).toHaveLength(10);
    expect(activities.filter((item) => item.activityType === "weekly_challenge" && item.subjectId === "historia")).toHaveLength(10);
    expect(activities.find((item) => item.rootQuestionId === "regular")).toMatchObject({ activityType: "exercise" });
    expect((await service.activityCatalog(coordinator(), ids.classId, "historia")).rotatedThisWeek).toBe(false);
  });

  it("calcula o progresso real de 200 entre 2.000 pontos sem aceitar totais do navegador", async () => {
    const { service } = learningSetup();
    for (let index = 0; index < 40; index++) {
      await service.registerActivity(teacher(), ids.classId, { rootQuestionId: `regular-${index}`, body: question(index + 1000), contentVersion: 1,
        reviewed: true, contentId: "fractions", contentTitle: "Frações" });
    }
    for (let index = 0; index < 4; index++) {
      const opened = await service.openActivity(actor(), `regular-${index}`);
      await service.submitAttempt(actor(), { questionInstanceId: opened.question.questionInstanceId, selectedOptionId: "a", idempotencyKey: `progress-answer-${index}` });
    }
    const progress = (await service.summary(actor(), ids.student, "2026-01-01", "2026-12-31")).subjectProgress;
    expect(progress).toEqual([{ subjectId: "matematica", earnedRankPoints: 200, availableRankPoints: 2000 }]);
    expect(progress[0].earnedRankPoints / progress[0].availableRankPoints * 100).toBe(10);
    const teacherOfAnotherSubject = { ...teacher(), teacherAssignments: [{ institutionId: ids.school, classId: ids.classId, subjectId: "historia" as const }] };
    expect((await service.summary(teacherOfAnotherSubject, ids.student, "2026-01-01", "2026-12-31")).subjectProgress).toEqual([]);
  });

  it("concede 35 por acerto de recuperação mesmo depois de dez erros, e encerra após dois acertos", async () => {
    const { repository, service } = learningSetup();
    const opened = await service.openActivity(actor(), "root-01");
    const wrong = await service.submitAttempt(actor(), { questionInstanceId: opened.question.questionInstanceId, selectedOptionId: "b", idempotencyKey: "ten-errors-original" });
    for (let index = 0; index < 9; index++) {
      const next = await service.nextRecovery(actor(), wrong.recoveryId!);
      await service.submitAttempt(actor(), { questionInstanceId: next!.question.questionInstanceId, selectedOptionId: "b", idempotencyKey: `ten-errors-${index}` });
    }
    for (let index = 0; index < 2; index++) {
      const next = await service.nextRecovery(actor(), wrong.recoveryId!);
      const result = await service.submitAttempt(actor(), { questionInstanceId: next!.question.questionInstanceId, selectedOptionId: "a", idempotencyKey: `recovery-correct-${index}` });
      expect(result.result).toMatchObject({ rankPointsAwarded: 35, xpAwarded: 0, consecutiveCorrect: index + 1 });
    }
    expect(repository.students.get(ids.student)!.state.recoveries[0].state.status).toBe("recovered");
    expect((await service.summary(actor(), ids.student, "2026-01-01", "2026-12-31")).summary).toMatchObject({ rankPoints: 70, xp: 0 });
  });

  it("bloqueia edição durante a publicação e retoma o mesmo snapshot após falha de transporte", async () => {
    const repository = new InMemoryContentRepository();
    const publisher = new InMemoryActivityPublisher();
    let fail = true;
    const service = new ContentService(repository, new InMemoryClassDirectory([{ id: ids.classId, institutionId: ids.school, name: "6A", grade: 6 }]),
      { extractQuestionsReport: async () => ({ questions: [question()], discarded: 0, issues: [] }) }, {
        delivery: "aprendizagem", registerActivity: async (...args) => {
          const result = await publisher.registerActivity(...args);
          if (fail) { fail = false; throw new Error("Simulated lost publication response"); }
          return result;
        },
      }, testNow);
    const { drafts: [draft] } = await service.importText(teacher(), { classId: ids.classId, subjectId: "matematica", contentTitle: "Frações", text: "Lista sintética com alternativas e gabarito do professor." });
    await service.updateDraft(teacher(), draft.id, { version: 1, reviewed: true, body: question() });
    await expect(service.publish(teacher(), draft.id)).rejects.toThrow("Simulated lost publication response");
    expect(await repository.get(ids.school, draft.id)).toMatchObject({ status: "publicando", version: 3 });
    await expect(service.updateDraft(teacher(), draft.id, { version: 3, reviewed: true, body: question(2) })).rejects.toMatchObject({ code: "ALREADY_PUBLISHED" });
    expect(await service.publish(teacher(), draft.id)).toMatchObject({ status: "publicada", version: 3 });
    expect(publisher.activities.size).toBe(1);
  });

  it("preserva a elegibilidade de XP de recuperações antigas quando o snapshot previa essa retenção", async () => {
    const { repository, service } = learningSetup();
    const opened = await service.openActivity(actor(), "root-01");
    repository.students.get(ids.student)!.state.instances[0].scoring = {
      originalPoints: 100, recoveryReference: "previous", recoveryCapPoints: null, adaptiveXpFollowsRoot: false,
    };
    const wrong = await service.submitAttempt(actor(), { questionInstanceId: opened.question.questionInstanceId, selectedOptionId: "b", idempotencyKey: "legacy-retained-original" });
    const next = await service.nextRecovery(actor(), wrong.recoveryId!);
    const result = await service.submitAttempt(actor(), { questionInstanceId: next!.question.questionInstanceId, selectedOptionId: "a", idempotencyKey: "legacy-retained-recovery" });
    expect(result.result).toMatchObject({ xpAwarded: 70, rankPointsAwarded: 70 });
    await service.rotate(coordinator(), ids.classId, "matematica", "2026-10-26", ["root-11", "root-12"]);
    expect((await service.summary(actor(), ids.student, "2026-01-01", "2026-12-31")).summary).toMatchObject({ xp: 70, rankPoints: 70 });
  });
});
