import { describe, expect, it, vi } from "vitest";
import { SupabaseRecognitionStore, SupabaseRosterReader, toStoreError } from "@/features/recognition/server/supabase-repository";

vi.mock("server-only", () => ({}));

type Result = { data: unknown; error: { code?: string; message?: string } | null };
type Call = { table?: string; rpc?: string; args?: unknown; steps: Array<[string, unknown[]]> };

function fakeClient(results: Result[]) {
  const calls: Call[] = [];
  const queue = [...results];
  const builder = (call: Call) => {
    const chain: Record<string, unknown> = {};
    for (const name of ["select", "eq", "in", "is", "order", "limit", "update", "maybeSingle"]) {
      chain[name] = (...args: unknown[]) => { call.steps.push([name, args]); return chain; };
    }
    chain.then = (resolve: (value: Result) => unknown, reject: (reason: unknown) => unknown) =>
      Promise.resolve(queue.shift() ?? { data: null, error: null }).then(resolve, reject);
    return chain;
  };
  const client = {
    from(table: string) { const call: Call = { table, steps: [] }; calls.push(call); return builder(call); },
    rpc(name: string, args: unknown) { const call: Call = { rpc: name, args, steps: [] }; calls.push(call); return builder(call); },
  };
  return { client: client as never, calls };
}

const SCHOOL = "11111111-1111-4111-8111-111111111111";
const TEACHER = "22222222-2222-4222-8222-222222222222";
const STUDENT = "33333333-3333-4333-8333-333333333333";
const CLASS = "44444444-4444-4444-8444-444444444444";

const row = {
  id: "55555555-5555-4555-8555-555555555555", school_id: SCHOOL, teacher_id: TEACHER, teacher_name: "Marta",
  classroom_id: CLASS, subject_id: "matematica", student_id: STUDENT, reason: "superacao", note: null, points: "20.00",
  school_year: 2026, award_day: "2026-10-31", idempotency_key: "key-00000001", created_at: "2026-10-31T14:00:00+00:00",
};

const grantInput = {
  recognition: {
    id: row.id, schoolId: SCHOOL, teacherId: TEACHER, teacherName: "Marta", classId: CLASS, subjectId: "matematica" as const,
    studentId: STUDENT, reason: "superacao" as const, note: null, points: 20, schoolYear: 2026, day: "2026-10-31",
    idempotencyKey: "key-00000001", createdAt: "2026-10-31T14:00:00.000Z",
  },
  dailyLimit: 3, guardianIds: ["66666666-6666-4666-8666-666666666666", "nao-uuid"],
  studentNotification: { title: "t", body: "b" }, guardianNotification: { title: "gt", body: "gb" },
};

describe("adapter Supabase de reconhecimento", () => {
  it("chama a RPC atômica com limite e responsáveis válidos", async () => {
    const { client, calls } = fakeClient([{ data: { status: "created", recognition: row }, error: null }]);
    const result = await new SupabaseRecognitionStore(client).grant(grantInput);
    expect(calls[0]!.rpc).toBe("recognition_grant");
    expect(calls[0]!.args).toMatchObject({ p_limit: 3, p_points: 20, p_day: "2026-10-31", p_guardian_ids: ["66666666-6666-4666-8666-666666666666"] });
    expect(result).toMatchObject({ status: "created", recognition: { points: 20, subjectId: "matematica", createdAt: "2026-10-31T14:00:00.000Z" } });
  });

  it("traduz limite e matrícula ausente", async () => {
    const limit = fakeClient([{ data: { status: "limit" }, error: null }]);
    expect(await new SupabaseRecognitionStore(limit.client).grant(grantInput)).toEqual({ status: "limit" });
    const missing = fakeClient([{ data: { status: "not_enrolled" }, error: null }]);
    expect(await new SupabaseRecognitionStore(missing.client).grant(grantInput)).toEqual({ status: "not_enrolled" });
  });

  it.each(["42P01", "PGRST205", "PGRST202", "42883"])("responde 503 claro quando falta a migração (%s)", async (code) => {
    const { client } = fakeClient([{ data: null, error: { code, message: "missing" } }]);
    await expect(new SupabaseRecognitionStore(client).listForUser(SCHOOL, STUDENT, 10)).rejects.toMatchObject({ status: 503, code: "STORE_UNAVAILABLE" });
  });

  it("outros erros do banco não vazam detalhes", () => {
    const error = toStoreError({ code: "XX000", message: "senha=segredo" });
    expect(error.code).toBe("STORE_ERROR");
    expect(error.message).not.toContain("segredo");
  });

  it("filtra por escola e ignora IDs fora do formato UUID sem consultar", async () => {
    const { client, calls } = fakeClient([{ data: [{ student_id: STUDENT }, { student_id: STUDENT }], error: null }]);
    const store = new SupabaseRecognitionStore(client);
    const counts = await store.countForDay(SCHOOL, TEACHER, "2026-10-31", [STUDENT, "student-x"]);
    expect(counts.get(STUDENT)).toBe(2);
    expect(calls[0]!.steps).toContainEqual(["eq", ["school_id", SCHOOL]]);
    expect(calls[0]!.steps).toContainEqual(["in", ["student_id", [STUDENT]]]);
    expect(await store.markRead(SCHOOL, STUDENT, "nao-uuid", "2026-10-31T15:00:00.000Z")).toBeNull();
    expect(calls).toHaveLength(1);
  });

  it("lê a turma ativa e os nomes dos alunos pelo roster", async () => {
    const { client, calls } = fakeClient([
      { data: [{ student_id: STUDENT }], error: null },
      { data: [{ id: STUDENT, full_name: "Ana Souza" }], error: null },
    ]);
    const students = await new SupabaseRosterReader(client).listActiveStudents(SCHOOL, CLASS);
    expect(students).toEqual([{ studentId: STUDENT, fullName: "Ana Souza" }]);
    expect(calls[0]!.steps).toContainEqual(["eq", ["status", "active"]]);
    expect(calls[1]!.steps).toContainEqual(["eq", ["school_id", SCHOOL]]);
  });
});
