import { randomUUID } from "node:crypto";
import type { Role } from "@/contracts";
import { RosterError, type AccountRecord, type AssignmentRecord, type ClassroomRecord, type EnrollmentRecord, type GuardianLinkRecord, type PersonRecord } from "@/features/roster/model";
import type { AccountDirectory, RosterRepository } from "@/features/roster/ports";

export const SCHOOL = "11111111-1111-4111-8111-111111111111";
export const OTHER_SCHOOL = "22222222-2222-4222-8222-222222222222";

/** Test-only adapters that mirror the constraints of the foundation migration. */
export class MemoryRoster implements RosterRepository {
  audits: Array<{ id: string; schoolId: string; actorId: string; classroomId: string; kind: string; rows: unknown[]; results?: unknown[] }> = [];
  async startImportAudit(schoolId: string, actorId: string, classroomId: string, kind: string, rows: unknown[]) {
    const id = randomUUID();
    this.audits.push({ id, schoolId, actorId, classroomId, kind, rows: structuredClone(rows) });
    return id;
  }
  async finishImportAudit(schoolId: string, actorId: string, id: string, results: unknown[]) {
    const audit = this.audits.find((item) => item.id === id && item.schoolId === schoolId && item.actorId === actorId)!;
    audit.results = structuredClone(results);
  }
  async listImportAudits(schoolId: string) { return this.audits.filter((item) => item.schoolId === schoolId); }
  async transferEnrollment(schoolId: string, enrollmentId: string, classroomId: string, studentId: string) {
    const previous = await this.activeEnrollment(schoolId, studentId);
    const destination = await this.getClassroom(schoolId, classroomId);
    if (!previous || previous.id !== enrollmentId || previous.status !== "active") throw new RosterError("STALE_PREVIEW", "Matrícula alterada.", 409);
    if (!destination || this.failEnrollFor.has(studentId)) {
      this.failEnrollFor.delete(studentId);
      throw new Error("falha simulada antes do commit");
    }
    const moved = { id: randomUUID(), schoolId, classroomId, classroomName: destination.name, studentId, status: "active" };
    previous.status = "transferred";
    this.enrollments.push(moved);
    return moved;
  }
  classrooms: (ClassroomRecord & { schoolId: string })[] = [];
  enrollments: (EnrollmentRecord & { schoolId: string; status: string })[] = [];
  assignments: (AssignmentRecord & { schoolId: string })[] = [];
  people: (PersonRecord & { schoolId: string; role: "aluno" | "professor" | "responsavel" })[] = [];
  links: (GuardianLinkRecord & { schoolId: string })[] = [];
  failEnrollFor = new Set<string>();

