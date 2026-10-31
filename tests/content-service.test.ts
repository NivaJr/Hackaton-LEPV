import { describe, expect, it } from "vitest";
import { z } from "zod";
import { GeneratedQuestionSchema, type GeneratedQuestion, type SessionContext } from "@/contracts";
import type { DocxTextReader } from "@/features/content/docx";
import { DEMO_EXAMPLES } from "@/features/content/fixtures/examples";
import { buildContentInventory, TARGET_TOTAL } from "@/features/content/fixtures/inventory";
import {
  InMemoryActivityPublisher, InMemoryClassDirectory, InMemoryContentRepository, InMemoryImportQuota, UnconnectedActivityPublisher,
} from "@/features/content/memory";
import { ContentError } from "@/features/content/model";
import type { ActivityPublisher, ContentExtractionGateway, DocumentExtractionInput, ImportQuota } from "@/features/content/ports";
import type { ExtractionReport, TextExtractionInput } from "@/lib/llm/types";
import { ContentService } from "@/features/content/service";
import { docx } from "./helpers/docx";

const teacher: SessionContext = {
  userId: "prof-1", roles: ["professor"], institutionId: "school-1", guardianStudentIds: [], coordinatorInstitutionIds: [],
  teacherAssignments: [
    { institutionId: "school-1", classId: "class-7a", subjectId: "matematica" },
    { institutionId: "school-1", classId: "class-7a", subjectId: "geografia" },
  ],
};
const otherTeacher: SessionContext = { ...teacher, userId: "prof-2", teacherAssignments: [{ institutionId: "school-1", classId: "class-7a", subjectId: "historia" }] };
const coordinator: SessionContext = { ...teacher, userId: "coord-1", roles: ["coordenador"], teacherAssignments: [], coordinatorInstitutionIds: ["school-1"] };
const student: SessionContext = { ...teacher, userId: "aluno-1", roles: ["aluno"], studentId: "aluno-1", teacherAssignments: [] };
const scope = { classId: "class-7a", subjectId: "matematica" as const };

const extracted: GeneratedQuestion = {
  subjectId: "matematica", grade: 7, skillCodes: ["EF07MA04"], difficulty: "facil",
  statement: "Quanto é −3 + 8?", options: [{ id: "a", text: "5" }, { id: "b", text: "−11" }], correctOptionId: "b",
  explanation: "−3 + 8 = 5.", hint: "Use a reta numérica.",
};

class FakeGateway implements ContentExtractionGateway {
  texts: unknown[] = [];
  documents: DocumentExtractionInput[] = [];
  constructor(private readonly output: () => Promise<unknown[] | ExtractionReport> = async () => [extracted]) {}
  async extractQuestionsReport(input: TextExtractionInput | DocumentExtractionInput) {
    if ("dataBase64" in input) this.documents.push(input);
    else this.texts.push(input);
    const result = await this.output();
    return (Array.isArray(result) ? { questions: result, discarded: 0, issues: [] } : result) as ExtractionReport;
  }
}

function setup(
  gateway: ContentExtractionGateway = new FakeGateway(),
  options: { quota?: ImportQuota; publisher?: ActivityPublisher; readDocx?: DocxTextReader } = {},
) {
  let counter = 0;
  const publisher = new InMemoryActivityPublisher();
  const service = new ContentService(
    new InMemoryContentRepository(),
    new InMemoryClassDirectory([
      { institutionId: "school-1", id: "class-7a", name: "7º A", grade: 7 },
      { institutionId: "school-1", id: "class-8b", name: "8º B", grade: 8 },
      { institutionId: "school-2", id: "class-x", name: "Outra", grade: 7 },
    ]),
    gateway,
    options.publisher ?? publisher,
    () => new Date("2026-10-31T12:00:00Z"),
    () => `q-${++counter}`,
    options.quota,
    options.readDocx,
  );
  return { service, publisher, gateway };
}

async function rejects(promise: Promise<unknown>, status: number, code?: string) {
  const error = await promise.then(() => null, (reason: unknown) => reason);
  expect(error).toBeInstanceOf(ContentError);
  expect((error as ContentError).status).toBe(status);
  if (code) expect((error as ContentError).code).toBe(code);
}

