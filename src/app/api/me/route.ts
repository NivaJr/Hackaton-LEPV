import { getSessionContext } from "@/lib/auth/session";
import { getPublicSupabaseConfig } from "@/lib/supabase/config";

export async function GET() {
  if (!getPublicSupabaseConfig()) return Response.json({ error: { code: "NOT_CONFIGURED", message: "Configure o Supabase para autenticação real." } }, { status: 503 });
  const session = await getSessionContext();
  if (!session) return Response.json({ error: { code: "UNAUTHENTICATED", message: "Sessão ausente ou sem vínculos válidos." } }, { status: 401 });
  return Response.json({ data: session }, { headers: { "Cache-Control": "private, no-store" } });
}
