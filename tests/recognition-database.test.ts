import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { SupabaseRecognitionStore } from "@/features/recognition/server/supabase-repository";
import type { GrantInput } from "@/features/recognition/ports";
import { RECOGNITION_DAILY_LIMIT, RECOGNITION_POINTS } from "@/features/recognition/model";
import { LearningService } from "@/features/learning/server/service";
import { SupabaseLearningRepository } from "@/features/learning/server/supabase-repository";
import { actor, fixtureIds as ids, question, testNow, testPolicy } from "./helpers/learning-memory";
import { createLearningDatabase, postgresRpcClient, queryAs, resetLearningDatabase } from "./helpers/learning-postgres";

vi.mock("server-only", () => ({}));

/**
 * Runs the real recognition migration on top of foundation + learning in Postgres/WASM.
 * Auth is emulated; this does not validate hosted Supabase or PostgREST.
 */
const otherStudent = "00000000-0000-4000-8000-000000000005";
const grantArgs: Array<[string, string]> = [
  ["p_id", "uuid"], ["p_school", "uuid"], ["p_teacher", "uuid"], ["p_teacher_name", "text"], ["p_class", "uuid"],
  ["p_subject", "text"], ["p_student", "uuid"], ["p_reason", "text"], ["p_note", "text"], ["p_points", "numeric"],
  ["p_school_year", "smallint"], ["p_day", "date"], ["p_key", "text"], ["p_created_at", "timestamptz"],
  ["p_limit", "integer"], ["p_guardian_ids", "uuid[]"], ["p_student_title", "text"], ["p_student_body", "text"],
  ["p_guardian_title", "text"], ["p_guardian_body", "text"],
];

let db: PGlite;
let store: SupabaseRecognitionStore;

/** Minimal rpc-only client: the adapter's argument names must match the SQL function exactly. */
function rpcClient(database: PGlite) {
  return { async rpc(name: string, args: Record<string, unknown>) {
    if (name !== "recognition_grant") throw new Error("Unknown fixture RPC");
    const unknownKeys = Object.keys(args).filter((key) => !grantArgs.some(([arg]) => arg === key));
    if (unknownKeys.length) throw new Error(`Argumentos sem par na RPC: ${unknownKeys.join(",")}`);
    const placeholders = grantArgs.map(([key, type], i) => `${key} => $${i + 1}::${type}`).join(",");
    try {
      const result = await queryAs<{ data: unknown }>(database, "service_role", null,
        `select public.recognition_grant(${placeholders}) as data`, grantArgs.map(([key]) => args[key]));
      return { data: result.rows[0]?.data, error: null };
    } catch (error) {
      const failure = error as { code?: string; message: string };
      return { data: null, error: { code: failure.code, message: failure.message } };
    }
  } };
}

function grantInput(overrides: { key?: string; createdAt?: string; studentId?: string } = {}): GrantInput {
  const createdAt = overrides.createdAt ?? "2026-10-31T12:00:00.000Z";
  return {
    recognition: {
      id: randomUUID(), schoolId: ids.school, teacherId: ids.teacher, teacherName: "Professor fictício",
      classId: ids.classId, subjectId: "matematica", studentId: overrides.studentId ?? ids.student,
      reason: "ajudou_turma", note: null, points: RECOGNITION_POINTS, schoolYear: 2026,
      day: createdAt.slice(0, 10), idempotencyKey: overrides.key ?? `chave-${randomUUID()}`, createdAt,
    },
    dailyLimit: RECOGNITION_DAILY_LIMIT, guardianIds: [ids.guardian],
    studentNotification: { title: "Você recebeu um elogio", body: "Ajudou a turma." },
    guardianNotification: { title: "Elogio para Aluno", body: "Ajudou a turma." },
  };
}

beforeAll(async () => {
  db = await createLearningDatabase();
  await db.exec(await readFile(resolve(process.cwd(), "supabase/migrations/20261031060000_recognition.sql"), "utf8"));
}, 120_000);
afterAll(async () => { if (db) await db.close(); }, 60_000);
beforeEach(async () => {
  await db.exec("delete from public.learning_point_ledger; delete from public.notifications; delete from public.teacher_recognitions;");
  await resetLearningDatabase(db);
  store = new SupabaseRecognitionStore(rpcClient(db) as never);
});