  addClassroom(name: string, schoolId = SCHOOL) {
    const classroom = { id: randomUUID(), schoolId, name, grade: 6, schoolYear: 2026 };
    this.classrooms.push(classroom);
    return classroom;
  }
  private active(schoolId: string) {
    return this.enrollments.filter((item) => item.schoolId === schoolId && item.status === "active");
  }
  async listClassrooms(schoolId: string) { return this.classrooms.filter((item) => item.schoolId === schoolId); }
  async getClassroom(schoolId: string, id: string) { return this.classrooms.find((item) => item.id === id && item.schoolId === schoolId) ?? null; }
  async createClassroom(schoolId: string, input: Omit<ClassroomRecord, "id">) {
    if (this.classrooms.some((item) => item.schoolId === schoolId && item.schoolYear === input.schoolYear && item.name === input.name)) {
      throw new RosterError("DUPLICATE", "Este registro já existe.", 409);
    }
    const classroom = { ...input, id: randomUUID(), schoolId };
    this.classrooms.push(classroom);
    return classroom;
  }
  async updateClassroom(schoolId: string, id: string, patch: Partial<ClassroomRecord>) {
    const classroom = await this.getClassroom(schoolId, id);
    return classroom ? Object.assign(classroom, patch) : null;
  }
  async deleteClassroom(schoolId: string, id: string) {
    const before = this.classrooms.length;
    this.classrooms = this.classrooms.filter((item) => !(item.id === id && item.schoolId === schoolId));
    return this.classrooms.length < before;
  }
  async listPeople(schoolId: string, role: "aluno" | "professor" | "responsavel") { return this.people.filter((item) => item.schoolId === schoolId && item.role === role); }
  async listEnrollments(schoolId: string) { return this.active(schoolId); }
  async activeEnrollment(schoolId: string, studentId: string) { return this.active(schoolId).find((item) => item.studentId === studentId) ?? null; }
  async enroll(schoolId: string, classroomId: string, studentId: string) {
    if (this.failEnrollFor.has(studentId)) { this.failEnrollFor.delete(studentId); throw new Error("falha simulada"); }
    if (this.enrollments.some((item) => item.studentId === studentId && item.status === "active")) {
      throw new RosterError("DUPLICATE_ENROLLMENT", "O aluno já tem uma matrícula ativa.", 409);
    }
    const classroom = (await this.getClassroom(schoolId, classroomId))!;
    const enrollment = { id: randomUUID(), schoolId, classroomId, classroomName: classroom.name, studentId, status: "active" };
    this.enrollments.push(enrollment);
    return enrollment;
  }
  async closeEnrollment(schoolId: string, id: string, status: "transferred" | "inactive") {
    const enrollment = this.active(schoolId).find((item) => item.id === id);
    if (enrollment) enrollment.status = status;
    return Boolean(enrollment);
  }
  async reopenEnrollment(schoolId: string, id: string) {
    this.enrollments.find((item) => item.id === id && item.schoolId === schoolId)!.status = "active";
  }
  async listAssignments(schoolId: string) { return this.assignments.filter((item) => item.schoolId === schoolId); }
  async createAssignment(schoolId: string, input: Omit<AssignmentRecord, "id">) {
    const assignment = { ...input, id: randomUUID(), schoolId };
    this.assignments.push(assignment);
    return assignment;
  }
  async deleteAssignment(schoolId: string, id: string) {
    const before = this.assignments.length;
    this.assignments = this.assignments.filter((item) => !(item.id === id && item.schoolId === schoolId));
    return this.assignments.length < before;
  }
  async listGuardianLinks(schoolId: string) { return this.links.filter((item) => item.schoolId === schoolId); }
  async createGuardianLink(schoolId: string, guardianId: string, studentId: string) {
    const existing = this.links.find((item) => item.guardianId === guardianId && item.studentId === studentId);
    if (existing) return existing;
    const link = { id: randomUUID(), schoolId, guardianId, studentId, status: "pending" as GuardianLinkRecord["status"] };
    this.links.push(link);
    return link;
  }
  async setGuardianLinkStatus(schoolId: string, id: string, status: "confirmed" | "revoked") {
    const link = this.links.find((item) => item.id === id && item.schoolId === schoolId);
    return link ? Object.assign(link, { status }) : null;
  }
}

export class MemoryDirectory implements AccountDirectory {
  accounts = new Map<string, AccountRecord>();
  invites: string[] = [];
  failInviteFor = new Set<string>();
  pending = new Set<string>();

  add(email: string, schoolId: string | null, roles: Role[], fullName: string | null = "Pessoa Existente") {
    const userId = randomUUID();
    this.accounts.set(email, { userId, schoolId, fullName, roles });
    return userId;
  }
  async findByEmails(emails: string[]) {
    return new Map([...this.accounts].filter(([email]) => emails.includes(email)));
  }
  async ensureAccount(input: { email: string; fullName: string; role: Role; schoolId: string; userId?: string }) {
    if (this.failInviteFor.has(input.email)) {
      this.failInviteFor.delete(input.email);
      throw new RosterError("PROVISIONING_FAILED", "Não foi possível gerar o link de cadastro.", 502);
    }
    const existing = this.accounts.get(input.email);
    const userId = input.userId ?? existing?.userId ?? randomUUID();
    if (!input.userId && !existing) this.invites.push(input.email);
    this.accounts.set(input.email, { userId, schoolId: input.schoolId, fullName: input.fullName, roles: [input.role] });
    this.pending.add(userId);
    return { userId, accessLink: `https://escola.example/convite?usuario=${userId}` };
  }
  async issuePendingAccessLinks(userIds: string[]) {
    return [...this.accounts].filter(([, account]) => userIds.includes(account.userId) && this.pending.has(account.userId))
      .map(([email, account]) => ({ userId: account.userId, email, accessLink: `https://escola.example/convite?usuario=${account.userId}` }));
  }
  async issueAccessLink(userId: string) {
    if (!this.pending.has(userId)) throw new RosterError("ACCOUNT_ALREADY_ACTIVE", "Esta pessoa já ativou a conta e entra com a própria senha.", 409);
    return `https://escola.example/convite?usuario=${userId}&novo=1`;
  }
}
