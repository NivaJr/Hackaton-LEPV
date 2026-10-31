import { randomUUID } from "node:crypto";
import type { SessionContext } from "@/contracts";
import { MAX_REPORT_BYTES, ReportLabelSchema, SchoolReportError } from "./model";
import type { SchoolReportStore } from "./ports";

const PDF_SIGNATURE = "%PDF-";

const notFound = () => new SchoolReportError("NOT_FOUND", "Aluno não encontrado.", 404);

function isCoordinator(actor: SessionContext) {
  return actor.roles.includes("coordenador") && actor.coordinatorInstitutionIds.includes(actor.institutionId);
}

/** School reports are official documents: only the coordination publishes; the others only read. */
export class SchoolReportService {
  constructor(private readonly store: SchoolReportStore, private readonly newId: () => string = randomUUID) {}

  private async assertCoordinatorOf(actor: SessionContext, studentId: string) {
    if (!isCoordinator(actor)) throw new SchoolReportError("FORBIDDEN", "Esta operação é exclusiva da coordenação da escola.", 403);
    if (!await this.store.isStudentOfSchool(actor.institutionId, studentId)) throw notFound();
  }

  private teachesClass(actor: SessionContext, classId: string) {
    return actor.roles.includes("professor") && actor.teacherAssignments.some((item) => item.institutionId === actor.institutionId && item.classId === classId);
  }

  /** Unlinked IDs get the same 404 as nonexistent ones. */
  private async assertReader(actor: SessionContext, studentId: string) {
    if (actor.roles.includes("aluno") && actor.studentId === studentId) return;
    if (actor.roles.includes("responsavel") && actor.guardianStudentIds.includes(studentId)) return;
    if (isCoordinator(actor)) return this.assertCoordinatorOf(actor, studentId);
    const classId = actor.roles.includes("professor") ? await this.store.activeClassId(actor.institutionId, studentId) : null;
    if (!classId || !this.teachesClass(actor, classId)) throw notFound();
  }

  async classStudents(actor: SessionContext, classId: string) {
    if (!this.teachesClass(actor, classId)) throw new SchoolReportError("NOT_FOUND", "Turma não encontrada.", 404);
    return { students: await this.store.listClassStudents(actor.institutionId, classId) };
  }

  async list(actor: SessionContext, studentId: string) {
    await this.assertReader(actor, studentId);
    return { reports: await this.store.list(actor.institutionId, studentId) };
  }

  async upload(actor: SessionContext, studentId: string, input: { label: unknown; bytes: Uint8Array }) {
    await this.assertCoordinatorOf(actor, studentId);
    const label = ReportLabelSchema.parse(input.label);
    if (input.bytes.length === 0) throw new SchoolReportError("INVALID_FILE", "O arquivo está vazio.", 422);
    if (input.bytes.length > MAX_REPORT_BYTES) throw new SchoolReportError("FILE_TOO_LARGE", "O arquivo excede o limite de 4 MB.", 413);
    if (new TextDecoder().decode(input.bytes.subarray(0, PDF_SIGNATURE.length)) !== PDF_SIGNATURE) {
      throw new SchoolReportError("INVALID_FILE", "Envie um arquivo PDF.", 422);
    }
    return this.store.save(actor.institutionId, studentId, { id: this.newId(), label, bytes: input.bytes });
  }

  async read(actor: SessionContext, studentId: string, fileId: string) {
    await this.assertReader(actor, studentId);
    const bytes = await this.store.read(actor.institutionId, studentId, fileId);
    if (!bytes) throw new SchoolReportError("NOT_FOUND", "Boletim não encontrado.", 404);
    return bytes;
  }

  async remove(actor: SessionContext, studentId: string, fileId: string) {
    await this.assertCoordinatorOf(actor, studentId);
    if (!await this.store.remove(actor.institutionId, studentId, fileId)) throw new SchoolReportError("NOT_FOUND", "Boletim não encontrado.", 404);
    return { removed: true };
  }
}
