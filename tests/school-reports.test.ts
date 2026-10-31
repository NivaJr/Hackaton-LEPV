import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionContext } from "@/contracts";
import { createSchoolReportHttpHandler } from "@/features/school-reports/http";
import { MAX_REPORT_BYTES, type SchoolReportFile } from "@/features/school-reports/model";
import type { SchoolReportStore } from "@/features/school-reports/ports";
import { createSupabaseSchoolReportStore, reportObjectName } from "@/features/school-reports/server/supabase-store";
import { SchoolReportService } from "@/features/school-reports/service";

const SCHOOL = "11111111-1111-4111-8111-111111111111";
const OTHER_SCHOOL = "22222222-2222-4222-8222-222222222222";
const child = randomUUID();
const stranger = randomUUID();
const base = { userId: randomUUID(), institutionId: SCHOOL, teacherAssignments: [], guardianStudentIds: [], coordinatorInstitutionIds: [] };
const coordinator: SessionContext = { ...base, roles: ["coordenador"], coordinatorInstitutionIds: [SCHOOL] };
const otherCoordinator: SessionContext = { ...coordinator, institutionId: OTHER_SCHOOL, coordinatorInstitutionIds: [OTHER_SCHOOL] };
const guardian: SessionContext = { ...base, roles: ["responsavel"], guardianStudentIds: [child] };
const otherGuardian: SessionContext = { ...base, roles: ["responsavel"], guardianStudentIds: [stranger] };
const student: SessionContext = { ...base, roles: ["aluno"], userId: child, studentId: child };
const teacher: SessionContext = { ...base, roles: ["professor"] };
const pdf = new TextEncoder().encode("%PDF-1.7 boletim");

class MemoryStore implements SchoolReportStore {
  files = new Map<string, { report: SchoolReportFile; bytes: Uint8Array; schoolId: string }>();
  async isStudentOfSchool(schoolId: string, studentId: string) { return schoolId === SCHOOL && studentId === child; }
  async list(schoolId: string, studentId: string) {
    return [...this.files].filter(([key, item]) => key.startsWith(studentId) && item.schoolId === schoolId).map(([, item]) => item.report);
  }
  async save(schoolId: string, studentId: string, { id, label, bytes }: { id: string; label: string; bytes: Uint8Array }) {
    const report = { id, label, uploadedAt: "2026-10-31T12:00:00.000Z", sizeBytes: bytes.length };
    this.files.set(`${studentId}:${id}`, { report, bytes, schoolId });
    return report;
  }
  async read(schoolId: string, studentId: string, fileId: string) {
    const item = this.files.get(`${studentId}:${fileId}`);
    return item?.schoolId === schoolId ? item.bytes : null;
  }
  async remove(_schoolId: string, studentId: string, fileId: string) { return this.files.delete(`${studentId}:${fileId}`); }
}

let store: MemoryStore;
let service: SchoolReportService;
beforeEach(() => { store = new MemoryStore(); service = new SchoolReportService(store); });

const upload = (actor: SessionContext, studentId = child, bytes = pdf, label: unknown = "Boletim 2026") => service.upload(actor, studentId, { label, bytes });

describe("boletins em PDF", () => {
  it("coordenador envia e responsável confirmado lista e abre", async () => {
    const report = await upload(coordinator);
    expect((await service.list(guardian, child)).reports.map((item) => item.label)).toEqual(["Boletim 2026"]);
    expect(await service.read(guardian, child, report.id)).toEqual(pdf);
  });

  it("só a coordenação da escola envia e remove", async () => {
    const report = await upload(coordinator);
    for (const actor of [guardian, teacher, student]) {
      await expect(upload(actor)).rejects.toMatchObject({ status: 403 });
      await expect(service.remove(actor, child, report.id)).rejects.toMatchObject({ status: 403 });
    }
    await expect(upload(otherCoordinator)).rejects.toMatchObject({ status: 404 });
    await expect(upload(coordinator, stranger)).rejects.toMatchObject({ status: 404 });
    expect(await service.remove(coordinator, child, report.id)).toEqual({ removed: true });
    expect((await service.list(guardian, child)).reports).toEqual([]);
  });

  it("outros perfis recebem o mesmo 404 de aluno inexistente", async () => {
    const report = await upload(coordinator);
    for (const actor of [otherGuardian, teacher, student, otherCoordinator]) {
      await expect(service.list(actor, child)).rejects.toMatchObject({ status: 404 });
      await expect(service.read(actor, child, report.id)).rejects.toMatchObject({ status: 404 });
    }
  });

  it("recusa arquivo que não é PDF, vazio, grande ou sem título", async () => {
    await expect(upload(coordinator, child, new TextEncoder().encode("<html>"))).rejects.toMatchObject({ code: "INVALID_FILE" });
    await expect(upload(coordinator, child, new Uint8Array())).rejects.toMatchObject({ code: "INVALID_FILE" });
    const big = new Uint8Array(MAX_REPORT_BYTES + 1);
    big.set(pdf);
    await expect(upload(coordinator, child, big)).rejects.toMatchObject({ code: "FILE_TOO_LARGE" });
    await expect(upload(coordinator, child, pdf, "   ")).rejects.toThrow();
  });
});

