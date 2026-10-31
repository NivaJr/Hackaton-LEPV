import { z } from "zod";
import type { SessionContext } from "@/contracts";
import { FamilyError } from "./model";
import type { FamilyService } from "./service";

const uuid = z.uuid();
const MAX_BODY_BYTES = 32_768;

interface FamilyHttpDependencies {
  getSessionContext(): Promise<SessionContext | null>;
  createService(): Promise<FamilyService>;
}

export function createFamilyHttpHandler(dependencies: FamilyHttpDependencies) {
  return async function handle(request: Request, path: string[]): Promise<Response> {
    const respond = (data: unknown, status = 200) => Response.json(data, {
      status, headers: { "Cache-Control": "private, no-store", "Vary": "Cookie", "X-Content-Type-Options": "nosniff" },
    });
    try {
      const actor = await dependencies.getSessionContext();
      if (!actor) throw new FamilyError("UNAUTHENTICATED", "Entre na sua conta para continuar.", 401);
      const url = new URL(request.url);
      const method = request.method;
      const origin = request.headers.get("origin");
      if (method !== "GET" && origin && origin !== url.origin) {
        throw new FamilyError("INVALID_ORIGIN", "A origem desta operação não é permitida.", 403);
      }
      const service = await dependencies.createService();
      const [first, id, operation] = path;
      if (method === "GET" && path.length === 1 && first === "children") return respond({ children: await service.listChildren(actor) });
      if (first === "students" && path.length >= 2) {
        const studentId = uuid.parse(id);
        if (method === "GET" && path.length === 2) return respond(await service.overview(actor, studentId));
        if (method === "GET" && path.length === 3 && operation === "feedback") return respond(await service.feedback(actor, studentId));
        if (method === "PUT" && path.length === 3) {
          const text = await request.text();
          if (text.length > MAX_BODY_BYTES) throw new FamilyError("BODY_TOO_LARGE", "O corpo da solicitação excede o limite.", 413);
          let body: unknown;
          try { body = JSON.parse(text); }
          catch { throw new FamilyError("INVALID_JSON", "Envie um objeto JSON válido.", 422); }
          return respond(await service.saveRecord(actor, studentId, operation, body));
        }
      }
      throw new FamilyError("ROUTE_NOT_FOUND", "Rota não encontrada.", 404);
    } catch (error) {
      if (error instanceof z.ZodError) return respond({ error: { code: "INVALID_INPUT", message: "Verifique os campos, tipos e valores da solicitação. Campos extras não são aceitos." } }, 422);
      if (error instanceof FamilyError) return respond({ error: { code: error.code, message: error.message } }, error.status);
      return respond({ error: { code: "INTERNAL_ERROR", message: "Não foi possível concluir a operação." } }, 500);
    }
  };
}
