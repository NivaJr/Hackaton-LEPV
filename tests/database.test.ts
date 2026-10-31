import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Executes the actual migration in Postgres/WASM. Only Supabase Auth is emulated.
 * This verifies SQL privileges, RLS, constraints and triggers, not hosted Supabase.
 */
const ids = {
  school: "11111111-1111-4111-8111-111111111111",
  otherSchool: "22222222-2222-4222-8222-222222222222",
  admin: "00000000-0000-4000-8000-000000000001",
  otherAdmin: "00000000-0000-4000-8000-000000000002",
  teacher: "00000000-0000-4000-8000-000000000003",
  student: "00000000-0000-4000-8000-000000000004",
  otherClassStudent: "00000000-0000-4000-8000-000000000005",
  otherSchoolStudent: "00000000-0000-4000-8000-000000000006",
  guardian: "00000000-0000-4000-8000-000000000007",
  pendingGuardian: "00000000-0000-4000-8000-000000000008",
  revokedGuardian: "00000000-0000-4000-8000-000000000009",
  freshStudent: "00000000-0000-4000-8000-000000000010",
  classroom: "10000000-0000-4000-8000-000000000001",
  otherClassroom: "10000000-0000-4000-8000-000000000002",
  otherSchoolClassroom: "10000000-0000-4000-8000-000000000003",
  mathHistory: "20000000-0000-4000-8000-000000000001",
  portugueseHistory: "20000000-0000-4000-8000-000000000002",
  otherClassHistory: "20000000-0000-4000-8000-000000000003",
  otherSchoolHistory: "20000000-0000-4000-8000-000000000004",
} as const;

let db: PGlite;
type DatabaseRole = "anon" | "authenticated" | "service_role";