describe("ContentService authorization", () => {
  it("lists only the teacher's assignments and every class for the coordinator", async () => {
    const { service } = setup();
    expect(await service.listScopes(teacher)).toEqual([
      { classId: "class-7a", className: "7º A", grade: 7, subjectId: "matematica" },
      { classId: "class-7a", className: "7º A", grade: 7, subjectId: "geografia" },
    ]);
    const scopes = await service.listScopes(coordinator);
    expect(scopes).toHaveLength(12);
    expect(scopes.every((item) => item.classId !== "class-x")).toBe(true);
  });

  it("blocks students, unassigned subjects and classes from another school", async () => {
    const { service } = setup();
    await rejects(service.listScopes(student), 403);
    await rejects(service.list(otherTeacher, scope), 403);
    await rejects(service.importText(teacher, { classId: "class-7a", subjectId: "historia", text: "1) Pergunta qualquer com alternativas a b c" }), 403);
    await rejects(service.list({ ...coordinator }, { classId: "class-x", subjectId: "matematica" }), 404);
  });

  it("hides drafts of other teachers behind 404", async () => {
    const { service } = setup();
    const { drafts: [draft] } = await service.importText(teacher, { ...scope, text: "1) Quanto é −3 + 8? a) 5 b) −11 Gabarito a" });
    await rejects(service.publish(otherTeacher, draft.id), 404);
    await rejects(service.updateDraft(otherTeacher, draft.id, { version: 1, reviewed: true, body: extracted }), 404);
    expect((await service.list(coordinator, scope)).drafts).toHaveLength(1);
  });
});

