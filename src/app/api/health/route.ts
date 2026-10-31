import { getPublicSupabaseConfig } from "@/lib/supabase/config";

export async function GET() {
  return Response.json({
    application: "hackaton-lepv", status: "base_ready",
    services: {
      supabase: getPublicSupabaseConfig() ? "configured_not_checked" : "not_configured",
      llm: "gateway_only",
    },
  }, { headers: { "Cache-Control": "no-store" } });
}
