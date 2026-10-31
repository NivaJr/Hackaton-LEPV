import { z } from "zod";
import { IdSchema, type SessionContext } from "@/contracts";
import { RecognitionError } from "./model";
import type { RecognitionService } from "./service";

const BODY_LIMIT = 16_384;
const empty = z.object({}).strict();
const studentsQuery = z.object({ classId: IdSchema }).strict();
const listQuery = z.object({ studentId: IdSchema.optional() }).strict();

export interface RecognitionHttpDependencies {
  getSessionContext(): Promise<SessionContext | null>;
  getActorName(): Promise<string>;
  createService(): RecognitionService;
}

export type RecognitionOperation =
  | { kind: "grant" }
  | { kind: "list" }
  | { kind: "students" }
  | { kind: "notifications" }
  | { kind: "markRead"; notificationId: string };

function respond(data: unknown, status = 200) {
  return Response.json(data, {
    status, headers: { "Cache-Control": "private, no-store", "Vary": "Cookie", "X-Content-Type-Options": "nosniff" },
  });
}

async function readBody(request: Request): Promise<unknown> {
  const text = await request.text();
  if (text.length > BODY_LIMIT) throw new RecognitionError("BODY_TOO_LARGE", "O envio passou do tamanho permitido.", 413);
  try {
    return text.trim() ? JSON.parse(text) : {};
  } catch {
    throw new RecognitionError("INVALID_JSON", "Envie um objeto JSON válido.", 422);
  }
}

export function createRecognitionHttpHandler(dependencies: RecognitionHttpDependencies) {
  return async function handle(request: Request, operation: RecognitionOperation): Promise<Response> {
    try {
      const actor = await dependencies.getSessionContext();
      if (!actor) throw new RecognitionError("UNAUTHENTICATED", "Entre na sua conta para continuar.", 401);
      const url = new URL(request.url);
      if (request.method !== "GET") {
        const origin = request.headers.get("origin");
        if (origin && origin !== url.origin) throw new RecognitionError("INVALID_ORIGIN", "A origem desta operação não é permitida.", 403);
      }
      const query = Object.fromEntries(url.searchParams);
      const service = dependencies.createService();
      switch (operation.kind) {
        case "grant": {
          const body = await readBody(request);
          return respond(await service.grant(actor, await dependencies.getActorName(), body));
        }
        case "list":
          return respond(await service.listForStudent(actor, listQuery.parse(query).studentId));
        case "students":
          return respond(await service.listStudents(actor, studentsQuery.parse(query).classId));
        case "notifications":
          empty.parse(query);
          return respond(await service.listNotifications(actor));
        case "markRead":
          empty.parse(await readBody(request));
          return respond(await service.markNotificationRead(actor, operation.notificationId));
      }
    } catch (error) {
      if (error instanceof z.ZodError) {
        const noteIssue = error.issues.find((issue) => issue.path[0] === "note");
        return respond({ error: {
          code: "INVALID_INPUT",
          message: noteIssue?.code === "custom" ? noteIssue.message : "Confira os campos enviados. Campos extras não são aceitos.",
        } }, 422);
      }
      if (error instanceof RecognitionError) return respond({ error: { code: error.code, message: error.message } }, error.status);
      return respond({ error: { code: "INTERNAL_ERROR", message: "Não foi possível concluir a operação." } }, 500);
    }
  };
}
