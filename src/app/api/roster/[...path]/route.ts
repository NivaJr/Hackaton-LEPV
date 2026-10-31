import { getSessionContext } from "@/lib/auth/session";
import { createRosterHttpHandler } from "@/features/roster/http";
import { createRosterService } from "@/features/roster/server/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const handle = createRosterHttpHandler({ getSessionContext, createService: createRosterService });
type RouteContext = { params: Promise<{ path: string[] }> };

export async function GET(request: Request, context: RouteContext) {
  return handle(request, (await context.params).path);
}
export async function POST(request: Request, context: RouteContext) {
  return handle(request, (await context.params).path);
}
export async function PATCH(request: Request, context: RouteContext) {
  return handle(request, (await context.params).path);
}
export async function DELETE(request: Request, context: RouteContext) {
  return handle(request, (await context.params).path);
}