describe("rotas de boletins", () => {
  const handlerFor = (actor: SessionContext | null) => createSchoolReportHttpHandler({ getSessionContext: async () => actor, createService: () => service });
  const url = (path: string) => `https://eai.example/api/school-reports/${path}`;
  const multipart = () => {
    const form = new FormData();
    form.set("label", "Boletim 2026");
    form.set("file", new File([pdf.slice()], "boletim.pdf", { type: "application/pdf" }));
    return { method: "POST", body: form };
  };

  it("exige sessão e serve o PDF sem cache", async () => {
    expect((await handlerFor(null)(new Request(url(`students/${child}`)), ["students", child])).status).toBe(401);
    const created = await handlerFor(coordinator)(new Request(url(`students/${child}`), multipart()), ["students", child]);
    expect(created.status).toBe(201);
    const { id } = await created.json() as SchoolReportFile;
    const file = await handlerFor(guardian)(new Request(url(`students/${child}/files/${id}`)), ["students", child, "files", id]);
    expect(file.headers.get("content-type")).toBe("application/pdf");
    expect(file.headers.get("cache-control")).toContain("no-store");
    expect(new Uint8Array(await file.arrayBuffer())).toEqual(pdf);
  });

  it("recusa upload de outro perfil e de outra origem", async () => {
    expect((await handlerFor(guardian)(new Request(url(`students/${child}`), multipart()), ["students", child])).status).toBe(403);
    const crossSite = new Request(url(`students/${child}`), { ...multipart(), headers: { origin: "https://fora.example", host: "eai.example" } });
    expect((await handlerFor(coordinator)(crossSite, ["students", child])).status).toBe(403);
  });
});

describe("armazenamento privado", () => {
  const id = "33333333-3333-4333-8333-333333333333";
  function adminWith(bucket: Record<string, unknown>, createBucket = vi.fn(async () => ({ error: null }))) {
    return { client: { storage: { from: () => bucket, createBucket } } as unknown as SupabaseClient, createBucket };
  }

  it("preserva títulos com acentos e ignora objetos estranhos", async () => {
    const name = reportObjectName(id, "Boletim 2026 - 1º bimestre");
    const { client } = adminWith({ list: async () => ({ data: [{ name, created_at: "2026-10-31T12:00:00Z", metadata: { size: 10 } }, { name: "outro.txt" }], error: null }) });
    expect(await createSupabaseSchoolReportStore(client).list(SCHOOL, child)).toEqual([{ id, label: "Boletim 2026 - 1º bimestre", uploadedAt: "2026-10-31T12:00:00Z", sizeBytes: 10 }]);
  });

  it("trata bucket ainda inexistente como lista vazia e o cria no primeiro envio privado", async () => {
    const upload = vi.fn().mockResolvedValueOnce({ error: { message: "Bucket not found" } }).mockResolvedValueOnce({ error: null });
    const { client, createBucket } = adminWith({ upload, list: async () => ({ data: null, error: { message: "Bucket not found" } }) });
    const reports = createSupabaseSchoolReportStore(client);
    expect(await reports.list(SCHOOL, child)).toEqual([]);
    await reports.save(SCHOOL, child, { id, label: "Boletim", bytes: pdf });
    expect(createBucket).toHaveBeenCalledWith("boletins", expect.objectContaining({ public: false }));
    expect(upload.mock.calls[1][0]).toBe(`${SCHOOL}/${child}/${reportObjectName(id, "Boletim")}`);
  });
});
