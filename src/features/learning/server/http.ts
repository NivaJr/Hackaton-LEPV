import { z } from "zod";
import { IdSchema, SubjectIdSchema, type SessionContext } from "@/contracts";
import { LearningError } from "./model";
import type { LearningService } from "./service";

const empty = z.object({}).strict();
const classQuery = z.object({ classId: z.uuid() }).strict();
const activateInput = z.object({ classId: z.uuid(), subjectId: SubjectIdSchema, rootQuestionIds: z.array(IdSchema).length(10) }).strict();
const rotationInput = z.object({ classId: z.uuid(), subjectId: SubjectIdSchema, weekStart: z.string().date(), incomingRootIds: z.array(IdSchema).length(2) }).strict();
const summaryQuery = z.object({ studentId: z.uuid().optional(), from: z.string().date(), to: z.string().date() }).strict()
  .refine((input) => input.from <= input.to, { message: "O fim do período deve ser posterior ao início." });

interface LearningHttpDependencies {
  getSessionContext(): Promise<SessionContext | null>;
  createService(): LearningService;
}

export function createLearningHttpHandler(dependencies: LearningHttpDependencies) {
  return async function handle(request: Request, path: string[]): Promise<Response> {
    const respond = (data: unknown, status = 200) => Response.json(data, {
      status, headers: { "Cache-Control": "private, no-store", "Vary": "Cookie", "X-Content-Type-Options": "nosniff" },
    });
    try {
      const actor = await dependencies.getSessionContext();
      if (!actor) throw new LearningError("UNAUTHENTICATED", "Entre na sua conta para continuar.", 401);
      const url = new URL(request.url);
      const method = request.method;
      // Next can use its listening address in request.url. Host is the browser's
      // requested authority; unlike a forwarded-host header it cannot be set by fetch.
      const target = new URL(url);
      if (request.headers.get("host")) target.host = request.headers.get("host")!;
      if (method !== "GET" && request.headers.get("origin") && request.headers.get("origin") !== target.origin) {
        throw new LearningError("INVALID_ORIGIN", "A origem desta operação não é permitida.", 403);
      }
      let body: unknown = {};
      if (method !== "GET") {
        const text = await request.text();
        if (text.length > 65_536) throw new LearningError("BODY_TOO_LARGE", "O corpo da solicitação excede o limite.", 413);
        try { body = text.trim() ? JSON.parse(text) : {}; }
        catch { throw new LearningError("INVALID_JSON", "Envie um objeto JSON válido.", 422); }
      }
      const service = dependencies.createService();
      const [first, id, operation] = path;
      if (path.length === 1 && first === "preferences") {
        if (method === "GET") return respond(await service.getPreferences(actor));
        if (method === "PUT") return respond(await service.savePreferences(actor, body));
      }
      if (method === "GET" && path.length === 1 && first === "activities") return respond(await service.listActivities(actor));
      if (method === "POST" && path.length === 3 && first === "activities" && operation === "open") {
        empty.parse(body);
        return respond(await service.openActivity(actor, IdSchema.parse(id)));
      }
      if (method === "GET" && path.length === 2 && first === "instances") return respond(await service.getInstance(actor, IdSchema.parse(id)));
      if (method === "POST" && path.length === 1 && first === "attempts") return respond(await service.submitAttempt(actor, body));
      if (method === "POST" && path.length === 3 && first === "instances" && operation === "hint") {
        empty.parse(body);
        return respond(await service.hint(actor, IdSchema.parse(id)));
      }
      if (method === "POST" && path.length === 3 && first === "recoveries") {
        empty.parse(body);
        if (operation === "next") return respond(await service.nextRecovery(actor, IdSchema.parse(id)));
        if (operation === "interrupt") return respond(await service.interrupt(actor, IdSchema.parse(id)));
      }
      if (method === "GET" && path.length === 1 && first === "summary") {
        const query = summaryQuery.parse(Object.fromEntries(url.searchParams));
        return respond(await service.summary(actor, query.studentId ?? actor.studentId ?? "", query.from, query.to));
      }
      if (method === "GET" && path.length === 1 && first === "ranking") {
        const query = classQuery.parse(Object.fromEntries(url.searchParams));
        return respond(await service.ranking(actor, query.classId));
      }
      if (method === "POST" && path.length === 1 && first === "access") {
        empty.parse(body);
        return respond(await service.recordAccess(actor));
      }
      if (method === "POST" && path.length === 1 && first === "activation") {
        const input = activateInput.parse(body);
        return respond(await service.activate(actor, input.classId, input.subjectId, input.rootQuestionIds));
      }
      if (method === "POST" && path.length === 1 && first === "rotation") {
        const input = rotationInput.parse(body);
        return respond(await service.rotate(actor, input.classId, input.subjectId, input.weekStart, input.incomingRootIds));
      }
      throw new LearningError("ROUTE_NOT_FOUND", "Rota não encontrada.", 404);
    } catch (error) {
      if (error instanceof z.ZodError) return respond({ error: { code: "INVALID_INPUT", message: "Verifique os campos, tipos e valores da solicitação. Campos extras não são aceitos." } }, 422);
      if (error instanceof LearningError) return respond({ error: { code: error.code, message: error.message } }, error.status);
      return respond({ error: { code: "INTERNAL_ERROR", message: "Não foi possível concluir a operação." } }, 500);
    }
  };
}
