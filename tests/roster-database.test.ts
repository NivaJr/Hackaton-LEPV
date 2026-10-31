import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Exercises, on the real migration, the exact SQL shapes used by the Supabase adapters of
 * roster and family. Auth is emulated; this does not validate hosted Supabase or PostgREST.
 */
const ids = {
  school: "11111111-1111-4111-8111-111111111111",
  otherSchool: "22222222-2222-4222-8222-222222222222",
  coordinator: "00000000-0000-4000-8000-000000000001",
  otherCoordinator: "00000000-0000-4000-8000-000000000002",
  teacher: "00000000-0000-4000-8000-000000000003",
  student: "00000000-0000-4000-8000-000000000004",
  guardian: "00000000-0000-4000-8000-000000000005",
  classA: "10000000-0000-4000-8000-000000000001",
  classB: "10000000-0000-4000-8000-000000000002",
  otherClass: "10000000-0000-4000-8000-000000000003",
} as const;

let db: PGlite;

async function as<T>(userId: string, run: () => Promise<T>): Promise<T> {
  await db.exec("begin");
  try {
    await db.exec("set local role authenticated");
    await db.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: userId })]);
    return await run();
  } finally {
    await db.exec("rollback");
  }
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
    create schema auth;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$
      select (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid;
    $$;
    grant usage on schema public to anon, authenticated, service_role;
    grant usage on schema auth to authenticated, service_role;
    grant execute on function auth.uid() to authenticated, service_role;
  `);
  await db.exec(await readFile(resolve(process.cwd(), "supabase/migrations/20261030220000_foundation.sql"), "utf8"));
  await db.exec(await readFile(resolve(process.cwd(), "supabase/seed.sql"), "utf8"));
  await db.exec(`
    insert into public.schools (id, name) values ('${ids.otherSchool}', 'Outra escola fictícia');
    insert into auth.users (id) values ('${ids.coordinator}'), ('${ids.otherCoordinator}'), ('${ids.teacher}'), ('${ids.student}'), ('${ids.guardian}');
    insert into public.profiles (id, school_id, full_name) values
      ('${ids.coordinator}', '${ids.school}', 'Coordenação fictícia'), ('${ids.otherCoordinator}', '${ids.otherSchool}', 'Outra coordenação'),
      ('${ids.teacher}', '${ids.school}', 'Professor fictício'), ('${ids.student}', '${ids.school}', 'Aluno fictício'), ('${ids.guardian}', '${ids.school}', 'Responsável fictício');
    insert into public.user_roles (user_id, school_id, role) values
      ('${ids.coordinator}', '${ids.school}', 'coordenador'), ('${ids.otherCoordinator}', '${ids.otherSchool}', 'coordenador'),
      ('${ids.teacher}', '${ids.school}', 'professor'), ('${ids.student}', '${ids.school}', 'aluno'), ('${ids.guardian}', '${ids.school}', 'responsavel');
    insert into public.classrooms (id, school_id, name, grade, school_year) values
      ('${ids.classA}', '${ids.school}', '6A', 6, 2026), ('${ids.classB}', '${ids.school}', '7B', 7, 2026), ('${ids.otherClass}', '${ids.otherSchool}', '6A', 6, 2026);
    insert into public.enrollments (school_id, classroom_id, student_id) values ('${ids.school}', '${ids.classA}', '${ids.student}');
    insert into public.guardian_links (school_id, guardian_id, student_id, status) values ('${ids.school}', '${ids.guardian}', '${ids.student}', 'confirmed');
  `);
}, 60_000);

afterAll(async () => {
  if (db) await db.close();
}, 60_000);

const insertClassroom = (schoolId: string) => db.query(
  "insert into public.classrooms (school_id, name, grade, school_year) values ($1, 'Nova', 8, 2026) returning id", [schoolId],
);

describe.sequential("gestão sobre a migração real", () => {
  it("coordenador cria, renomeia e exclui turma; outros papéis e escolas não", async () => {
    await as(ids.coordinator, async () => {
      const created = await insertClassroom(ids.school);
      const id = (created.rows[0] as { id: string }).id;
      const renamed = await db.query("update public.classrooms set name = 'Renomeada' where school_id = $1 and id = $2 returning id", [ids.school, id]);
      expect(renamed.rows).toHaveLength(1);
      const removed = await db.query("delete from public.classrooms where school_id = $1 and id = $2 returning id", [ids.school, id]);
      expect(removed.rows).toHaveLength(1);
    });
    await expect(as(ids.coordinator, () => insertClassroom(ids.otherSchool))).rejects.toMatchObject({ code: "42501" });
    await expect(as(ids.teacher, () => insertClassroom(ids.school))).rejects.toMatchObject({ code: "42501" });
    await as(ids.otherCoordinator, async () => {
      const other = await db.query("update public.classrooms set name = 'x' where id = $1 returning id", [ids.classA]);
      expect(other.rows).toEqual([]);
    });
  });

  it("transferência fecha e recria, e o índice barra duas matrículas ativas", async () => {
    await as(ids.coordinator, async () => {
      const active = await db.query<{ id: string }>("select id from public.enrollments where student_id = $1 and status = 'active'", [ids.student]);
      await expect(db.query("savepoint s").then(() => db.query(
        "insert into public.enrollments (school_id, classroom_id, student_id) values ($1, $2, $3)", [ids.school, ids.classB, ids.student],
      ))).rejects.toMatchObject({ code: "23505" });
      await db.query("rollback to savepoint s");
      const closed = await db.query(
        "update public.enrollments set status = 'transferred', ended_at = now() where school_id = $1 and id = $2 and status = 'active' returning id",
        [ids.school, active.rows[0].id],
      );
      expect(closed.rows).toHaveLength(1);
      const moved = await db.query<{ classroom_id: string }>(
        "insert into public.enrollments (school_id, classroom_id, student_id) values ($1, $2, $3) returning classroom_id", [ids.school, ids.classB, ids.student],
      );
      expect(moved.rows).toEqual([{ classroom_id: ids.classB }]);
    });
  });

  it("a restauração de matrícula encerrada é aceita pelos grants e constraints", async () => {
    await as(ids.coordinator, async () => {
      const closed = await db.query<{ id: string }>(
        "update public.enrollments set status = 'transferred', ended_at = now() where student_id = $1 and status = 'active' returning id", [ids.student],
      );
      const restored = await db.query<{ status: string; ended_at: string | null }>(
        "update public.enrollments set status = 'active', ended_at = null where school_id = $1 and id = $2 returning status, ended_at", [ids.school, closed.rows[0].id],
      );
      expect(restored.rows).toEqual([{ status: "active", ended_at: null }]);
    });
  });

  it("atribuição exige papel de professor e pessoa da mesma escola", async () => {
    const assign = (teacherId: string, classroomId: string) => db.query(
      "insert into public.teacher_assignments (school_id, classroom_id, teacher_id, subject_id) values ($1, $2, $3, 'matematica') returning id",
      [ids.school, classroomId, teacherId],
    );
    await as(ids.coordinator, async () => {
      const created = await assign(ids.teacher, ids.classA);
      expect(created.rows).toHaveLength(1);
    });
    await expect(as(ids.coordinator, () => assign(ids.student, ids.classA))).rejects.toMatchObject({ code: "23514" });
    await expect(as(ids.coordinator, () => assign(ids.teacher, ids.otherClass))).rejects.toMatchObject({ code: "23503" });
  });

  it("coordenador não provisiona identidade pelo próprio cliente", async () => {
    await expect(as(ids.coordinator, () => db.query(
      "insert into public.user_roles (user_id, school_id, role) values ($1, $2, 'professor')", [ids.student, ids.school],
    ))).rejects.toMatchObject({ code: "42501" });
  });

  it("responsável grava saúde com inserção seguida de atualização só de details", async () => {
    await as(ids.guardian, async () => {
      const missing = await db.query("update public.student_health set details = 'a' where school_id = $1 and student_id = $2 returning details", [ids.school, ids.student]);
      expect(missing.rows).toEqual([]);
      const inserted = await db.query<{ details: string }>(
        "insert into public.student_health (school_id, student_id, details) values ($1, $2, 'Registro fictício') returning details", [ids.school, ids.student],
      );
      expect(inserted.rows).toEqual([{ details: "Registro fictício" }]);
      const updated = await db.query<{ updated_by: string }>(
        "update public.student_health set details = 'Novo registro' where school_id = $1 and student_id = $2 returning updated_by", [ids.school, ids.student],
      );
      expect(updated.rows).toEqual([{ updated_by: ids.guardian }]);
    });
  });

  it("upsert genérico seria negado, o que justifica o caminho do adaptador", async () => {
    await expect(as(ids.guardian, () => db.query(
      `insert into public.student_support (school_id, student_id, details) values ($1, $2, 'x')
       on conflict (student_id) do update set school_id = excluded.school_id, details = excluded.details`, [ids.school, ids.student],
    ))).rejects.toMatchObject({ code: "42501" });
  });

  it("responsável lê o filho e a turma, mas não edita histórico nem interesses", async () => {
    await as(ids.guardian, async () => {
      const joined = await db.query<{ name: string }>(
        `select c.name from public.enrollments e join public.classrooms c on c.id = e.classroom_id
         where e.student_id = $1 and e.status = 'active'`, [ids.student],
      );
      expect(joined.rows).toEqual([{ name: "6A" }]);
      const prefs = await db.query("select student_id from public.student_preferences");
      expect(prefs.rows).toEqual([]);
    });
    await expect(as(ids.guardian, () => db.query(
      "insert into public.academic_history (school_id, student_id, subject_id, school_year, period) values ($1, $2, 'matematica', 2026, 'P1')", [ids.school, ids.student],
    ))).rejects.toMatchObject({ code: "42501" });
    await expect(as(ids.guardian, () => db.query(
      "insert into public.student_preferences (student_id, school_id) values ($1, $2)", [ids.student, ids.school],
    ))).rejects.toMatchObject({ code: "42501" });
  });
});
