import { getSessionContext } from "@/lib/auth/session";
import { createLearningHttpHandler } from "@/features/learning/server/http";
import { createLearningService } from "@/features/learning/server/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const handle = createLearningHttpHandler({ getSessionContext, createService: createLearningService });
type RouteContext = { params: Promise<{ path: string[] }> };

export async function GET(request: Request, context: RouteContext) {
  return handle(request, (await context.params).path);
}
export async function POST(request: Request, context: RouteContext) {
  return handle(request, (await context.params).path);
}
export async function PUT(request: Request, context: RouteContext) {
  return handle(request, (await context.params).path);
}
