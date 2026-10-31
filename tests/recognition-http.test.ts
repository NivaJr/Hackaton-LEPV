import { describe, expect, it } from "vitest";
import type { SessionContext } from "@/contracts";
import { createRecognitionHttpHandler } from "@/features/recognition/http";
import { RecognitionError } from "@/features/recognition/model";
import { createFixture, grantBody, student, teacher } from "./recognition-fixtures";

function setup(session: SessionContext | null) {
  const fixture = createFixture();
  let current = session;
  const handle = createRecognitionHttpHandler({
    getSessionContext: async () => current,
    getActorName: async () => "Marta Ramos",
    createService: () => fixture.service,
  });
  return { ...fixture, handle, as(next: SessionContext | null) { current = next; } };
}

const post = (path: string, body: unknown, headers: Record<string, string> = {}) => new Request(`http://localhost${path}`, {
  method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body),
});
const get = (path: string) => new Request(`http://localhost${path}`);

describe("rotas de reconhecimento", () => {
  it("responde 401 sem sessão", async () => {
    const { handle } = setup(null);
    const response = await handle(get("/api/notifications"), { kind: "notifications" });
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: { code: "UNAUTHENTICATED", message: expect.any(String) } });
  });

  it("concede e devolve resultado por aluno com cabeçalho privado", async () => {
    const { handle } = setup(teacher());
    const response = await handle(post("/api/recognition", grantBody({ studentIds: ["student-ana", "student-caio"] })), { kind: "grant" });
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    const data = await response.json();
    expect(data.results.map((item: { status: string }) => item.status)).toEqual(["concedido", "sem_vinculo"]);
  });

  it("rejeita pontos enviados pelo cliente com 422", async () => {
    const { handle, store } = setup(teacher());
    const response = await handle(post("/api/recognition", grantBody({ points: 1000 })), { kind: "grant" });
    expect(response.status).toBe(422);
    expect(store.recognitions).toHaveLength(0);
  });

  it("explica quando falta a nota do motivo outro", async () => {
    const { handle } = setup(teacher());
    const response = await handle(post("/api/recognition", grantBody({ reason: "outro" })), { kind: "grant" });
    expect(response.status).toBe(422);
    expect((await response.json()).error.message).toBe("Escreva o motivo em poucas palavras.");
  });

  it("bloqueia origem diferente em POST", async () => {
    const { handle } = setup(teacher());
    const response = await handle(post("/api/recognition", grantBody(), { origin: "https://evil.example" }), { kind: "grant" });
    expect(response.status).toBe(403);
  });

  it("aluno não premia", async () => {
    const { handle } = setup(student());
    const response = await handle(post("/api/recognition", grantBody()), { kind: "grant" });
    expect(response.status).toBe(403);
  });

  it("lista alunos da turma e lê os elogios do próprio aluno", async () => {
    const harness = setup(teacher());
    const roster = await harness.handle(get("/api/recognition/students?classId=class-7a"), { kind: "students" });
    expect((await roster.json()).students).toHaveLength(2);
    await harness.handle(post("/api/recognition", grantBody()), { kind: "grant" });
    harness.as(student());
    const own = await harness.handle(get("/api/recognition"), { kind: "list" });
    expect((await own.json()).recognitions).toHaveLength(1);
    const other = await harness.handle(get("/api/recognition?studentId=student-bruno"), { kind: "list" });
    expect(other.status).toBe(404);
  });

  it("lista avisos e marca como lido", async () => {
    const harness = setup(teacher());
    await harness.handle(post("/api/recognition", grantBody()), { kind: "grant" });
    harness.as(student());
    const list = await (await harness.handle(get("/api/notifications"), { kind: "notifications" })).json();
    expect(list.unreadCount).toBe(1);
    const id = list.notifications[0].id;
    const read = await harness.handle(post(`/api/notifications/${id}/read`, {}), { kind: "markRead", notificationId: id });
    expect((await read.json()).notification.read).toBe(true);
    const missing = await harness.handle(post("/api/notifications/nao-existe/read", {}), { kind: "markRead", notificationId: "nao-existe" });
    expect(missing.status).toBe(404);
  });

  it("propaga 503 quando o armazenamento não existe", async () => {
    const handle = createRecognitionHttpHandler({
      getSessionContext: async () => teacher(),
      getActorName: async () => "Marta",
      createService: () => { throw new RecognitionError("STORE_UNAVAILABLE", "Falta aplicar a migração.", 503); },
    });
    const response = await handle(get("/api/notifications"), { kind: "notifications" });
    expect(response.status).toBe(503);
    expect((await response.json()).error.code).toBe("STORE_UNAVAILABLE");
  });
});
