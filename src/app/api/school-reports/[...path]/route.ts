import { createSchoolReportHttpHandler } from "@/features/school-reports/http";
import { createSchoolReportService } from "@/features/school-reports/server/runtime";
import { getSessionContext } from "@/lib/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const handle = createSchoolReportHttpHandler({ getSessionContext, createService: createSchoolReportService });
type RouteContext = { params: Promise<{ path: string[] }> };

export async function GET(request: Request, context: RouteContext) {
  return handle(request, (await context.params).path);
}
export async function POST(request: Request, context: RouteContext) {
  return handle(request, (await context.params).path);
}
export async function DELETE(request: Request, context: RouteContext) {
  return handle(request, (await context.params).path);
}
