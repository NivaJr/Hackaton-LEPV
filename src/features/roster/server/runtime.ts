import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { fixtureRosterMetrics } from "../fixtures";
import { RosterError } from "../model";
import { RosterService } from "../service";
import { createSupabaseAccountDirectory } from "./supabase-directory";
import { createSupabaseRosterRepository } from "./supabase-repository";

export async function createRosterService(): Promise<RosterService> {
  const client = await createSupabaseServerClient();
  if (!client) throw new RosterError("NOT_CONFIGURED", "Configure o Supabase para usar a gestão escolar.", 503);
  const admin = createSupabaseAdminClient();
  return new RosterService({
    repository: createSupabaseRosterRepository(client),
    directory: admin ? createSupabaseAccountDirectory(admin, process.env.NEXT_PUBLIC_APP_URL) : null,
    metrics: fixtureRosterMetrics,
  });
}
