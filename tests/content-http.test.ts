import { describe, expect, it } from "vitest";
import type { GeneratedQuestion, SessionContext } from "@/contracts";
import { InMemoryActivityPublisher, InMemoryClassDirectory, InMemoryContentRepository } from "@/features/content/memory";
import { createContentHttpHandler } from "@/features/content/server/http";
import { ContentService } from "@/features/content/service";

const teacher: SessionContext = {
  userId: "prof-1", roles: ["professor"], institutionId: "school-1", guardianStudentIds: [], coordinatorInstitutionIds: [],
  teacherAssignments: [{ institutionId: "school-1", classId: "class-7a", subjectId: "matematica" }],
};
const student: SessionContext = { ...teacher, roles: ["aluno"], studentId: "prof-1", teacherAssignments: [] };
const question: GeneratedQuestion = {
  subjectId: "matematica", grade: 7, skillCodes: ["EF07MA04"], difficulty: "facil",
  statement: "Quanto é −3 + 8?", options: [{ id: "a", text: "5" }, { id: "b", text: "−11" }], correctOptionId: "a",
  explanation: "−3 + 8 = 5.", hint: "Use a reta numérica.",
};

function handler(actor: SessionContext | null, ai: "ok" | "disabled" = "ok") {
  const service = new ContentService(
    new InMemoryContentRepository(),
    new InMemoryClassDirectory([{ institutionId: "school-1", id: "class-7a", name: "7º A", grade: 7 }]),
    {
      extractQuestionsReport: async () => {
        if (ai === "disabled") throw Object.assign(new Error("off"), { name: "AiNotConfiguredError" });
        return { questions: [question], discarded: 0, issues: [] };
      },
    },
    new InMemoryActivityPublisher(),
  );
  return createContentHttpHandler({ getSessionContext: async () => actor, createService: () => service });
}

const base = "http://localhost/api/content";
const json = (method: string, body: unknown) => ({ method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

/** Browsers send Content-Length with FormData; a Request built in Node does not, so add it here. */
async function multipart(form: FormData) {
  const probe = new Request(`${base}/imports`, { method: "POST", body: form });
  const bytes = await probe.arrayBuffer();
  return new Request(`${base}/imports`, {
    method: "POST", body: bytes,
    headers: { "content-type": probe.headers.get("content-type") ?? "", "content-length": String(bytes.byteLength) },
  });
}

describe("content HTTP handler", () => {
  it("returns 401 without session and 403 for students, always private", async () => {
    const anonymous = await handler(null)(new Request(`${base}/scopes`), ["scopes"]);
    expect(anonymous.status).toBe(401);
    expect(anonymous.headers.get("cache-control")).toBe("private, no-store");
    expect(await anonymous.json()).toEqual({ error: { code: "UNAUTHENTICATED", message: expect.any(String) } });
    expect((await handler(student)(new Request(`${base}/scopes`), ["scopes"])).status).toBe(403);
  });

  it("runs import, review and publish", async () => {
    const handle = handler(teacher);
    const created = await handle(new Request(`${base}/imports`, json("POST", { classId: "class-7a", subjectId: "matematica", text: "1) Quanto é −3 + 8? a) 5 b) −11" })), ["imports"]);
    expect(created.status).toBe(201);
    const { drafts: [draft] } = await created.json();
    const saved = await handle(new Request(`${base}/drafts/${draft.id}`, json("PUT", { version: 1, reviewed: true, body: question })), ["drafts", draft.id]);
    expect(saved.status).toBe(200);
    const published = await handle(new Request(`${base}/drafts/${draft.id}/publish`, json("POST", {})), ["drafts", draft.id, "publish"]);
    expect((await published.json()).question.status).toBe("publicada");
    const listing = await handle(new Request(`${base}/questions?classId=class-7a&subjectId=matematica`), ["questions"]);
    const body = await listing.json();
    expect(body.published[0].body.correctOptionId).toBe("a");
    expect(body.storage).toBe("memoria");
  });

  it("answers 415 for old .doc uploads and 413 for oversized bodies", async () => {
    const handle = handler(teacher);
    const form = new FormData();
    form.set("classId", "class-7a");
    form.set("subjectId", "matematica");
    form.set("file", new File([new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])], "antiga.doc"));
    const word = await handle(await multipart(form), ["imports"]);
    expect(word.status).toBe(415);
    expect((await word.json()).error.message).toMatch(/\.docx/);
    const big = await handle(new Request(`${base}/imports`, {
      method: "POST", headers: { "content-type": "multipart/form-data; boundary=x", "content-length": String(11 * 1024 * 1024) }, body: "--x--",
    }), ["imports"]);
    expect(big.status).toBe(413);
  });

  it("accepts a PDF upload", async () => {
    const form = new FormData();
    form.set("classId", "class-7a");
    form.set("subjectId", "matematica");
    form.set("file", new File([new TextEncoder().encode("%PDF-1.4 lista")], "lista.pdf", { type: "application/pdf" }));
    const response = await handler(teacher)(await multipart(form), ["imports"]);
    expect(response.status).toBe(201);
    expect((await response.json()).drafts[0].origin).toEqual({ kind: "pdf", fileName: "lista.pdf" });
  });

  it("refuses non-staff before reading the body and multipart without Content-Length", async () => {
    let read = false;
    const body = new ReadableStream({ pull(controller) { read = true; controller.enqueue(new Uint8Array(8)); controller.close(); } }, { highWaterMark: 0 });
    const request = new Request(`${base}/imports`, {
      method: "POST", headers: { "content-type": "multipart/form-data; boundary=x" }, body, duplex: "half",
    } as RequestInit);
    const refused = await handler(student)(request, ["imports"]);
    expect(refused.status).toBe(403);
    expect(read).toBe(false);
    const form = new FormData();
    form.set("file", new File([new TextEncoder().encode("%PDF-1.4 lista")], "lista.pdf", { type: "application/pdf" }));
    const chunked = await handler(teacher)(new Request(`${base}/imports`, { method: "POST", body: form }), ["imports"]);
    expect(chunked.status).toBe(411);
  });

  it("maps disabled AI to 503, bad input to 422, unknown routes to 404 and foreign origin to 403", async () => {
    const disabled = await handler(teacher, "disabled")(new Request(`${base}/imports`, json("POST", { classId: "class-7a", subjectId: "matematica", text: "texto da lista com questões" })), ["imports"]);
    expect(disabled.status).toBe(503);
    expect((await disabled.json()).error.code).toBe("AI_NOT_CONFIGURED");
    const invalid = await handler(teacher)(new Request(`${base}/imports`, json("POST", { classId: "class-7a", subjectId: "matematica", text: "x", role: "coordenador" })), ["imports"]);
    expect(invalid.status).toBe(422);
    expect((await handler(teacher)(new Request(`${base}/nada`), ["nada"])).status).toBe(404);
    const foreign = await handler(teacher)(new Request(`${base}/imports`, { ...json("POST", {}), headers: { "content-type": "application/json", origin: "https://evil.example" } }), ["imports"]);
    expect(foreign.status).toBe(403);
  });
});