describe("ContentService import", () => {
  it("sends only text, subject and grade to the gateway and stores unreviewed drafts", async () => {
    const gateway = new FakeGateway();
    const { service } = setup(gateway);
    const result = await service.importText(teacher, { ...scope, text: "1) Quanto é −3 + 8? a) 5 b) −11 Gabarito a" });
    expect(gateway.texts).toEqual([{ text: "1) Quanto é −3 + 8? a) 5 b) −11 Gabarito a", subjectId: "matematica", grade: 7 }]);
    expect(result.rejected).toBe(0);
    expect(result.drafts[0]).toMatchObject({
      id: "q-1", rootQuestionId: "q-1", sourceType: "original", status: "rascunho", reviewed: false,
      answerKeySource: "ia", origin: { kind: "texto" }, createdBy: "prof-1", classId: "class-7a",
    });
  });

  it("drops model output for another subject, another grade or with invalid fields", async () => {
    const gateway = new FakeGateway(async () => [
      extracted,
      { ...extracted, subjectId: "geografia", skillCodes: ["EF07GE11"] },
      { ...extracted, grade: 8, skillCodes: ["EF08MA01"] },
      { ...extracted, correctOptionId: "z" },
      { ...extracted, studentId: "x" },
    ]);
    const { service } = setup(gateway);
    const result = await service.importText(teacher, { ...scope, text: "texto da lista com várias questões" });
    expect(result.drafts).toHaveLength(1);
    expect(result.rejected).toBe(4);
  });

  it("adds what the gateway discarded to rejected and keeps the reasons", async () => {
    const gateway = new FakeGateway(async () => ({
      questions: [extracted], discarded: 6,
      issues: [{ index: 1, reason: "Gabarito não corresponde a uma alternativa." }, { index: 2, reason: "Questão repetida no documento." }],
    }));
    const result = await setup(gateway).service.importText(teacher, { ...scope, text: "lista com dez questões para ler" });
    expect(result).toMatchObject({ rejected: 6, missingSkills: 0 });
    expect(result.drafts).toHaveLength(1);
    expect(result.rejectedReasons).toEqual(["Gabarito não corresponde a uma alternativa.", "Questão repetida no documento."]);
    const none = new FakeGateway(async () => ({ questions: [], discarded: 3, issues: [{ index: 0, reason: "Formato de questão incompleto." }] }));
    const error = await setup(none).service.importText(teacher, { ...scope, text: "lista com três questões ruins" })
      .then((): never => { throw new Error("expected failure"); }, (reason: unknown) => reason as ContentError);
    expect(error).toMatchObject({ code: "NO_QUESTIONS_FOUND", status: 422 });
    expect(error.message).toContain("3 trecho(s)");
    expect(error.message).toContain("Formato de questão incompleto.");
  });

  it("keeps questions without a BNCC code as drafts that cannot be saved or published without one", async () => {
    const { service } = setup(new FakeGateway(async () => [{ ...extracted, skillCodes: [] }]));
    const result = await service.importText(teacher, { ...scope, text: "lista sem códigos da BNCC" });
    expect(result.missingSkills).toBe(1);
    const [draft] = result.drafts;
    expect(draft.body.skillCodes).toEqual([]);
    const error = await service.updateDraft(teacher, draft.id, { version: 1, reviewed: true, body: { ...extracted, skillCodes: [] } })
      .then((): never => { throw new Error("expected failure"); }, (reason: unknown) => reason as ContentError);
    expect(error).toMatchObject({ code: "INVALID_QUESTION", status: 422 });
    expect(error.issues).toEqual([{ path: "skillCodes", message: "Informe pelo menos uma habilidade BNCC." }]);
    await rejects(service.publish(teacher, draft.id), 422, "REVIEW_REQUIRED");
    await service.updateDraft(teacher, draft.id, { version: 1, reviewed: true, body: extracted });
    expect(await service.publish(teacher, draft.id)).toMatchObject({ status: "publicada" });
  });

  it("limits AI reads per user per day and one at a time", async () => {
    const quota = new InMemoryImportQuota(2);
    const failing = new FakeGateway(async () => { throw new Error("timeout"); });
    const { service } = setup(failing, { quota });
    const text = { ...scope, text: "texto da lista com questões" };
    await rejects(service.importText(teacher, text), 503, "AI_PROVIDER_ERROR");
    await rejects(service.importText(teacher, text), 503, "AI_PROVIDER_ERROR");
    await rejects(service.importText(teacher, text), 429, "AI_RATE_LIMITED");
    await rejects(service.importText(otherTeacher, { classId: "class-7a", subjectId: "historia", text: text.text }), 503, "AI_PROVIDER_ERROR");
    await rejects(service.importText(student, text), 403);

    let finish: (value: unknown[]) => void = () => undefined;
    let calls = 0;
    const slow = new FakeGateway(() => calls++ === 0 ? new Promise<unknown[]>((resolve) => { finish = resolve; }) : Promise.resolve([extracted]));
    const busy = setup(slow, { quota: new InMemoryImportQuota(5) }).service;
    const first = busy.importText(teacher, text);
    for (let tick = 0; tick < 20 && !slow.texts.length; tick++) await new Promise((resolve) => setTimeout(resolve, 0));
    await rejects(busy.importText(teacher, text), 429, "AI_RATE_LIMITED");
    finish([extracted]);
    expect((await first).drafts).toHaveLength(1);
    expect((await busy.importText(teacher, text)).drafts).toHaveLength(1);
  });

  it("returns 422 when nothing valid comes back", async () => {
    const { service } = setup(new FakeGateway(async () => []));
    await rejects(service.importText(teacher, { ...scope, text: "texto sem nenhuma questão aqui" }), 422, "NO_QUESTIONS_FOUND");
  });

  it("maps a disabled gateway and provider failures to 503", async () => {
    const disabled = new FakeGateway(async () => { const error = new Error("off"); error.name = "AiNotConfiguredError"; throw error; });
    await rejects(setup(disabled).service.importText(teacher, { ...scope, text: "texto da lista com questões" }), 503, "AI_NOT_CONFIGURED");
    const failing = new FakeGateway(async () => { throw new Error("timeout"); });
    await rejects(setup(failing).service.importText(teacher, { ...scope, text: "texto da lista com questões" }), 503, "AI_PROVIDER_ERROR");
    await rejects(setup(disabled).service.importFile(teacher, { ...scope, fileName: "a.pdf", mimeType: "application/pdf", bytes: new TextEncoder().encode("%PDF-1.4") }), 503, "AI_NOT_CONFIGURED");
  });

  it("sends PDF bytes as base64 and records the file name", async () => {
    const gateway = new FakeGateway();
    const { service } = setup(gateway);
    const bytes = new TextEncoder().encode("%PDF-1.4 conteudo");
    const result = await service.importFile(teacher, { ...scope, fileName: "lista.pdf", mimeType: "application/pdf", bytes });
    expect(gateway.documents[0]).toEqual({ mimeType: "application/pdf", dataBase64: btoa("%PDF-1.4 conteudo"), subjectId: "matematica", grade: 7 });
    expect(result.drafts[0].origin).toEqual({ kind: "pdf", fileName: "lista.pdf" });
  });

  it("reads .docx as text and records the file name", async () => {
    const gateway = new FakeGateway();
    const { service } = setup(gateway, { readDocx: async () => "1) Quanto é −3 + 8? a) 5 b) −11 Gabarito a" });
    const result = await service.importFile(teacher, { ...scope, fileName: "lista.docx", mimeType: "", bytes: docx(["ignorado pelo leitor falso"]) });
    expect(gateway.texts).toEqual([{ text: "1) Quanto é −3 + 8? a) 5 b) −11 Gabarito a", subjectId: "matematica", grade: 7 }]);
    expect(gateway.documents).toHaveLength(0);
    expect(result.drafts[0].origin).toEqual({ kind: "docx", fileName: "lista.docx" });
  });

  it("refuses Word without a reader and old .doc before calling the gateway", async () => {
    const gateway = new FakeGateway();
    const { service } = setup(gateway);
    await rejects(service.importFile(teacher, { ...scope, fileName: "lista.docx", mimeType: "", bytes: docx(["x"]) }), 415, "WORD_NOT_SUPPORTED");
    await rejects(service.importFile(teacher, { ...scope, fileName: "antiga.doc", mimeType: "", bytes: new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]) }), 415, "WORD_NOT_SUPPORTED");
    expect(gateway.texts).toHaveLength(0);
    expect(gateway.documents).toHaveLength(0);
  });

  it("imports a demo example only for the matching grade and subject", async () => {
    const { service } = setup();
    const { drafts: [draft] } = await service.importExample(teacher, { ...scope, exampleId: "exemplo-7-ma-01" });
    expect(draft).toMatchObject({ answerKeySource: "exemplo", reviewed: false, origin: { kind: "exemplo", exampleId: "exemplo-7-ma-01" } });
    await rejects(service.importExample(teacher, { ...scope, exampleId: "exemplo-7-ge-01" }), 404);
  });
});

