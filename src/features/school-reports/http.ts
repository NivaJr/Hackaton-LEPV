import { z } from "zod";
import type { SessionContext } from "@/contracts";
import { MAX_REPORT_BYTES, SchoolReportError } from "./model";
import type { SchoolReportService } from "./service";

const uuid = z.uuid();
const MULTIPART_OVERHEAD = 4_096;

interface SchoolReportHttpDependencies {
  getSessionContext(): Promise<SessionContext | null>;
  createService(): SchoolReportService;
}

async function readUpload(request: Request) {
  if (Number(request.headers.get("content-length") ?? 0) > MAX_REPORT_BYTES + MULTIPART_OVERHEAD) {
    throw new SchoolReportError("FILE_TOO_LARGE", "O arquivo excede o limite de 4 MB.", 413);
  }
  let form: FormData;
  try { form = await request.formData(); }
  catch { throw new SchoolReportError("INVALID_FILE", "Envie o arquivo em um formulário válido.", 422); }
  const file = form.get("file");
  if (!(file instanceof File)) throw new SchoolReportError("INVALID_FILE", "Selecione um arquivo PDF.", 422);
  return { label: form.get("label"), bytes: new Uint8Array(await file.arrayBuffer()) };
}

export function createSchoolReportHttpHandler(dependencies: SchoolReportHttpDependencies) {
  return async function handle(request: Request, path: string[]): Promise<Response> {
    const respond = (data: unknown, status = 200) => Response.json(data, {
      status, headers: { "Cache-Control": "private, no-store", "Vary": "Cookie", "X-Content-Type-Options": "nosniff" },
    });
    try {
      const actor = await dependencies.getSessionContext();
      if (!actor) throw new SchoolReportError("UNAUTHENTICATED", "Entre na sua conta para continuar.", 401);
      const url = new URL(request.url);
      const method = request.method;
      const origin = request.headers.get("origin");
      // Next may expose an internal listen address in request.url; Host is what the browser requested.
      const host = request.headers.get("host");
      if (method !== "GET" && origin && origin !== (host ? `${url.protocol}//${host}` : url.origin)) {
        throw new SchoolReportError("INVALID_ORIGIN", "A origem desta operação não é permitida.", 403);
      }
      const [first, id, files, fileId] = path;
      if (first === "students" && path.length === 2) {
        const studentId = uuid.parse(id);
        const service = dependencies.createService();
        if (method === "GET") return respond(await service.list(actor, studentId));
        if (method === "POST") {
          // Role first: other profiles must not make the server buffer an upload.
          if (!actor.roles.includes("coordenador")) throw new SchoolReportError("FORBIDDEN", "Esta operação é exclusiva da coordenação da escola.", 403);
          return respond(await service.upload(actor, studentId, await readUpload(request)), 201);
        }
      }
      if (first === "students" && path.length === 4 && files === "files") {
        const studentId = uuid.parse(id);
        const service = dependencies.createService();
        if (method === "GET") {
          const bytes = await service.read(actor, studentId, uuid.parse(fileId));
          return new Response(new Blob([bytes.slice()], { type: "application/pdf" }), { headers: {
            "Content-Disposition": "inline; filename=\"boletim.pdf\"",
            "Cache-Control": "private, no-store", "Vary": "Cookie", "X-Content-Type-Options": "nosniff",
          } });
        }
        if (method === "DELETE") return respond(await service.remove(actor, studentId, uuid.parse(fileId)));
      }
      throw new SchoolReportError("ROUTE_NOT_FOUND", "Rota não encontrada.", 404);
    } catch (error) {
      if (error instanceof z.ZodError) return respond({ error: { code: "INVALID_INPUT", message: "Informe um título com até 80 caracteres." } }, 422);
      if (error instanceof SchoolReportError) return respond({ error: { code: error.code, message: error.message } }, error.status);
      return respond({ error: { code: "INTERNAL_ERROR", message: "Não foi possível concluir a operação." } }, 500);
    }
  };
}
