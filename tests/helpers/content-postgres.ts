import type { PGlite } from "@electric-sql/pglite";
import { createClient } from "@supabase/supabase-js";
import { queryAs } from "./learning-postgres";

/** Minimal PostgREST transport for the actual Supabase adapter. SQL, RLS and
 * constraints are real; Auth and HTTP transport are emulated locally. */
export function contentPostgresClient(db: PGlite, userId: string) {
  const columns = new Set(["id", "school_id", "classroom_id", "subject_id", "created_by", "version", "status", "payload", "created_at"]);
  const transport: typeof fetch = async (input, init) => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    if (url.pathname !== "/rest/v1/content_questions") throw new Error("Unexpected PostgREST table");
    const parameters: unknown[] = [];
    const placeholder = (value: unknown) => { parameters.push(value); return `$${parameters.length}`; };
    const conditions: string[] = [];
    for (const [key, value] of url.searchParams) {
      if (!columns.has(key)) continue;
      if (!value.startsWith("eq.")) throw new Error("Unexpected filter");
      conditions.push(`${key} = ${placeholder(value.slice(3))}`);
    }
    const where = conditions.length ? ` where ${conditions.join(" and ")}` : "";
    let sql: string;
    if (request.method === "GET") {
      sql = `select * from public.content_questions${where} order by created_at,id`;
    } else if (request.method === "POST") {
      sql = `insert into public.content_questions select * from jsonb_populate_recordset(null::public.content_questions, ${placeholder(JSON.stringify(await request.json()))}::jsonb) returning *`;
    } else if (request.method === "PATCH") {
      const body = await request.json() as Record<string, unknown>;
      const updates = Object.entries(body).map(([key, value]) => {
        if (!columns.has(key)) throw new Error("Unexpected update column");
        return `${key} = ${placeholder(key === "payload" ? JSON.stringify(value) : value)}${key === "payload" ? "::jsonb" : ""}`;
      });
      sql = `update public.content_questions set ${updates.join(",")}${where} returning *`;
    } else if (request.method === "DELETE") {
      sql = `delete from public.content_questions${where} returning *`;
    } else throw new Error("Unexpected method");
    try {
      const result = await queryAs(db, "authenticated", userId, sql, parameters);
      return Response.json(result.rows, { status: request.method === "POST" ? 201 : 200 });
    } catch (error) {
      const failure = error as { code: string; message: string };
      return Response.json({ code: failure.code, message: failure.message, details: null, hint: null }, {
        status: failure.code === "42501" ? 403 : failure.code === "23505" ? 409 : 400,
      });
    }
  };
  return createClient("https://test.supabase.invalid", "test-publishable-key", {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: { fetch: transport },
  });
}
