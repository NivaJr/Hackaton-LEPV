import { readFile } from "node:fs/promises";
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ContentService } from "@/features/content/service";
import { InMemoryClassDirectory } from "@/features/content/memory";
import { SupabaseContentRepository } from "@/features/content/server/supabase-repository";
import { LearningActivityPublisher } from "@/features/content/server/learning-publisher";
import { LearningService } from "@/features/learning/server/service";
import { SupabaseLearningRepository } from "@/features/learning/server/supabase-repository";
import { contentPostgresClient } from "./helpers/content-postgres";
import { actor, coordinator, fixtureIds as ids, question, teacher, testNow, testPolicy } from "./helpers/learning-memory";
import { createLearningDatabase, HANDOFF_MIGRATION, postgresRpcClient, queryAs, resetLearningDatabase } from "./helpers/learning-postgres";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: vi.fn() }));
let db: PGlite;
let learning: LearningService;
let teacherRepository: SupabaseContentRepository;
let content: ContentService;
const scope = { classId: ids.classId, subjectId: "matematica" as const };

beforeAll(async () => { db = await createLearningDatabase(); }, 60_000);
afterAll(async () => { await db?.close(); }, 60_000);
beforeEach(async () => {
  await db.exec("truncate public.content_questions,storage.objects");
  await resetLearningDatabase(db);
  let sequence = 200;
  learning = new LearningService(new SupabaseLearningRepository(postgresRpcClient(db)), {
    generateRecoveryQuestion: async () => question(sequence++),
  }, testPolicy, testNow, async (_school, _class, subject) => subject === "matematica");
  teacherRepository = new SupabaseContentRepository(async () => contentPostgresClient(db, ids.teacher));
  content = new ContentService(teacherRepository, new InMemoryClassDirectory([
    { id: ids.classId, institutionId: ids.school, name: "6A", grade: 6 },
  ]), { extractQuestionsReport: async () => ({ questions: [question()], discarded: 0, issues: [] }) }, new LearningActivityPublisher(() => learning), testNow);
});

async function publishRegular() {
  const { drafts: [draft] } = await content.importText(teacher(), { ...scope, contentTitle: "Frações", text: "Lista sintética de matemática com alternativas e gabarito." });
  const saved = await content.updateDraft(teacher(), draft.id, { version: draft.version, reviewed: true, body: question() });
  return { draft, saved, published: await content.publish(teacher(), draft.id) };
}

