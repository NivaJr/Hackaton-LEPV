import { z } from "zod";
import type { SessionContext } from "@/contracts";
import { TEMPLATES } from "./import/rows";
import { MAX_FILE_BYTES } from "./import/spreadsheet";
import { MAX_IMPORT_ROWS, RosterError } from "./model";
import type { RosterService } from "./service";

const uuid = z.uuid();
const MAX_JSON_BYTES = (MAX_IMPORT_ROWS + 1) * 1_024;

interface RosterHttpDependencies {
  getSessionContext(): Promise<SessionContext | null>;
  createService(): Promise<RosterService>;
}

function assertSameOrigin(request: Request, url: URL) {
  const origin = request.headers.get("origin");
  // Next may expose an internal listen address in request.url; Host is what the browser requested.
  const host = request.headers.get("host");
  const expected = host ? `${url.protocol}//${host}` : url.origin;
  if (origin && origin !== expected) throw new RosterError("INVALID_ORIGIN", "A origem desta operação não é permitida.", 403);
}

async function readJson(request: Request): Promise<unknown> {
  const text = await request.text();
  if (text.length > MAX_JSON_BYTES) throw new RosterError("BODY_TOO_LARGE", "O corpo da solicitação excede o limite.", 413);
  try { return text.trim() ? JSON.parse(text) : {}; }
  catch { throw new RosterError("INVALID_JSON", "Envie um objeto JSON válido.", 422); }
}

async function readUpload(request: Request) {
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_FILE_BYTES + 4_096) throw new RosterError("FILE_TOO_LARGE", "O arquivo excede o limite de 2 MB.", 413);
  let form: FormData;
  try { form = await request.formData(); }
  catch { throw new RosterError("INVALID_FILE", "Envie o arquivo em um formulário válido.", 422); }
  const file = form.get("file");
  if (!(file instanceof File)) throw new RosterError("INVALID_FILE", "Selecione um arquivo.", 422);
  return {
    kind: form.get("kind"),
    classroomId: uuid.parse(form.get("classroomId")),
    file: { name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) },
  };
}

export function createRosterHttpHandler(dependencies: RosterHttpDependencies) {
  return async function handle(request: Request, path: string[]): Promise<Response> {
    const respond = (data: unknown, status = 200) => Response.json(data, {
      status, headers: { "Cache-Control": "private, no-store", "Vary": "Cookie", "X-Content-Type-Options": "nosniff" },
    });
    try {
      const actor = await dependencies.getSessionContext();
      if (!actor) throw new RosterError("UNAUTHENTICATED", "Entre na sua conta para continuar.", 401);
      const url = new URL(request.url);
      const method = request.method;
      if (method !== "GET") assertSameOrigin(request, url);
      const service = await dependencies.createService();
      const [first, id] = path;
      if (method === "GET" && path.length === 2 && first === "templates") {
        service.assertCoordinator(actor);
        const template = Object.values(TEMPLATES).find((item) => item.fileName === id);
        if (!template) throw new RosterError("NOT_FOUND", "Modelo não encontrado.", 404);
        return new Response(`﻿${template.content}`, { headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="${template.fileName}"`,
          "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff",
        } });
      }
      if (path.length === 1 && first === "overview" && method === "GET") return respond(await service.overview(actor));
      if (first === "classrooms") {
        if (path.length === 1 && method === "POST") return respond(await service.createClassroom(actor, await readJson(request)), 201);
        if (path.length === 2 && method === "PATCH") return respond(await service.updateClassroom(actor, uuid.parse(id), await readJson(request)));
        if (path.length === 2 && method === "DELETE") return respond(await service.deleteClassroom(actor, uuid.parse(id)));
      }
      if (first === "assignments") {
        if (path.length === 1 && method === "POST") return respond(await service.createAssignment(actor, await readJson(request)), 201);
        if (path.length === 2 && method === "DELETE") return respond(await service.deleteAssignment(actor, uuid.parse(id)));
      }
      if (first === "enrollments") {
        if (path.length === 1 && method === "POST") return respond(await service.allocateStudent(actor, await readJson(request)));
        if (path.length === 2 && method === "DELETE") return respond(await service.removeEnrollment(actor, uuid.parse(id)));
      }
      if (method === "GET" && path.length === 3 && first === "students" && path[2] === "results") {
        return respond(await service.studentResults(actor, uuid.parse(id)));
      }
      if (first === "guardian-links") {
        if (path.length === 1 && method === "POST") return respond(await service.createGuardianLink(actor, await readJson(request)), 201);
        if (path.length === 2 && method === "PATCH") return respond(await service.setGuardianLinkStatus(actor, uuid.parse(id), await readJson(request)));
      }
      if (first === "access-links" && path.length === 1 && method === "POST") return respond(await service.issueAccessLink(actor, await readJson(request)), 201);
      if (first === "imports" && path.length === 2 && method === "POST") {
        if (id === "preview") {
          // Role first: other profiles must not make the server buffer an upload.
          service.assertCoordinator(actor);
          return respond(await service.previewImport(actor, await readUpload(request)));
        }
        if (id === "confirm") return respond(await service.confirmImport(actor, await readJson(request)));
      }
      throw new RosterError("ROUTE_NOT_FOUND", "Rota não encontrada.", 404);
    } catch (error) {
      if (error instanceof z.ZodError) return respond({ error: { code: "INVALID_INPUT", message: "Verifique os campos, tipos e valores da solicitação. Campos extras não são aceitos." } }, 422);
      if (error instanceof RosterError) return respond({ error: { code: error.code, message: error.message } }, error.status);
      return respond({ error: { code: "INTERNAL_ERROR", message: "Não foi possível concluir a operação." } }, 500);
    }
  };
}