/** Every user operation switches away from the owner and rolls back, even on failure. */
async function asRole<T>(role: DatabaseRole, userId: string | null, run: () => Promise<T>): Promise<T> {
  await db.exec("begin");
  try {
    // Role is a closed union owned by this test, not interpolated user input.
    await db.exec(`set local role ${role}`);
    await db.query("select set_config('request.jwt.claims', $1, true)", [
      JSON.stringify(userId ? { sub: userId } : {}),
    ]);
    const execution = await db.query<{ current_user: string }>("select current_user");
    expect(execution.rows[0]?.current_user).toBe(role);
    return await run();
  } finally {
    await db.exec("rollback");
  }
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin bypassrls;
    create schema auth;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$
      select (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid;
    $$;
    grant usage on schema public to anon, authenticated, service_role;
    grant usage on schema auth to authenticated, service_role;
    grant execute on function auth.uid() to authenticated, service_role;
  `);
  const migration = await readFile(resolve(process.cwd(), "supabase/migrations/20261030220000_foundation.sql"), "utf8");
  const seed = await readFile(resolve(process.cwd(), "supabase/seed.sql"), "utf8");
  await db.exec(migration);
  await db.exec(seed);

  // Fixtures are provisioned by the installation owner, like server-side provisioning.
  // All behavior assertions below use SET LOCAL ROLE and a JWT containing sub only.
  await db.exec(`
    begin;
    insert into public.schools (id, name) values ('${ids.otherSchool}', 'Outra escola fictícia');
    insert into auth.users (id) values
      ('${ids.admin}'), ('${ids.otherAdmin}'), ('${ids.teacher}'), ('${ids.student}'),
      ('${ids.otherClassStudent}'), ('${ids.otherSchoolStudent}'), ('${ids.guardian}'),
      ('${ids.pendingGuardian}'), ('${ids.revokedGuardian}'), ('${ids.freshStudent}');
    insert into public.profiles (id, school_id, full_name) values
      ('${ids.admin}', '${ids.school}', 'Coordenador fictício'),
      ('${ids.otherAdmin}', '${ids.otherSchool}', 'Outro coordenador fictício'),
      ('${ids.teacher}', '${ids.school}', 'Professor de matemática fictício'),
      ('${ids.student}', '${ids.school}', 'Aluno da primeira turma'),
      ('${ids.otherClassStudent}', '${ids.school}', 'Aluno da segunda turma'),
      ('${ids.otherSchoolStudent}', '${ids.otherSchool}', 'Aluno de outra escola'),
      ('${ids.guardian}', '${ids.school}', 'Responsável confirmado fictício'),
      ('${ids.pendingGuardian}', '${ids.school}', 'Responsável pendente fictício'),
      ('${ids.revokedGuardian}', '${ids.school}', 'Responsável revogado fictício'),
      ('${ids.freshStudent}', '${ids.school}', 'Aluno sem ficha inicial');
    insert into public.user_roles (user_id, school_id, role) values
      ('${ids.admin}', '${ids.school}', 'coordenador'),
      ('${ids.otherAdmin}', '${ids.otherSchool}', 'coordenador'),
      ('${ids.teacher}', '${ids.school}', 'professor'),
      ('${ids.student}', '${ids.school}', 'aluno'),
      ('${ids.otherClassStudent}', '${ids.school}', 'aluno'),
      ('${ids.otherSchoolStudent}', '${ids.otherSchool}', 'aluno'),
      ('${ids.guardian}', '${ids.school}', 'responsavel'),
      ('${ids.pendingGuardian}', '${ids.school}', 'responsavel'),
      ('${ids.revokedGuardian}', '${ids.school}', 'responsavel'),
      ('${ids.freshStudent}', '${ids.school}', 'aluno');
    insert into public.classrooms (id, school_id, name, grade, school_year) values
      ('${ids.classroom}', '${ids.school}', '6A fictícia', 6, 2026),
      ('${ids.otherClassroom}', '${ids.school}', '7A fictícia', 7, 2026),
      ('${ids.otherSchoolClassroom}', '${ids.otherSchool}', '6A outra escola', 6, 2026);
    insert into public.enrollments (school_id, classroom_id, student_id) values
      ('${ids.school}', '${ids.classroom}', '${ids.student}'),
      ('${ids.school}', '${ids.otherClassroom}', '${ids.otherClassStudent}'),
      ('${ids.otherSchool}', '${ids.otherSchoolClassroom}', '${ids.otherSchoolStudent}'),
      ('${ids.school}', '${ids.classroom}', '${ids.freshStudent}');
    insert into public.teacher_assignments (school_id, classroom_id, teacher_id, subject_id)
      values ('${ids.school}', '${ids.classroom}', '${ids.teacher}', 'matematica');
    insert into public.guardian_links (school_id, guardian_id, student_id, status) values
      ('${ids.school}', '${ids.guardian}', '${ids.student}', 'confirmed'),
      ('${ids.school}', '${ids.pendingGuardian}', '${ids.student}', 'pending'),
      ('${ids.school}', '${ids.revokedGuardian}', '${ids.student}', 'revoked');
    insert into public.student_preferences (student_id, school_id, interests, context) values
      ('${ids.student}', '${ids.school}', array['futebol'], 'Contexto inicial'),
      ('${ids.otherClassStudent}', '${ids.school}', array['música'], 'Outra turma');
    insert into public.academic_history (id, school_id, student_id, subject_id, school_year, period, grade) values
      ('${ids.mathHistory}', '${ids.school}', '${ids.student}', 'matematica', 2026, 'Primeiro período', 7),
      ('${ids.portugueseHistory}', '${ids.school}', '${ids.student}', 'portugues', 2026, 'Primeiro período', 8),
      ('${ids.otherClassHistory}', '${ids.school}', '${ids.otherClassStudent}', 'matematica', 2026, 'Primeiro período', 6),
      ('${ids.otherSchoolHistory}', '${ids.otherSchool}', '${ids.otherSchoolStudent}', 'matematica', 2026, 'Primeiro período', 9);
    insert into public.student_health (student_id, school_id, details) values
      ('${ids.student}', '${ids.school}', 'Registro fictício inicial'),
      ('${ids.otherClassStudent}', '${ids.school}', 'Registro fictício da outra turma'),
      ('${ids.otherSchoolStudent}', '${ids.otherSchool}', 'Registro fictício de outra escola');
    insert into public.student_support (student_id, school_id, details) values
      ('${ids.student}', '${ids.school}', 'Apoio fictício inicial'),
      ('${ids.otherClassStudent}', '${ids.school}', 'Apoio fictício da outra turma');
    commit;
  `);
}, 60_000);

afterAll(async () => {
  if (db) await db.close();
}, 60_000);

describe.sequential("migração real em Postgres/WASM com Auth emulado", () => {
  it("aplica o seed e habilita execução autenticada sem usar privilégios do dono", async () => {
    await asRole("authenticated", ids.student, async () => {
      const subjects = await db.query<{ id: string }>("select id from public.subjects order by display_order");
      expect(subjects.rows.map((row) => row.id)).toEqual([
        "matematica", "portugues", "ingles", "historia", "geografia", "biologia",
      ]);
      const schools = await db.query<{ id: string }>("select id from public.schools");
      expect(schools.rows.map((row) => row.id)).toEqual([ids.school]);
    });
  });

  it("aluno consulta e edita a própria ficha, mas não lê nem edita a ficha de outro aluno", async () => {
    await asRole("authenticated", ids.student, async () => {
      const visible = await db.query<{ student_id: string }>("select student_id from public.student_preferences");
      expect(visible.rows.map((row) => row.student_id)).toEqual([ids.student]);
      const own = await db.query<{ context: string }>(
        "update public.student_preferences set context = $1 where student_id = $2 returning context",
        ["Prefiro questões de futebol.", ids.student],
      );
      expect(own.rows).toEqual([{ context: "Prefiro questões de futebol." }]);
      const other = await db.query(
        "update public.student_preferences set context = 'alteração indevida' where student_id = $1 returning student_id",
        [ids.otherClassStudent],
      );
      expect(other.rows).toEqual([]);
    });
  });

  it("rollback restaura uma edição autorizada e o incremento automático da versão", async () => {
    await asRole("authenticated", ids.student, async () => {
      const row = await db.query<{ context: string; version: number }>(
        "select context, version from public.student_preferences where student_id = $1", [ids.student],
      );
      expect(row.rows).toEqual([{ context: "Contexto inicial", version: 1 }]);
    });
  });

  it("aluno não consegue atribuir a si mesmo o papel de coordenador", async () => {
    await expect(asRole("authenticated", ids.student, () => db.query(
      "insert into public.user_roles (user_id, school_id, role) values ($1, $2, 'coordenador')",
      [ids.student, ids.school],
    ))).rejects.toMatchObject({ code: "42501" });
  });

  it("aluno não consegue trocar a própria escola nem forjar a versão da ficha", async () => {
    await expect(asRole("authenticated", ids.student, () => db.query(
      "update public.profiles set school_id = $1 where id = $2", [ids.otherSchool, ids.student],
    ))).rejects.toMatchObject({ code: "42501" });
    await expect(asRole("authenticated", ids.student, () => db.query(
      "update public.student_preferences set version = 999 where student_id = $1", [ids.student],
    ))).rejects.toMatchObject({ code: "42501" });
  });

  it("professor edita histórico somente da matéria e turma atribuídas", async () => {
    await asRole("authenticated", ids.teacher, async () => {
      const ownSubject = await db.query<{ id: string; updated_by: string }>(
        "update public.academic_history set grade = 8.25 where id = $1 returning id, updated_by", [ids.mathHistory],
      );
      expect(ownSubject.rows).toEqual([{ id: ids.mathHistory, updated_by: ids.teacher }]);
      const otherSubject = await db.query(
        "update public.academic_history set grade = 1 where id = $1 returning id", [ids.portugueseHistory],
      );
      expect(otherSubject.rows).toEqual([]);
      const otherClass = await db.query(
        "update public.academic_history set grade = 1 where id = $1 returning id", [ids.otherClassHistory],
      );
      expect(otherClass.rows).toEqual([]);
      const otherSchool = await db.query(
        "select id from public.academic_history where id = $1", [ids.otherSchoolHistory],
      );
      expect(otherSchool.rows).toEqual([]);
    });
  });

  it("responsável confirmado edita saúde e apoio e a auditoria usa o ator autenticado", async () => {
    await asRole("authenticated", ids.guardian, async () => {
      const health = await db.query<{ details: string; updated_by: string }>(
        "update public.student_health set details = 'Atualização fictícia pelo responsável' where student_id = $1 returning details, updated_by",
        [ids.student],
      );
      expect(health.rows).toEqual([{ details: "Atualização fictícia pelo responsável", updated_by: ids.guardian }]);
      const support = await db.query<{ details: string; updated_by: string }>(
        "update public.student_support set details = 'Apoio fictício atualizado' where student_id = $1 returning details, updated_by",
        [ids.student],
      );
      expect(support.rows).toEqual([{ details: "Apoio fictício atualizado", updated_by: ids.guardian }]);
      const other = await db.query(
        "update public.student_health set details = 'indevido' where student_id = $1 returning student_id", [ids.otherClassStudent],
      );
      expect(other.rows).toEqual([]);
    });
  });

  it.each([
    ["pendente", ids.pendingGuardian],
    ["revogado", ids.revokedGuardian],
  ] as const)("responsável com vínculo %s não consulta nem edita saúde/apoio", async (_status, guardianId) => {
    await asRole("authenticated", guardianId, async () => {
      const read = await db.query("select student_id from public.student_health where student_id = $1", [ids.student]);
      expect(read.rows).toEqual([]);
      const health = await db.query(
        "update public.student_health set details = 'indevido' where student_id = $1 returning student_id", [ids.student],
      );
      const support = await db.query(
        "update public.student_support set details = 'indevido' where student_id = $1 returning student_id", [ids.student],
      );
      expect(health.rows).toEqual([]);
      expect(support.rows).toEqual([]);
    });
  });

  it("coordenador consulta os alunos da escola, mas não edita saúde ou apoio", async () => {
    await asRole("authenticated", ids.admin, async () => {
      const visible = await db.query<{ student_id: string }>("select student_id from public.student_health order by student_id");
      expect(visible.rows.map((row) => row.student_id)).toEqual([ids.student, ids.otherClassStudent]);
      const health = await db.query(
        "update public.student_health set details = 'indevido' where student_id = $1 returning student_id", [ids.student],
      );
      const support = await db.query(
        "update public.student_support set details = 'indevido' where student_id = $1 returning student_id", [ids.student],
      );
      expect(health.rows).toEqual([]);
      expect(support.rows).toEqual([]);
    });
  });

  it("coordenador de outra escola não vê nem edita histórico do estudante", async () => {
    await asRole("authenticated", ids.otherAdmin, async () => {
      const history = await db.query("select id from public.academic_history where student_id = $1", [ids.student]);
      expect(history.rows).toEqual([]);
      const change = await db.query(
        "update public.academic_history set grade = 1 where id = $1 returning id", [ids.mathHistory],
      );
      expect(change.rows).toEqual([]);
    });
  });

  it("FK composta rejeita matrícula ligada a uma turma de outra escola mesmo com bypass de RLS", async () => {
    await expect(asRole("service_role", null, () => db.query(
      "insert into public.enrollments (school_id, classroom_id, student_id, status, started_at, ended_at) values ($1, $2, $3, 'inactive', now(), now())",
      [ids.school, ids.otherSchoolClassroom, ids.freshStudent],
    ))).rejects.toMatchObject({ code: "23503" });
  });

  it("anon não pode consultar tabelas públicas desta fundação", async () => {
    await expect(asRole("anon", null, () => db.query("select * from public.student_health")))
      .rejects.toMatchObject({ code: "42501" });
    await expect(asRole("anon", null, () => db.query("select * from public.subjects")))
      .rejects.toMatchObject({ code: "42501" });
  });

  it("a versão da ficha começa em 1 e só aumenta quando interesses ou contexto mudam", async () => {
    await asRole("authenticated", ids.freshStudent, async () => {
      const initial = await db.query<{ version: number }>(
        "insert into public.student_preferences (student_id, school_id, interests, context, version) values ($1, $2, array['leitura'], 'Inicial', 999) returning version",
        [ids.freshStudent, ids.school],
      );
      expect(initial.rows).toEqual([{ version: 1 }]);
      const unchanged = await db.query<{ version: number }>(
        "update public.student_preferences set context = 'Inicial' where student_id = $1 returning version", [ids.freshStudent],
      );
      expect(unchanged.rows).toEqual([{ version: 1 }]);
      const contextChanged = await db.query<{ version: number }>(
        "update public.student_preferences set context = 'Novo contexto' where student_id = $1 returning version", [ids.freshStudent],
      );
      expect(contextChanged.rows).toEqual([{ version: 2 }]);
      const interestsChanged = await db.query<{ version: number }>(
        "update public.student_preferences set interests = array['leitura', 'xadrez'] where student_id = $1 returning version", [ids.freshStudent],
      );
      expect(interestsChanged.rows).toEqual([{ version: 3 }]);
    });
  });
});