describe.sequential("handoff do aluno: serviço, transporte Supabase e PostgreSQL real (Auth emulado)", () => {
  it("persiste o conteúdo revisado e entrega um exercício sem gabarito que vale 50 patente e 0 XP", async () => {
    const { published } = await publishRegular();
    const anotherProcess = new SupabaseContentRepository(async () => contentPostgresClient(db, ids.teacher));
    expect(await anotherProcess.get(ids.school, published.id)).toEqual(published);
    const list = await learning.listActivities(actor());
    expect(list.activities.find((item) => item.rootQuestionId === published.id)).toMatchObject({
      activityType: "exercise", contentTitle: "Frações", contentId: published.contentId, contentDefinedBy: "teacher",
    });
    expect(JSON.stringify(list)).not.toContain("correctOptionId");
    const opened = await learning.openActivity(actor(), published.id);
    expect(opened.question).not.toHaveProperty("correctOptionId");
    const result = await learning.submitAttempt(actor(), { questionInstanceId: opened.question.questionInstanceId, selectedOptionId: "a", idempotencyKey: "published-regular-answer" });
    expect(result.result).toMatchObject({ rankPointsAwarded: 50, xpAwarded: 0 });
    expect((await learning.summary(actor(), ids.student, "2026-01-01", "2026-12-31")).subjectProgress)
      .toEqual([{ subjectId: "matematica", earnedRankPoints: 50, availableRankPoints: 50 }]);
  });

  it("não expõe os rascunhos ou gabaritos ao aluno, responsável, outra turma ou outra escola", async () => {
    const { published } = await publishRegular();
    for (const userId of [ids.student, ids.guardian, "00000000-0000-4000-8000-000000000005"]) {
      const repository = new SupabaseContentRepository(async () => contentPostgresClient(db, userId));
      expect(await repository.get(ids.school, published.id)).toBeNull();
      expect(await repository.list({ institutionId: ids.school, ...scope })).toEqual([]);
    }
    expect(await teacherRepository.get(ids.otherSchool, published.id)).toBeNull();
    await expect(queryAs(db, "anon", null, "select * from public.content_questions")).rejects.toMatchObject({ code: "42501" });
  });

  it("recusa coordenação na disciplina atribuída e permite a disciplina sem professor", async () => {
    const coordinatorRepository = new SupabaseContentRepository(async () => contentPostgresClient(db, ids.coordinator));
    const { draft } = await publishRegular();
    expect(await coordinatorRepository.get(ids.school, draft.id)).toBeNull();
    const unassigned = { ...draft, id: "unassigned-content", rootQuestionId: "unassigned-content", status: "rascunho" as const,
      createdBy: ids.coordinator, contentDefinedBy: "coordinator" as const, body: { ...question(), subjectId: "historia" as const, skillCodes: ["EF06HI01"] } };
    await coordinatorRepository.insert([unassigned]);
    expect(await coordinatorRepository.get(ids.school, unassigned.id)).toMatchObject({ id: unassigned.id });
    await expect(coordinatorRepository.insert([{ ...unassigned, id: "forbidden-math", body: question() }])).rejects.toMatchObject({ code: "CONTENT_FORBIDDEN" });
  });

  it("protege o original no bucket privado por escola, turma e disciplina", async () => {
    const path = `${ids.school}/${ids.classId}/matematica/fixture.pdf`;
    await queryAs(db, "authenticated", ids.teacher, "insert into storage.objects(bucket_id,name) values ('teaching-sources',$1)", [path]);
    expect((await queryAs(db, "authenticated", ids.teacher, "select name from storage.objects")).rows).toEqual([{ name: path }]);
    for (const userId of [ids.student, ids.guardian, ids.coordinator]) {
      expect((await queryAs(db, "authenticated", userId, "select name from storage.objects")).rows).toEqual([]);
      await expect(queryAs(db, "authenticated", userId, "insert into storage.objects(bucket_id,name) values ('teaching-sources',$1)", [path])).rejects.toMatchObject({ code: "42501" });
    }
    expect((await db.query<{ public: boolean }>("select public from storage.buckets where id='teaching-sources'")).rows[0].public).toBe(false);
  });

  it("fecha o caminho direto e privilegiado para interesses fora da lista aprovada", async () => {
    for (const interests of [["conteúdo arbitrário"], ["futebol", "violência"]]) {
      await expect(queryAs(db, "authenticated", ids.student, "update public.student_preferences set interests=$1 where student_id=$2", [interests, ids.student]))
        .rejects.toMatchObject({ code: "23514" });
      await expect(queryAs(db, "service_role", null, "select public.learning_save_preferences($1,$2,$3::jsonb)", [ids.school, ids.student, JSON.stringify({ interests, context: "" })]))
        .rejects.toMatchObject({ code: "23514" });
    }
    await expect(learning.savePreferences(actor(), { interests: ["xadrez"], context: "Aprender com exemplos." })).resolves.toMatchObject({ interests: ["xadrez"] });
  });

  it("valida CAS e impede alterar ou apagar uma versão já publicada", async () => {
    const { draft, published } = await publishRegular();
    expect(await teacherRepository.replace({ ...draft, version: 2 }, 1)).toBe(false);
    await expect(teacherRepository.replace({ ...published, body: { ...published.body, statement: "Alteração indevida" } }, published.version))
      .rejects.toMatchObject({ code: "CONTENT_PERSISTENCE_UNAVAILABLE" });
    expect(await teacherRepository.remove(ids.school, published.id, published.version)).toBe(false);
  });
});

it("faz backfill seguro sem alterar uma instância antiga ainda sem resposta", async () => {
  const legacyDb = await createLearningDatabase(false);
  try {
    await resetLearningDatabase(legacyDb);
    const repository = new SupabaseLearningRepository(postgresRpcClient(legacyDb));
    const service = new LearningService(repository, { generateRecoveryQuestion: async () => question(500) }, testPolicy, testNow);
    const opened = await service.openActivity(actor(), "root-01");
    const loaded = await repository.loadStudent(ids.school, ids.student);
    loaded.state.instances[0].scoring = testPolicy;
    loaded.state.instances[0].nominalPoints = 100;
    delete loaded.state.instances[0].activityType;
    await legacyDb.query("update app_private.learning_student_states set payload=$1::jsonb where student_id=$2", [JSON.stringify(loaded.state), ids.student]);
    await legacyDb.exec("update app_private.learning_catalogs set payload=jsonb_set(payload,'{activities}',(select jsonb_agg(a - 'activityType') from jsonb_array_elements(payload->'activities') a))");
    await legacyDb.exec(await readFile(HANDOFF_MIGRATION, "utf8"));
    const result = await service.submitAttempt(actor(), { questionInstanceId: opened.question.questionInstanceId, selectedOptionId: "a", idempotencyKey: "legacy-pending-after-upgrade" });
    expect(result.result).toMatchObject({ rankPointsAwarded: 100, xpAwarded: 100 });
    const next = await service.openActivity(actor(), "root-02");
    const confirmed = await service.submitAttempt(actor(), { questionInstanceId: next.question.questionInstanceId, selectedOptionId: "a", idempotencyKey: "new-regular-after-upgrade" });
    expect(confirmed.result).toMatchObject({ rankPointsAwarded: 50, xpAwarded: 0 });
    expect((await repository.loadStudent(ids.school, ids.student)).state.attempts).toHaveLength(2);
  } finally { await legacyDb.close(); }
}, 60_000);
