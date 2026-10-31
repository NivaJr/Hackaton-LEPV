import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { SchoolReportError } from "../model";
import { SchoolReportService } from "../service";
import { createSupabaseSchoolReportStore } from "./supabase-store";

export function createSchoolReportService() {
  const admin = createSupabaseAdminClient();
  if (!admin) throw new SchoolReportError("NOT_CONFIGURED", "Configure o Supabase no servidor para usar os boletins.", 503);
  return new SchoolReportService(createSupabaseSchoolReportStore(admin));
}