describe.sequential("migração de reconhecimentos em Postgres/WASM (Auth emulado)", () => {
  it("concede o elogio e grava crédito anual e um aviso por destinatário", async () => {
    const result = await store.grant(grantInput());
    expect(result).toMatchObject({ status: "created", recognition: { points: 20, studentId: ids.student, day: "2026-10-31", schoolYear: 2026 } });
    const ledger = await db.query("select kind, points::int, source, attempt_id, root_question_id, keep_after_rotation from public.learning_point_ledger");
    expect(ledger.rows).toEqual([{ kind: "annual", points: 20, source: "recognition", attempt_id: null, root_question_id: null, keep_after_rotation: true }]);
    const notes = await db.query<{ user_id: string }>("select user_id from public.notifications order by user_id");
    expect(notes.rows.map((row) => row.user_id).sort()).toEqual([ids.student, ids.guardian].sort());
  });

  it("recusa o quarto elogio do mesmo professor ao mesmo aluno no mesmo dia de São Paulo", async () => {
    for (let i = 0; i < 3; i++) expect((await store.grant(grantInput())).status).toBe("created");
    expect(await store.grant(grantInput())).toEqual({ status: "limit" });
    // 02:00 UTC de 1/11 ainda é 31/10 em São Paulo.
    await expect(store.grant(grantInput({ createdAt: "2026-11-01T02:00:00.000Z" }))).rejects.toMatchObject({ code: "STORE_ERROR" });
    const next = grantInput({ createdAt: "2026-11-01T12:00:00.000Z" });
    expect((await store.grant(next)).status).toBe("created");
    const total = await db.query<{ n: number }>("select count(*)::int n from public.learning_point_ledger where source = 'recognition'");
    expect(total.rows[0].n).toBe(4);
  });

  it("repetir a mesma chave devolve duplicate sem novo crédito nem aviso", async () => {
    const first = await store.grant(grantInput({ key: "toque-duplo-1" }));
    const replay = await store.grant(grantInput({ key: "toque-duplo-1" }));
    expect(replay.status).toBe("duplicate");
    if (first.status !== "created" || replay.status !== "duplicate") throw new Error("unexpected");
    expect(replay.recognition.id).toBe(first.recognition.id);
    const counts = await db.query<{ r: number; n: number; l: number }>(
      "select (select count(*)::int from public.teacher_recognitions) r,(select count(*)::int from public.notifications) n,(select count(*)::int from public.learning_point_ledger) l");
    expect(counts.rows[0]).toEqual({ r: 1, n: 2, l: 1 });
  });

  it("aluno fora da turma recebe not_enrolled e o crédito não aceita forma inválida", async () => {
    expect(await store.grant(grantInput({ studentId: otherStudent }))).toEqual({ status: "not_enrolled" });
    await expect(db.query(`insert into public.learning_point_ledger(id,school_id,student_id,classroom_id,subject_id,school_year,kind,points,keep_after_rotation,source)
      values ($1,$2,$3,$4,'matematica',2026,'annual',20,true,'attempt')`, [randomUUID(), ids.school, ids.student, ids.classId])).rejects.toMatchObject({ code: "23514" });
  });

  it("o ranking da turma ignora pontos de elogio e as tentativas continuam gravando", async () => {
    const learning = new LearningService(new SupabaseLearningRepository(postgresRpcClient(db)), { generateRecoveryQuestion: async () => question(500) }, testPolicy, testNow);
    const opened = await learning.openActivity(actor(), "root-01");
    await learning.submitAttempt(actor(), { questionInstanceId: opened.question.questionInstanceId, selectedOptionId: "a", idempotencyKey: "ranking-attempt" });
    await store.grant(grantInput());
    await store.grant(grantInput());
    const ranking = await db.query<{ data: Array<{ studentId: string; xp: number; rankPoints: number }> }>(
      "select public.learning_class_ranking($1,$2) as data", [ids.school, ids.classId]);
    expect(ranking.rows[0].data).toEqual([expect.objectContaining({ studentId: ids.student, xp: 100, rankPoints: 100 })]);
    const annual = await db.query<{ source: string; total: number }>(
      "select source, sum(points)::int total from public.learning_point_ledger where kind = 'annual' group by source order by source");
    expect(annual.rows).toEqual([{ source: "attempt", total: 100 }, { source: "recognition", total: 40 }]);
  });

  it("RLS: cada um lê só as próprias notificações e o professor só a própria turma/matéria", async () => {
    await store.grant(grantInput());
    const own = await queryAs<{ user_id: string }>(db, "authenticated", ids.student, "select user_id from public.notifications");
    expect(own.rows).toEqual([{ user_id: ids.student }]);
    expect((await queryAs(db, "authenticated", otherStudent, "select * from public.notifications")).rows).toEqual([]);
    expect((await queryAs(db, "authenticated", otherStudent, "select * from public.teacher_recognitions")).rows).toEqual([]);
    const guardian = await queryAs<{ user_id: string }>(db, "authenticated", ids.guardian, "select user_id from public.notifications");
    expect(guardian.rows).toEqual([{ user_id: ids.guardian }]);
    expect((await queryAs(db, "authenticated", ids.guardian, "select id from public.teacher_recognitions")).rows).toHaveLength(1);
    expect((await queryAs(db, "authenticated", ids.teacher, "select id from public.teacher_recognitions")).rows).toHaveLength(1);
    expect((await queryAs(db, "authenticated", ids.coordinator, "select id from public.teacher_recognitions")).rows).toHaveLength(1);
    await db.exec(`update public.teacher_assignments set subject_id = 'portugues' where teacher_id = '${ids.teacher}'`);
    try {
      expect((await queryAs(db, "authenticated", ids.teacher, "select id from public.teacher_recognitions")).rows).toEqual([]);
    } finally {
      await db.exec(`update public.teacher_assignments set subject_id = 'matematica' where teacher_id = '${ids.teacher}'`);
    }
    await expect(queryAs(db, "authenticated", ids.teacher, "select public.recognition_grant(null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null)"))
      .rejects.toMatchObject({ code: "42501" });
    await expect(queryAs(db, "authenticated", ids.student, "insert into public.notifications(school_id,user_id,student_id,kind,recognition_id,title,body) select school_id,user_id,student_id,kind,recognition_id,'x','y' from public.notifications"))
      .rejects.toMatchObject({ code: "42501" });
  });
});
