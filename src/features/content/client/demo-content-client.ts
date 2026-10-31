import { z } from "zod";
import type { SessionContext } from "@/contracts";
import { InMemoryActivityPublisher, InMemoryClassDirectory, InMemoryContentRepository } from "../memory";
import { ContentError, zodIssues } from "../model";
import type { ContentExtractionGateway } from "../ports";
import { ContentService } from "../service";
import { ContentClientError, type ContentClient } from "./content-client";

/** Fictional teacher, school and class for the demo pages. Nothing here reaches the server. */
export const DEMO_TEACHER: SessionContext = {
  userId: "demo-professora", roles: ["professor"], institutionId: "demo-escola",
  guardianStudentIds: [], coordinatorInstitutionIds: [],
  teacherAssignments: [
    { institutionId: "demo-escola", classId: "demo-turma-7a", subjectId: "matematica" },
    { institutionId: "demo-escola", classId: "demo-turma-7a", subjectId: "geografia" },
  ],
};

class DemoAiDisabled extends Error {
  constructor() {
    super("IA desligada na demonstração.");
    this.name = "AiNotConfiguredError";
  }
}

const disabledAi: ContentExtractionGateway = {
  extractQuestionsReport: () => Promise.reject(new DemoAiDisabled()),
};

async function wrap<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof ContentError) throw new ContentClientError(error.code, error.message, error.status, error.issues);
    if (error instanceof z.ZodError) throw new ContentClientError("INVALID_INPUT", "Verifique os campos enviados.", 422, zodIssues(error));
    throw error;
  }
}

/** Browser-only client backed by the real ContentService with in-memory adapters and AI disabled. */
export function createDemoContentClient(actor: SessionContext = DEMO_TEACHER): ContentClient {
  const service = new ContentService(
    new InMemoryContentRepository(),
    new InMemoryClassDirectory([{ institutionId: "demo-escola", id: "demo-turma-7a", name: "7º A (demonstração)", grade: 7 }]),
    disabledAi,
    new InMemoryActivityPublisher(),
  );
  return {
    scopes: () => wrap(() => service.listScopes(actor)),
    list: (scope) => wrap(() => service.list(actor, scope)),
    importText: (scope, text) => wrap(() => service.importText(actor, { ...scope, text })),
    importFile: (scope, file) => wrap(async () => service.importFile(actor, {
      ...scope, fileName: file.name, mimeType: file.type, bytes: new Uint8Array(await file.arrayBuffer()),
    })),
    importExample: (scope, exampleId) => wrap(() => service.importExample(actor, { ...scope, exampleId })),
    saveDraft: (id, input) => wrap(() => service.updateDraft(actor, id, input)),
    deleteDraft: (id) => wrap(async () => { await service.deleteDraft(actor, id); }),
    publish: (id) => wrap(() => service.publish(actor, id)),
  };
}
