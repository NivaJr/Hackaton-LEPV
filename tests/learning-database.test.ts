import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { LearningService } from "@/features/learning/server/service";
import { SupabaseLearningRepository } from "@/features/learning/server/supabase-repository";
import { actor, coordinator, fixtureIds as ids, question, testNow, testPolicy } from "./helpers/learning-memory";
import { createLearningDatabase, postgresRpcClient, queryAs, resetLearningDatabase } from "./helpers/learning-postgres";

let db: PGlite;
let repository: SupabaseLearningRepository;
let service: LearningService;
beforeAll(async () => { db = await createLearningDatabase(); }, 60_000);
afterAll(async () => { if (db) await db.close(); }, 60_000);
beforeEach(async () => {
  await resetLearningDatabase(db);
  repository = new SupabaseLearningRepository(postgresRpcClient(db));
  let sequence = 100;
  service = new LearningService(repository, { generateRecoveryQuestion: async () => question(sequence++) }, testPolicy, testNow);
});

describe.sequential("serviço + migrações reais em Postgres/WASM (Auth emulado)", () => {
  it("lê o nome atual da turma por escola e mantém a RPC inacessível ao navegador", async () => {
    expect((await service.listActivities(actor())).className).toBe("6A fictícia");
    await db.query("update public.classrooms set name = $1 where id = $2", ["6º A — Integral", ids.classId]);
    try { expect((await service.listActivities(actor())).className).toBe("6º A — Integral"); }
    finally { await db.query("update public.classrooms set name = $1 where id = $2", ["6A fictícia", ids.classId]); }
    await expect(repository.classroomName(ids.otherSchool, ids.classId)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(queryAs(db, "authenticated", ids.student, "select public.learning_classroom_name($1,$2)", [ids.school, ids.classId])).rejects.toMatchObject({ code: "42501" });
    await expect(queryAs(db, "anon", null, "select public.learning_classroom_name($1,$2)", [ids.school, ids.classId])).rejects.toMatchObject({ code: "42501" });
  });
  it("persiste recuperação e créditos atomicamente e permite retomar em outra instância do serviço", async () => {
    const original = await service.openActivity(actor(), "root-01");
    const first = await service.submitAttempt(actor(), { questionInstanceId: original.question.questionInstanceId, selectedOptionId: "b", idempotencyKey: "database-wrong" });
    for (let i = 0; i < 2; i++) {
      const next = await service.nextRecovery(actor(), first.recoveryId!);
      await service.submitAttempt(actor(), { questionInstanceId: next!.question.questionInstanceId, selectedOptionId: "a", idempotencyKey: `database-recovery-${i}` });
    }
    const fresh = new LearningService(new SupabaseLearningRepository(postgresRpcClient(db)), { generateRecoveryQuestion: async () => question(999) }, testPolicy, testNow);
    expect((await fresh.summary(actor(), ids.student, "2026-10-01", "2026-10-31")).summary).toMatchObject({ xp: 140, rankPoints: 140, correctAnswers: 2, incorrectAnswers: 1 });
    const counts = await db.query<{ attempts: number; credits: number }>("select (select count(*)::int from public.learning_attempts) attempts,(select count(*)::int from public.learning_point_ledger) credits");
    expect(counts.rows[0]).toEqual({ attempts: 3, credits: 6 });
    await expect(fresh.nextRecovery(actor(), first.recoveryId!)).rejects.toMatchObject({ code: "RECOVERY_CLOSED" });
  });

  it("o compare-and-swap recusa gravações com versão de aluno ou turma desatualizada", async () => {
    const before = await repository.loadStudent(ids.school, ids.student);
    const updated = structuredClone(before.state);
    updated.accessDays.push("2026-10-30");
    expect(await repository.commitStudent(before, updated)).toBe(true);
    expect(await repository.commitStudent(before, { ...updated, accessDays: ["2026-10-29"] })).toBe(false);
    const current = await repository.loadStudent(ids.school, ids.student);
    const catalog = await repository.loadCatalog(ids.school, ids.classId);
    catalog.catalog.activities[0].active = false;
    expect(await repository.commitCatalog(catalog, catalog.catalog)).toBe(true);
    expect(await repository.commitStudent(current, { ...current.state, accessDays: ["2026-10-30", "2026-10-31"] })).toBe(false);
  });

  it("um crédito inválido reverte também a tentativa e a recuperação na mesma transação", async () => {
    const opened = await service.openActivity(actor(), "root-01");
    const originalCommit = repository.commitStudent.bind(repository);
    const failure = vi.spyOn(repository, "commitStudent").mockImplementationOnce((before, state) => {
      state.ledger[state.ledger.length - 1].points = 999;
      return originalCommit(before, state);
    });
    await expect(service.submitAttempt(actor(), { questionInstanceId: opened.question.questionInstanceId, selectedOptionId: "b", idempotencyKey: "atomic-failure" })).rejects.toMatchObject({ code: "PERSISTENCE_UNAVAILABLE" });
    failure.mockRestore();
    const counts = await db.query<{ attempts: number; credits: number }>("select (select count(*)::int from public.learning_attempts) attempts,(select count(*)::int from public.learning_point_ledger) credits");
    expect(counts.rows[0]).toEqual({ attempts: 0, credits: 0 });
    expect((await repository.loadStudent(ids.school, ids.student)).state.recoveries).toHaveLength(0);
  });

  it("unicidade por aluno/instância e por tentativa/tipo impede duplicação mesmo com novo ID", async () => {
    const opened = await service.openActivity(actor(), "root-01");
    const submit = { questionInstanceId: opened.question.questionInstanceId, selectedOptionId: "a", idempotencyKey: "database-correct" };
    const result = await service.submitAttempt(actor(), submit);
    expect(await service.submitAttempt(actor(), { ...submit, idempotencyKey: "database-another-key" })).toEqual(result);
    await expect(db.query("insert into public.learning_attempts select $1::uuid,school_id,student_id,classroom_id,question_instance_id,root_question_id,subject_id,selected_option_id,'another-key',source,result,created_at from public.learning_attempts limit 1", [randomUUID()])).rejects.toMatchObject({ code: "23505" });
    await expect(db.query("insert into public.learning_point_ledger select $1::uuid,school_id,student_id,attempt_id,classroom_id,root_question_id,subject_id,school_year,kind,points,keep_after_rotation from public.learning_point_ledger limit 1", [randomUUID()])).rejects.toMatchObject({ code: "23505" });
  });

  it("não permite reescrever a questão de uma atribuição existente", async () => {
    await service.openActivity(actor(), "root-01");
    const loaded = await repository.loadStudent(ids.school, ids.student);
    const changed = structuredClone(loaded.state);
    changed.instances[0].question.statement = "Enunciado trocado depois da atribuição";
    await expect(repository.commitStudent(loaded, changed)).rejects.toMatchObject({ code: "PERSISTENCE_UNAVAILABLE" });
    expect((await repository.loadStudent(ids.school, ids.student)).state.instances[0].question.statement).toContain("Questão sintética de teste 1");
  });

  it("RPCs privilegiadas e snapshots privados são inacessíveis ao aluno e ao anônimo", async () => {
    await expect(queryAs(db, "authenticated", ids.student, "select public.learning_read_student($1,$2)", [ids.school,ids.student])).rejects.toMatchObject({ code: "42501" });
    await expect(queryAs(db, "authenticated", ids.student, "select * from app_private.learning_student_states")).rejects.toMatchObject({ code: "42501" });
    await expect(queryAs(db, "authenticated", ids.student, "select * from app_private.learning_catalogs")).rejects.toMatchObject({ code: "42501" });
    await expect(queryAs(db, "anon", null, "select * from public.learning_point_ledger")).rejects.toMatchObject({ code: "42501" });
    await expect(queryAs(db, "authenticated", ids.student, "insert into public.learning_point_ledger(id) values ($1)", [randomUUID()])).rejects.toMatchObject({ code: "42501" });
  });

  it("RLS exibe tentativa final e créditos somente ao dono", async () => {
    const opened = await service.openActivity(actor(), "root-01");
    await service.submitAttempt(actor(), { questionInstanceId: opened.question.questionInstanceId, selectedOptionId: "a", idempotencyKey: "private-answer" });
    const own = await queryAs<{ student_id: string }>(db, "authenticated", ids.student, "select student_id from public.learning_attempts");
    expect(own.rows).toEqual([{ student_id: ids.student }]);
    expect((await queryAs(db, "authenticated", "00000000-0000-4000-8000-000000000005", "select * from public.learning_attempts")).rows).toEqual([]);
    expect((await queryAs(db, "authenticated", ids.guardian, "select * from public.learning_point_ledger")).rows).toEqual([]);
  });

  it("rotação altera o ranking calculado no SQL sem excluir os pontos anuais", async () => {
    for (const root of ["root-01", "root-03"]) {
      const opened = await service.openActivity(actor(), root);
      await service.submitAttempt(actor(), { questionInstanceId: opened.question.questionInstanceId, selectedOptionId: "a", idempotencyKey: `database-${root}` });
    }
    await service.rotate(coordinator(), ids.classId, "matematica", "2026-10-26", ["root-11", "root-12"]);
    expect((await service.ranking(actor(), ids.classId)).top10[0]).toMatchObject({ xp: 100, rankPoints: 200 });
    const ledger = await db.query<{ total: number }>("select sum(points)::int as total from public.learning_point_ledger where kind = 'annual'");
    expect(ledger.rows[0].total).toBe(200);
  });

  it("a versão da ficha vem do trigger e não muda em reenvio idêntico", async () => {
    const first = await service.savePreferences(actor(), { interests: ["música"], context: "Orquestra" });
    expect(await service.savePreferences(actor(), { interests: ["música"], context: "Orquestra" })).toMatchObject({ version: first.version });
    expect(await service.savePreferences(actor(), { interests: ["leitura"], context: "Biblioteca" })).toMatchObject({ version: first.version + 1 });
  });
});
