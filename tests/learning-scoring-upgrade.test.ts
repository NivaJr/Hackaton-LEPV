import type { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LearningService } from "@/features/learning/server/service";
import type { LearningState } from "@/features/learning/server/model";
import { SupabaseLearningRepository } from "@/features/learning/server/supabase-repository";
import { MemoryLearningRepository, actor, fixtureIds as ids, question, testNow, testPolicy } from "./helpers/learning-memory";
import { createLearningDatabase, postgresRpcClient, resetLearningDatabase } from "./helpers/learning-postgres";

const migration = "20261031150000_learning_scoring_confirmed.sql";
let db: PGlite;
let repository: SupabaseLearningRepository;
let service: LearningService;
let legacy: LearningState;
let pendingId: string;
let pendingRecoveryId: string;

beforeEach(async () => {
  db = await createLearningDatabase({ beforeMigration: migration });
  await resetLearningDatabase(db);
  const memory = new MemoryLearningRepository();
  let sequence = 100;
  const ai = { generateRecoveryQuestion: async () => question(sequence++) };
  const fixture = new LearningService(memory, ai, { ...testPolicy, recoveryReference: "previous" }, testNow);
  const first = await fixture.openActivity(actor(), "root-01");
  const wrong = await fixture.submitAttempt(actor(), { questionInstanceId: first.question.questionInstanceId, selectedOptionId: "b", idempotencyKey: "legacy-original-wrong" });
  for (let i = 0; i < 2; i++) {
    const next = await fixture.nextRecovery(actor(), wrong.recoveryId!);
    await fixture.submitAttempt(actor(), { questionInstanceId: next!.question.questionInstanceId, selectedOptionId: "a", idempotencyKey: `legacy-recovery-${i}` });
  }
  const second = await fixture.openActivity(actor(), "root-02");
  const anotherWrong = await fixture.submitAttempt(actor(), { questionInstanceId: second.question.questionInstanceId, selectedOptionId: "b", idempotencyKey: "legacy-second-wrong" });
  pendingRecoveryId = anotherWrong.recoveryId!;
  pendingId = (await fixture.nextRecovery(actor(), pendingRecoveryId))!.question.questionInstanceId;
  legacy = structuredClone((await memory.loadStudent(ids.school, ids.student)).state);
  // Reproduce credits and immutable question snapshots accepted by the production policy before this migration.
  const recoveryAttempts = legacy.attempts.filter((attempt) => attempt.source === "recovery");
  for (const [index, attempt] of recoveryAttempts.entries()) {
    const points = index === 0 ? 70 : 49;
    attempt.result.rankPointsAwarded = points;
    attempt.result.xpAwarded = points;
    legacy.instances.find((instance) => instance.question.questionInstanceId === attempt.result.questionInstanceId)!.nominalPoints = points;
    for (const credit of legacy.ledger.filter((credit) => credit.attemptId === attempt.result.attemptId)) credit.points = points;
  }
  legacy.instances.find((instance) => instance.question.questionInstanceId === pendingId)!.nominalPoints = 70;
  repository = new SupabaseLearningRepository(postgresRpcClient(db));
  expect(await repository.commitStudent(await repository.loadStudent(ids.school, ids.student), legacy)).toBe(true);
  await db.exec(await readFile(resolve("supabase/migrations", migration), "utf8"));
  service = new LearningService(repository, ai, testPolicy, testNow);
}, 60_000);

afterEach(async () => { vi.restoreAllMocks(); if (db) await db.close(); }, 60_000);

describe("transição da pontuação com histórico já persistido", () => {
  it("preserva os créditos antigos de 70/49 e permite novas gravações", async () => {
    await service.openActivity(actor(), "root-03");
    const current = (await repository.loadStudent(ids.school, ids.student)).state;
    expect(current.attempts).toEqual(legacy.attempts);
    expect(current.ledger).toEqual(legacy.ledger);
    expect((await service.summary(actor(), ids.student, "2026-10-01", "2026-10-31")).summary).toMatchObject({ rankPoints: 119, xp: 119 });
  });

  it("paga 35 pontos e 0 XP ao responder uma recuperação emitida antes da migração", async () => {
    expect((await service.nextRecovery(actor(), pendingRecoveryId))!.question.questionInstanceId).toBe(pendingId);
    const input = { questionInstanceId: pendingId, selectedOptionId: "a", idempotencyKey: "resume-legacy-recovery" };
    const answer = await service.submitAttempt(actor(), input);
    expect(answer.result).toMatchObject({ isCorrect: true, rankPointsAwarded: 35, xpAwarded: 0 });
    expect(await service.submitAttempt(actor(), input)).toEqual(answer);
    const current = (await repository.loadStudent(ids.school, ids.student)).state;
    expect(current.instances.find((instance) => instance.question.questionInstanceId === pendingId)!.nominalPoints).toBe(70);
    expect(current.ledger.filter((credit) => credit.attemptId === answer.result.attemptId).map(({ kind, points }) => ({ kind, points })))
      .toEqual([{ kind: "xp", points: 0 }, { kind: "annual", points: 35 }]);
    expect((await service.summary(actor(), ids.student, "2026-10-01", "2026-10-31")).summary).toMatchObject({ rankPoints: 154, xp: 119 });
  });

  it("recusa um novo crédito de 70 mesmo quando a instância antiga tinha esse valor nominal", async () => {
    const commit = repository.commitStudent.bind(repository);
    vi.spyOn(repository, "commitStudent").mockImplementationOnce((before, state) => {
      const attempt = state.attempts.at(-1)!;
      attempt.result.rankPointsAwarded = 70;
      attempt.result.xpAwarded = 70;
      for (const credit of state.ledger.filter((credit) => credit.attemptId === attempt.result.attemptId)) credit.points = 70;
      return commit(before, state);
    });
    await expect(service.submitAttempt(actor(), { questionInstanceId: pendingId, selectedOptionId: "a", idempotencyKey: "forged-legacy-award" }))
      .rejects.toMatchObject({ code: "PERSISTENCE_UNAVAILABLE" });
    expect((await repository.loadStudent(ids.school, ids.student)).state).toEqual(legacy);
  });

  it("continua impedindo a alteração retroativa de uma tentativa antiga", async () => {
    const loaded = await repository.loadStudent(ids.school, ids.student);
    const changed = structuredClone(loaded.state);
    changed.attempts.find((attempt) => attempt.source === "recovery")!.result.rankPointsAwarded = 999;
    await expect(repository.commitStudent(loaded, changed)).rejects.toMatchObject({ code: "PERSISTENCE_UNAVAILABLE" });
    expect((await repository.loadStudent(ids.school, ids.student)).state).toEqual(legacy);
  });
});
