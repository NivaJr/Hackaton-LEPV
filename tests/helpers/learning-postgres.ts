import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import type { LearningRpcClient } from "@/features/learning/server/supabase-repository";
import { catalog, fixtureIds as ids } from "./learning-memory";

const definitions: Record<string, Array<[string, string]>> = {
  learning_classroom_name: [["p_school", "uuid"], ["p_class", "uuid"]],
  learning_read_catalog: [["p_school", "uuid"], ["p_class", "uuid"]],
  learning_read_student: [["p_school", "uuid"], ["p_student", "uuid"]],
  learning_commit_catalog: [["p_school", "uuid"], ["p_class", "uuid"], ["p_expected_version", "bigint"], ["p_catalog", "jsonb"]],
  learning_commit_student: [["p_school", "uuid"], ["p_student", "uuid"], ["p_expected_version", "bigint"], ["p_catalog_version", "bigint"], ["p_state", "jsonb"]],
  learning_save_preferences: [["p_school", "uuid"], ["p_student", "uuid"], ["p_preferences", "jsonb"]],
  learning_class_ranking: [["p_school", "uuid"], ["p_class", "uuid"]],
};

export async function queryAs<T>(db: PGlite, role: "service_role" | "authenticated" | "anon", userId: string | null, sql: string, parameters: unknown[] = []) {
  return db.transaction(async (transaction) => {
    await transaction.exec(`set local role ${role}`);
    await transaction.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify(userId ? { sub: userId } : {})]);
    return transaction.query<T>(sql, parameters);
  });
}

/** Calls the actual RPC functions under service_role, without PostgREST or a hosted Supabase. */
export function postgresRpcClient(db: PGlite): LearningRpcClient {
  return { async rpc(name, args) {
    const definition = definitions[name];
    if (!definition) throw new Error("Unknown fixture RPC");
    const placeholders = definition.map(([_key, type], i) => `$${i + 1}::${type}`).join(",");
    const values = definition.map(([key, type]) => type === "jsonb" ? JSON.stringify(args[key]) : args[key]);
    try {
      const result = await queryAs<{ data: unknown }>(db, "service_role", null, `select public.${name}(${placeholders}) as data`, values);
      return { data: result.rows[0]?.data, error: null };
    } catch (error) {
      const failure = error as { code?: string; message: string };
      return { data: null, error: { code: failure.code, message: failure.message } };
    }
  } };
}

export const HANDOFF_MIGRATION = "supabase/migrations/20261031143534_student_handoff_integration.sql";

export async function createLearningDatabase(includeHandoff = true) {
  const db = new PGlite();
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin bypassrls;
    create schema auth;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$
      select (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid;
    $$;
    grant usage on schema public to anon,authenticated,service_role;
    grant usage on schema auth to authenticated,service_role;
    grant execute on function auth.uid() to authenticated,service_role;
    create schema storage;
    create table storage.buckets(id text primary key,name text not null,public boolean not null default false,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text not null);
    alter table storage.objects enable row level security;
    grant usage on schema storage to anon,authenticated,service_role;
    grant select,insert on storage.objects to authenticated;
    grant all on storage.buckets,storage.objects to service_role;
  `);
  for (const file of ["supabase/migrations/20261030220000_foundation.sql", "supabase/seed.sql", "supabase/migrations/20261031030000_learning.sql", "supabase/migrations/20261031050000_learning_classroom_name.sql", "supabase/migrations/20261031110000_learning_scoring_confirmed.sql"]) {
    await db.exec(await readFile(resolve(process.cwd(), file), "utf8"));
  }
  if (includeHandoff) await db.exec(await readFile(resolve(process.cwd(), HANDOFF_MIGRATION), "utf8"));
  await db.exec(`
    insert into auth.users(id) values ('${ids.student}'),('${ids.teacher}'),('${ids.coordinator}'),('${ids.guardian}'),('00000000-0000-4000-8000-000000000005');
    insert into public.profiles(id,school_id,full_name) values
      ('${ids.student}','${ids.school}','Aluno fictício'),('${ids.teacher}','${ids.school}','Professor fictício'),
      ('${ids.coordinator}','${ids.school}','Coordenador fictício'),('${ids.guardian}','${ids.school}','Responsável fictício'),
      ('00000000-0000-4000-8000-000000000005','${ids.school}','Segundo aluno fictício');
    insert into public.user_roles(user_id,school_id,role) values
      ('${ids.student}','${ids.school}','aluno'),('${ids.teacher}','${ids.school}','professor'),
      ('${ids.coordinator}','${ids.school}','coordenador'),('${ids.guardian}','${ids.school}','responsavel'),
      ('00000000-0000-4000-8000-000000000005','${ids.school}','aluno');
    insert into public.classrooms(id,school_id,name,grade,school_year) values
      ('${ids.classId}','${ids.school}','6A fictícia',6,2026),('${ids.otherClass}','${ids.school}','6B fictícia',6,2026);
    insert into public.enrollments(school_id,classroom_id,student_id) values
      ('${ids.school}','${ids.classId}','${ids.student}'),('${ids.school}','${ids.otherClass}','00000000-0000-4000-8000-000000000005');
    insert into public.teacher_assignments(school_id,classroom_id,teacher_id,subject_id) values ('${ids.school}','${ids.classId}','${ids.teacher}','matematica');
    insert into public.guardian_links(school_id,guardian_id,student_id,status) values ('${ids.school}','${ids.guardian}','${ids.student}','confirmed');
  `);
  return db;
}

export async function resetLearningDatabase(db: PGlite) {
  await db.exec("truncate public.learning_point_ledger,public.learning_attempts,app_private.learning_student_states");
  await db.exec("delete from app_private.learning_catalogs");
  const initial = catalog().catalog;
  await db.query("insert into app_private.learning_catalogs(classroom_id,school_id,payload) values ($1,$2,$3::jsonb)", [ids.classId,ids.school,JSON.stringify(initial)]);
  await db.query("insert into public.student_preferences(student_id,school_id,interests,context) values ($1,$2,array['futebol'],'Campeonatos') on conflict (student_id) do nothing", [ids.student,ids.school]);
}
