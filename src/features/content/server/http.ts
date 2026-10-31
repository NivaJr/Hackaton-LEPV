import { z } from "zod";
import { IdSchema, type SessionContext } from "@/contracts";
import { ContentError, zodIssues } from "../model";
import type { ContentService } from "../service";
import { MAX_UPLOAD_BYTES } from "../upload";

const JSON_LIMIT = 256 * 1024;
const MULTIPART_OVERHEAD = 64 * 1024;
const jsonImport = z.union([
  z.object({ classId: z.unknown(), subjectId: z.unknown(), text: z.unknown() }).strict(),
  z.object({ classId: z.unknown(), subjectId: z.unknown(), exampleId: z.unknown() }).strict(),
]);

interface ContentHttpDependencies {
  getSessionContext(): Promise<SessionContext | null>;
  createService(): ContentService;
}

function declaredLength(request: Request): number | null {
  const header = request.headers.get("content-length");
  if (header === null || !/^\d+$/.test(header.trim())) return null;
  const value = Number(header);
  return Number.isSafeInteger(value) ? value : null;
}

async function readJson(request: Request): Promise<unknown> {
  if ((declaredLength(request) ?? 0) > JSON_LIMIT) throw new ContentError("BODY_TOO_LARGE", "O corpo da solicitação passa do limite.", 413);
  const text = await request.text();
  if (text.length > JSON_LIMIT) throw new ContentError("BODY_TOO_LARGE", "O corpo da solicitação passa do limite.", 413);
  try {
    return text.trim() ? JSON.parse(text) : {};
  } catch {
    throw new ContentError("INVALID_JSON", "Envie um objeto JSON válido.", 422);
  }
}

/**
 * Routes under /api/content:
 * GET scopes | GET questions?classId&subjectId | POST imports (multipart file or JSON text/exampleId)
 * PUT drafts/:id | DELETE drafts/:id | POST drafts/:id/publish
 */
export function createContentHttpHandler(dependencies: ContentHttpDependencies) {
  return async function handle(request: Request, path: string[]): Promise<Response> {
    const respond = (data: unknown, status = 200) => Response.json(data, {
      status, headers: { "Cache-Control": "private, no-store", "Vary": "Cookie", "X-Content-Type-Options": "nosniff" },
    });
    try {
      const actor = await dependencies.getSessionContext();
      if (!actor) throw new ContentError("UNAUTHENTICATED", "Entre na sua conta para continuar.", 401);
      const url = new URL(request.url);
      const method = request.method;
      if (method !== "GET" && request.headers.get("origin") && request.headers.get("origin") !== url.origin) {
        throw new ContentError("INVALID_ORIGIN", "A origem desta operação não é permitida.", 403);
      }
      const service = dependencies.createService();
      // Every route is staff-only; refuse before any body is read.
      service.requireStaff(actor);
      const [first, id, operation] = path;
      if (method === "GET" && path.length === 1 && first === "scopes") return respond({ scopes: await service.listScopes(actor) });
      if (method === "GET" && path.length === 1 && first === "questions") {
        return respond(await service.list(actor, Object.fromEntries(url.searchParams)));
      }
      if (method === "POST" && path.length === 1 && first === "imports") {
        const contentType = request.headers.get("content-type") ?? "";
        if (contentType.startsWith("multipart/form-data")) {
          const declared = declaredLength(request);
          if (declared === null) {
            throw new ContentError("LENGTH_REQUIRED", "Não foi possível conferir o tamanho do envio. Tente de novo pelo navegador.", 411);
          }
          if (declared > MAX_UPLOAD_BYTES + MULTIPART_OVERHEAD) {
            throw new ContentError("FILE_TOO_LARGE", "O arquivo passa de 10 MB. Divida a lista ou cole o texto.", 413);
          }
          const form = await request.formData().catch(() => {
            throw new ContentError("INVALID_FORM", "Não foi possível ler o formulário enviado.", 422);
          });
          const file = form.get("file");
          if (!(file instanceof Blob)) throw new ContentError("FILE_REQUIRED", "Escolha um arquivo PDF.", 422);
          if (file.size > MAX_UPLOAD_BYTES) throw new ContentError("FILE_TOO_LARGE", "O arquivo passa de 10 MB. Divida a lista ou cole o texto.", 413);
          return respond(await service.importFile(actor, {
            classId: form.get("classId"), subjectId: form.get("subjectId"),
            fileName: "name" in file && typeof file.name === "string" ? file.name : "arquivo.pdf",
            mimeType: file.type, bytes: new Uint8Array(await file.arrayBuffer()),
          }), 201);
        }
        const body = jsonImport.parse(await readJson(request));
        return respond("exampleId" in body ? await service.importExample(actor, body) : await service.importText(actor, body), 201);
      }
      if (path.length === 2 && first === "drafts") {
        const draftId = IdSchema.parse(id);
        if (method === "PUT") return respond({ question: await service.updateDraft(actor, draftId, await readJson(request)) });
        if (method === "DELETE") return respond(await service.deleteDraft(actor, draftId));
      }
      if (method === "POST" && path.length === 3 && first === "drafts" && operation === "publish") {
        return respond({ question: await service.publish(actor, IdSchema.parse(id)) });
      }
      throw new ContentError("ROUTE_NOT_FOUND", "Rota não encontrada.", 404);
    } catch (error) {
      if (error instanceof ContentError) {
        return respond({ error: { code: error.code, message: error.message, ...(error.issues ? { issues: error.issues } : {}) } }, error.status);
      }
      if (error instanceof z.ZodError) {
        return respond({ error: { code: "INVALID_INPUT", message: "Verifique os campos enviados. Campos extras não são aceitos.", issues: zodIssues(error) } }, 422);
      }
      return respond({ error: { code: "INTERNAL_ERROR", message: "Não foi possível concluir a operação." } }, 500);
    }
  };
}
