import "server-only";
import { createLearningService } from "@/features/learning/server/runtime";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { RosterError } from "../model";
import { RosterService } from "../service";
import { createLearningStudentResults } from "./learning-results";
import { createSupabaseAccountDirectory } from "./supabase-directory";
import { createSupabaseRosterRepository } from "./supabase-repository";
import { createLearningRosterMetrics } from "./learning-metrics";

export async function createRosterService(): Promise<RosterService> {
  const client = await createSupabaseServerClient();
  if (!client) throw new RosterError("NOT_CONFIGURED", "Configure o Supabase para usar a gestão escolar.", 503);
  const admin = createSupabaseAdminClient();
  return new RosterService({
    repository: createSupabaseRosterRepository(client, admin),
    directory: admin ? createSupabaseAccountDirectory(admin, process.env.NEXT_PUBLIC_APP_URL) : null,
    metrics: createLearningRosterMetrics(createLearningService),
    results: createLearningStudentResults(createLearningService),
  });
}
