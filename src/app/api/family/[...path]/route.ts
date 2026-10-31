import { getSessionContext } from "@/lib/auth/session";
import { createFamilyHttpHandler } from "@/features/family/http";
import { createFamilyService } from "@/features/family/server/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const handle = createFamilyHttpHandler({ getSessionContext, createService: createFamilyService });
type RouteContext = { params: Promise<{ path: string[] }> };

export async function GET(request: Request, context: RouteContext) {
  return handle(request, (await context.params).path);
}
export async function PUT(request: Request, context: RouteContext) {
  return handle(request, (await context.params).path);
}
