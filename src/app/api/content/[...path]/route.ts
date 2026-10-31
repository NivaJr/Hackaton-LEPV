import { getSessionContext } from "@/lib/auth/session";
import { getPublicSupabaseConfig } from "@/lib/supabase/config";
import { createContentHttpHandler } from "@/features/content/server/http";
import { createContentService } from "@/features/content/server/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const handle = createContentHttpHandler({ getSessionContext, createService: createContentService });
type RouteContext = { params: Promise<{ path: string[] }> };

async function route(request: Request, context: RouteContext) {
  if (!getPublicSupabaseConfig()) {
    return Response.json(
      { error: { code: "NOT_CONFIGURED", message: "Configure o Supabase para usar o banco de questões." } },
      { status: 503, headers: { "Cache-Control": "private, no-store" } },
    );
  }
  return handle(request, (await context.params).path);
}

export const GET = route;
export const POST = route;
export const PUT = route;
export const DELETE = route;