describe("ContentService review and publication", () => {
  async function draftFor(service: ContentService) {
    return (await service.importText(teacher, { ...scope, text: "1) Quanto é −3 + 8? a) 5 b) −11 Gabarito a" })).drafts[0];
  }

  it("requires review and a teacher-confirmed answer key before publishing", async () => {
    const { service, publisher } = setup();
    const draft = await draftFor(service);
    await rejects(service.publish(teacher, draft.id), 422, "REVIEW_REQUIRED");
    const saved = await service.updateDraft(teacher, draft.id, { version: 1, reviewed: true, body: { ...extracted, correctOptionId: "a" } });
    expect(saved).toMatchObject({ version: 2, reviewed: true, answerKeySource: "professor" });
    const published = await service.publish(teacher, draft.id);
    expect(published).toMatchObject({ status: "publicada", publishedAt: "2026-10-31T12:00:00.000Z" });
    expect([...publisher.activities.values()]).toEqual([{
      classId: "class-7a", rootQuestionId: draft.id, contentVersion: 2, reviewed: true, body: { ...extracted, correctOptionId: "a" },
    }]);
    expect(await service.publish(teacher, draft.id)).toMatchObject({ status: "publicada" });
    await rejects(service.updateDraft(teacher, draft.id, { version: 2, reviewed: true, body: extracted }), 409, "ALREADY_PUBLISHED");
    const listing = await service.list(teacher, scope);
    expect([listing.drafts.length, listing.published.length]).toEqual([0, 1]);
  });

  it("revalidates the edited body on the server", async () => {
    const { service } = setup();
    const draft = await draftFor(service);
    const error = await service.updateDraft(teacher, draft.id, {
      version: 1, reviewed: true, body: { ...extracted, skillCodes: ["EF07GE11"], options: [{ id: "a", text: "5" }, { id: "b", text: "5" }] },
    }).then((): never => { throw new Error("expected failure"); }, (reason: unknown) => reason as ContentError);
    expect(error).toBeInstanceOf(ContentError);
    expect(error.status).toBe(422);
    expect(error.issues?.map((issue) => issue.path)).toEqual(expect.arrayContaining(["options", "skillCodes.0"]));
    await rejects(service.updateDraft(teacher, draft.id, { version: 1, reviewed: true, body: { ...extracted, grade: 8, skillCodes: ["EF08MA01"] } }), 422, "GRADE_MISMATCH");
    await expect(service.updateDraft(teacher, draft.id, { version: 1, reviewed: true, body: extracted, studentId: "x" })).rejects.toBeInstanceOf(z.ZodError);
  });

  it("detects stale versions and moving to a subject the teacher does not teach", async () => {
    const { service } = setup();
    const draft = await draftFor(service);
    await service.updateDraft(teacher, draft.id, { version: 1, reviewed: false, body: extracted });
    await rejects(service.updateDraft(teacher, draft.id, { version: 1, reviewed: true, body: extracted }), 409, "VERSION_CONFLICT");
    await rejects(service.updateDraft(teacher, draft.id, {
      version: 2, reviewed: true, body: { ...extracted, subjectId: "historia", skillCodes: ["EF07HI01"] },
    }), 403);
    const moved = await service.updateDraft(teacher, draft.id, { version: 2, reviewed: true, body: { ...extracted, subjectId: "geografia", skillCodes: ["EF07GE11"] } });
    expect(moved.body.subjectId).toBe("geografia");
    expect((await service.list(teacher, { classId: "class-7a", subjectId: "geografia" })).drafts).toHaveLength(1);
  });

  it("maps publisher errors that carry code and status", async () => {
    const failingPublisher = { delivery: "aprendizagem" as const, registerActivity: async () => { throw Object.assign(new Error("O ano da questão difere do ano da turma."), { code: "GRADE_MISMATCH", status: 422 }); } };
    const local = new ContentService(
      new InMemoryContentRepository(),
      new InMemoryClassDirectory([{ institutionId: "school-1", id: "class-7a", name: "7º A", grade: 7 }]),
      new FakeGateway(), failingPublisher, undefined, () => "q-x",
    );
    const draft = (await local.importText(teacher, { ...scope, text: "texto com uma questão completa" })).drafts[0];
    await local.updateDraft(teacher, draft.id, { version: 1, reviewed: true, body: extracted });
    await rejects(local.publish(teacher, draft.id), 422, "GRADE_MISMATCH");
    expect((await local.list(teacher, scope)).drafts[0].status).toBe("rascunho");
  });

  it("reports the delivery mode and refuses publishing when it is not connected", async () => {
    expect((await setup().service.list(teacher, scope)).delivery).toBe("memoria");
    const { service } = setup(new FakeGateway(), { publisher: new UnconnectedActivityPublisher() });
    expect((await service.list(teacher, scope)).delivery).toBe("desligada");
    const draft = await draftFor(service);
    await service.updateDraft(teacher, draft.id, { version: 1, reviewed: true, body: extracted });
    await rejects(service.publish(teacher, draft.id), 503, "PUBLISH_NOT_CONNECTED");
    expect((await service.list(teacher, scope)).drafts[0].status).toBe("rascunho");
  });

  it("deletes drafts but not published questions", async () => {
    const { service } = setup();
    const draft = await draftFor(service);
    expect(await service.deleteDraft(teacher, draft.id)).toEqual({ id: draft.id });
    await rejects(service.deleteDraft(teacher, draft.id), 404);
  });
});

describe("demo examples and inventory", () => {
  it("are valid questions with compatible skills", () => {
    for (const example of DEMO_EXAMPLES) expect(GeneratedQuestionSchema.safeParse(example.body).success, example.id).toBe(true);
    expect(new Set(DEMO_EXAMPLES.map((example) => example.id)).size).toBe(DEMO_EXAMPLES.length);
  });

  it("reports real counts against the 240 target", () => {
    const inventory = buildContentInventory();
    expect(inventory.rows).toHaveLength(24);
    expect(inventory.target).toBe(240);
    expect(TARGET_TOTAL).toBe(240);
    expect(inventory.totalReviewed).toBe(0);
    expect(inventory.totalDemoExamples).toBe(11);
    expect(inventory.rows.filter((row) => row.demoExamples > 0).map((row) => [row.grade, row.subjectId, row.demoExamples])).toEqual([
      [7, "matematica", 6], [7, "geografia", 5],
    ]);
  });
});
