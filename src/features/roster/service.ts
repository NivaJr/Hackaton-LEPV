import type { Role, SessionContext } from "@/contracts";
import { parseImportRows, markDuplicates, validateRow, type ParsedRow } from "./import/rows";
import { readSpreadsheet } from "./import/spreadsheet";
import {
  AccessLinkInputSchema, AssignmentInputSchema, ClassroomInputSchema, ClassroomPatchSchema, EnrollmentInputSchema, GuardianLinkInputSchema, GuardianLinkStatusSchema, ImportConfirmSchema, ImportKindSchema, RosterError,
  type AccountRecord, type AssignmentRecord, type ClassAccessLinks, type ClassroomRecord, type ConfirmRowResult, type ConfirmStatus, type EnrollmentRecord,
  type ImportConfirmRow, type ImportKind, type ImportPreview, type ImportResult, type PreviewRow, type PreviewStatus, type ProvisionedAccount, type RowIssue,
} from "./model";
import type { AccountDirectory, RosterMetricsGateway, RosterRepository, StudentResultsGateway } from "./ports";

export interface RosterDependencies {
  repository: RosterRepository;
  /** null when SUPABASE_SECRET_KEY is absent; imports then fail explicitly instead of simulating. */
  directory: AccountDirectory | null;
  metrics: RosterMetricsGateway;
  results: StudentResultsGateway;
  now?(): Date;
}

const RESULTS_PERIOD_DAYS = 30;
const PREVIEW_STATUSES: PreviewStatus[] = ["new", "enroll_existing", "already_in_class", "transfer_available", "assign_existing", "already_assigned", "invalid"];
const CONFIRM_STATUSES: ConfirmStatus[] = ["created", "enrolled", "transferred", "assigned", "kept", "already_applied", "failed"];

const STALE: RowIssue = { code: "STALE_PREVIEW", message: "A matrícula mudou desde a prévia. Gere uma nova prévia." };

function countBy<T extends string>(keys: T[], values: T[]): Record<T, number> {
  const counts = Object.fromEntries(keys.map((key) => [key, 0])) as Record<T, number>;
  values.forEach((value) => { counts[value] += 1; });
  return counts;
}

type RowOutcome = Pick<ConfirmRowResult, "status" | "issue" | "accessLink">;

interface Snapshot {
  accounts: Map<string, AccountRecord>;
  enrollments: Map<string, EnrollmentRecord>;
  assignments: AssignmentRecord[];
}

function provisioned(account: AccountRecord | undefined): AccountRecord | null {
  return account?.schoolId && account.roles.length ? account : null;
}

/** Single decision point, used by the preview and again on confirmation with fresh data. */
function classify(kind: ImportKind, schoolId: string, classroomId: string, row: ParsedRow, snapshot: Snapshot): PreviewRow {
  const { line, fullName, email, subject, subjectId } = row;
  const base = { line, fullName, email, ...(subject ? { subject } : {}), ...(subjectId ? { subjectId } : {}) };
  if (row.issues.length) return { ...base, status: "invalid", issues: row.issues };
  const account = snapshot.accounts.get(email);
  const blocked = (issue: RowIssue): PreviewRow => ({ ...base, status: "invalid", issues: [issue] });
  if (account?.schoolId && account.schoolId !== schoolId) {
    return blocked({ code: "OTHER_SCHOOL", message: "Este email pertence a outra escola; a transferência entre escolas não é permitida." });
  }
  // Without any role the account is a partial provisioning, resumed as a new line.
  const known = provisioned(account);
  if (!known) return { ...base, status: "new", issues: [] };
  const role = kind === "students" ? "aluno" : "professor";
  if (!known.roles.includes(role)) {
    return blocked({ code: "ROLE_CONFLICT", message: `Esta conta já existe sem o papel de ${role}.` });
  }
  const existing = known.fullName ? { existingName: known.fullName } : {};
  if (kind === "teachers") {
    const assigned = snapshot.assignments.some((item) => item.teacherId === known.userId && item.classroomId === classroomId && item.subjectId === subjectId);
    return { ...base, ...existing, status: assigned ? "already_assigned" : "assign_existing", issues: [] };
  }
  const current = snapshot.enrollments.get(known.userId);
  if (!current) return { ...base, ...existing, status: "enroll_existing", issues: [] };
  const currentEnrollment = { id: current.id, classroomId: current.classroomId, classroomName: current.classroomName };
  return { ...base, ...existing, currentEnrollment, status: current.classroomId === classroomId ? "already_in_class" : "transfer_available", issues: [] };
}

export class RosterService {
  constructor(private readonly dependencies: RosterDependencies) {}

  private get repository() { return this.dependencies.repository; }

  /** School comes only from the server-built session; request bodies never carry it. */
  private schoolOf(actor: SessionContext): string {
    if (!actor.roles.includes("coordenador") || !actor.coordinatorInstitutionIds.includes(actor.institutionId)) {
      throw new RosterError("FORBIDDEN", "Esta operação é exclusiva da coordenação da escola.", 403);
    }
    return actor.institutionId;
  }

  private async classroom(schoolId: string, classroomId: string): Promise<ClassroomRecord> {
    const classroom = await this.repository.getClassroom(schoolId, classroomId);
    if (!classroom) throw new RosterError("NOT_FOUND", "Turma não encontrada nesta escola.", 404);
    return classroom;
  }

  private get directory(): AccountDirectory {
    if (!this.dependencies.directory) {
      throw new RosterError("PROVISIONING_UNAVAILABLE", "O provisionamento de contas ainda não foi configurado no servidor.", 503);
    }
    return this.dependencies.directory;
  }

  assertCoordinator(actor: SessionContext) {
    this.schoolOf(actor);
  }

  private async accountFor(schoolId: string, row: { email: string; fullName: string }, role: Role, account: AccountRecord | undefined): Promise<ProvisionedAccount> {
    const known = provisioned(account);
    if (known) return { userId: known.userId, accessLink: null };
    return this.directory.ensureAccount({ email: row.email, fullName: row.fullName, role, schoolId, ...(account ? { userId: account.userId } : {}) });
  }

  async overview(actor: SessionContext) {
    const schoolId = this.schoolOf(actor);
    const [classrooms, enrollments, assignments, students, teachers, guardians, guardianLinks] = await Promise.all([
      this.repository.listClassrooms(schoolId), this.repository.listEnrollments(schoolId), this.repository.listAssignments(schoolId),
      this.repository.listPeople(schoolId, "aluno"), this.repository.listPeople(schoolId, "professor"),
      this.repository.listPeople(schoolId, "responsavel"), this.repository.listGuardianLinks(schoolId),
    ]);
    const metrics = await this.dependencies.metrics.classMetrics(actor, classrooms.map((classroom) => classroom.id));
    return { classrooms, enrollments, assignments, students, teachers, guardians, guardianLinks, metrics };
  }

  async createClassroom(actor: SessionContext, input: unknown) {
    return this.repository.createClassroom(this.schoolOf(actor), ClassroomInputSchema.parse(input));
  }

  async updateClassroom(actor: SessionContext, classroomId: string, input: unknown) {
    const updated = await this.repository.updateClassroom(this.schoolOf(actor), classroomId, ClassroomPatchSchema.parse(input));
    if (!updated) throw new RosterError("NOT_FOUND", "Turma não encontrada nesta escola.", 404);
    return updated;
  }

  async deleteClassroom(actor: SessionContext, classroomId: string) {
    if (!await this.repository.deleteClassroom(this.schoolOf(actor), classroomId)) {
      throw new RosterError("NOT_FOUND", "Turma não encontrada nesta escola.", 404);
    }
    return { deleted: true };
  }

  async createAssignment(actor: SessionContext, input: unknown) {
    const schoolId = this.schoolOf(actor);
    const assignment = AssignmentInputSchema.parse(input);
    await this.classroom(schoolId, assignment.classroomId);
    return this.repository.createAssignment(schoolId, assignment);
  }

  async deleteAssignment(actor: SessionContext, assignmentId: string) {
    if (!await this.repository.deleteAssignment(this.schoolOf(actor), assignmentId)) {
      throw new RosterError("NOT_FOUND", "Atribuição não encontrada nesta escola.", 404);
    }
    return { deleted: true };
  }

  /** Lets the class screen hand out links at any time, since they are never stored. */
  async classAccessLinks(actor: SessionContext, classroomId: string): Promise<ClassAccessLinks> {
    const schoolId = this.schoolOf(actor);
    await this.classroom(schoolId, classroomId);
    const [enrollments, assignments, students, teachers] = await Promise.all([
      this.repository.listEnrollments(schoolId), this.repository.listAssignments(schoolId),
      this.repository.listPeople(schoolId, "aluno"), this.repository.listPeople(schoolId, "professor"),
    ]);
    const ids = new Set([
      ...enrollments.filter((item) => item.classroomId === classroomId).map((item) => item.studentId),
      ...assignments.filter((item) => item.classroomId === classroomId).map((item) => item.teacherId),
    ]);
    const names = new Map([...students, ...teachers].map((person) => [person.id, person.fullName]));
    const pending = await this.directory.issuePendingAccessLinks([...ids]);
    return {
      links: pending.map(({ userId, email, accessLink }) => ({ fullName: names.get(userId) ?? email, email, accessLink })),
      activeCount: ids.size - pending.length,
    };
  }

  /** Scores come straight from the learning core; this feature never computes or adjusts them. */
  async studentResults(actor: SessionContext, studentId: string) {
    const schoolId = this.schoolOf(actor);
    const students = await this.repository.listPeople(schoolId, "aluno");
    if (!students.some((student) => student.id === studentId)) throw new RosterError("NOT_FOUND", "Aluno não encontrado nesta escola.", 404);
    const end = (this.dependencies.now ?? (() => new Date()))();
    const start = new Date(end.getTime() - (RESULTS_PERIOD_DAYS - 1) * 86_400_000);
    return this.dependencies.results.studentResults(actor, studentId, start.toISOString().slice(0, 10), end.toISOString().slice(0, 10));
  }

  /** New links start pending: only an explicit coordinator confirmation grants access to the student. */
  async createGuardianLink(actor: SessionContext, input: unknown) {
    const schoolId = this.schoolOf(actor);
    const { studentId, fullName, email } = GuardianLinkInputSchema.parse(input);
    const row = validateRow("students", { line: 1, fullName, email });
    if (row.issues.length) throw new RosterError(row.issues[0].code, row.issues[0].message, 422);
    const students = await this.repository.listPeople(schoolId, "aluno");
    if (!students.some((student) => student.id === studentId)) throw new RosterError("NOT_FOUND", "Aluno não encontrado nesta escola.", 404);
    const account = (await this.directory.findByEmails([row.email])).get(row.email);
    if (account?.schoolId && account.schoolId !== schoolId) {
      throw new RosterError("OTHER_SCHOOL", "Este email pertence a outra escola.", 409);
    }
    const known = provisioned(account);
    if (known && !known.roles.includes("responsavel")) {
      throw new RosterError("ROLE_CONFLICT", "Esta conta já existe sem o papel de responsável.", 409);
    }
    const guardian = await this.accountFor(schoolId, row, "responsavel", account);
    const link = await this.repository.createGuardianLink(schoolId, guardian.userId, studentId);
    return { ...link, ...(guardian.accessLink ? { accessLink: guardian.accessLink } : {}) };
  }

  /** Replaces an expired or lost link; coordinators are excluded because only people they manage qualify. */
  async issueAccessLink(actor: SessionContext, input: unknown) {
    const schoolId = this.schoolOf(actor);
    const { personId } = AccessLinkInputSchema.parse(input);
    const people = await Promise.all((["aluno", "professor", "responsavel"] as const).map((role) => this.repository.listPeople(schoolId, role)));
    if (!people.flat().some((person) => person.id === personId)) throw new RosterError("NOT_FOUND", "Pessoa não encontrada nesta escola.", 404);
    return { accessLink: await this.directory.issueAccessLink(personId) };
  }

  async setGuardianLinkStatus(actor: SessionContext, linkId: string, input: unknown) {
    const schoolId = this.schoolOf(actor);
    const { status } = GuardianLinkStatusSchema.parse(input);
    const link = await this.repository.setGuardianLinkStatus(schoolId, linkId, status);
    if (!link) throw new RosterError("NOT_FOUND", "Vínculo não encontrado nesta escola.", 404);
    return link;
  }

  /** Moves a student only when expectedEnrollmentId proves the coordinator saw the current class. */
  async allocateStudent(actor: SessionContext, input: unknown) {
    const schoolId = this.schoolOf(actor);
    const { classroomId, studentId, expectedEnrollmentId } = EnrollmentInputSchema.parse(input);
    await this.classroom(schoolId, classroomId);
    const current = await this.repository.activeEnrollment(schoolId, studentId);
    if (current?.classroomId === classroomId) return { enrollment: current, status: "already_applied" as const };
    if (!current) return { enrollment: await this.repository.enroll(schoolId, classroomId, studentId), status: "enrolled" as const };
    if (expectedEnrollmentId !== current.id) {
      throw new RosterError("TRANSFER_CONFIRMATION_REQUIRED", `Aluno matriculado em ${current.classroomName}. Confirme a transferência.`, 409);
    }
    const issue = await this.transfer(schoolId, current.id, classroomId, studentId);
    if (issue) throw new RosterError(issue.code, issue.message, 409);
    return { enrollment: await this.repository.activeEnrollment(schoolId, studentId), status: "transferred" as const };
  }

  async removeEnrollment(actor: SessionContext, enrollmentId: string) {
    if (!await this.repository.closeEnrollment(this.schoolOf(actor), enrollmentId, "inactive")) {
      throw new RosterError("NOT_FOUND", "Matrícula ativa não encontrada nesta escola.", 404);
    }
    return { removed: true };
  }

  /** The repository/RPC owns atomicity; no close/reopen compensation can lose the enrollment. */
  private async transfer(schoolId: string, enrollmentId: string, classroomId: string, studentId: string): Promise<RowIssue | null> {
    try {
      await this.repository.transferEnrollment(schoolId, enrollmentId, classroomId, studentId);
      return null;
    } catch (error) {
      if (error instanceof RosterError && error.code === "STALE_PREVIEW") return STALE;
      return { code: "TRANSFER_FAILED", message: "A transferência falhou; a matrícula anterior foi mantida." };
    }
  }

  private async snapshot(kind: ImportKind, schoolId: string, emails: string[]): Promise<Snapshot> {
    const [accounts, enrollments, assignments] = await Promise.all([
      this.directory.findByEmails(emails),
      kind === "students" ? this.repository.listEnrollments(schoolId) : Promise.resolve([]),
      kind === "teachers" ? this.repository.listAssignments(schoolId) : Promise.resolve([]),
    ]);
    return { accounts, assignments, enrollments: new Map(enrollments.map((item) => [item.studentId, item])) };
  }

  /** Read-only: nothing is created, enrolled or invited until the confirmation. */
  async previewImport(actor: SessionContext, input: { kind: unknown; classroomId: string; file: { name: string; bytes: Uint8Array } }): Promise<ImportPreview> {
    const schoolId = this.schoolOf(actor);
    const kind = ImportKindSchema.parse(input.kind);
    const classroom = await this.classroom(schoolId, input.classroomId);
    const parsed = parseImportRows(kind, readSpreadsheet(input.file));
    const emails = parsed.filter((row) => !row.issues.length).map((row) => row.email);
    const snapshot = await this.snapshot(kind, schoolId, emails);
    const rows = parsed.map((row) => classify(kind, schoolId, classroom.id, row, snapshot));
    return {
      kind, classroom: { id: classroom.id, name: classroom.name }, rows,
      counts: countBy(PREVIEW_STATUSES, rows.map((row) => row.status)),
    };
  }

  /**
   * Revalidates each line against current data. Idempotency is state-based: a resent line
   * finds the enrollment or assignment already in place and reports already_applied, so
   * repeating a partial batch only completes the lines that failed.
   */
  async confirmImport(actor: SessionContext, input: unknown): Promise<ImportResult> {
    const schoolId = this.schoolOf(actor);
    const { kind, classroomId, rows } = ImportConfirmSchema.parse(input);
    const classroom = await this.classroom(schoolId, classroomId);
    const parsed = markDuplicates(kind, rows.map((row) => validateRow(kind, row)));
    const snapshot = await this.snapshot(kind, schoolId, parsed.filter((row) => !row.issues.length).map((row) => row.email));
    const auditId = await this.repository.startImportAudit(schoolId, actor.userId, classroom.id, kind, rows);
    const results: ConfirmRowResult[] = [];
    for (const [index, row] of parsed.entries()) {
      const decided = rows[index];
      const preview = classify(kind, schoolId, classroom.id, row, snapshot);
      try {
        const outcome = kind === "students"
          ? await this.applyStudent(schoolId, classroom.id, preview, decided, snapshot)
          : await this.applyTeacher(schoolId, classroom.id, preview, snapshot);
        results.push({ line: row.line, email: row.email, ...outcome });
      } catch (error) {
        const issue = error instanceof RosterError
          ? { code: error.code, message: error.message }
          : { code: "ROW_FAILED", message: "Não foi possível concluir esta linha. Tente novamente." };
        results.push({ line: row.line, email: row.email, status: "failed", issue });
      }
    }
    await this.repository.finishImportAudit(schoolId, actor.userId, auditId, results.map(({ accessLink: _credential, ...row }) => row));
    return { rows: results, counts: countBy(CONFIRM_STATUSES, results.map((row) => row.status)) };
  }

  async importAudits(actor: SessionContext) {
    return this.repository.listImportAudits(this.schoolOf(actor));
  }

  private async applyStudent(schoolId: string, classroomId: string, row: PreviewRow, decided: ImportConfirmRow, snapshot: Snapshot): Promise<RowOutcome> {
    if (row.status === "invalid") return { status: "failed", issue: row.issues[0] };
    if (row.status === "already_in_class") return { status: "already_applied" };
    const account = snapshot.accounts.get(row.email);
    if (row.status === "transfer_available") {
      if (decided.decision === "keep") return { status: "kept" };
      if (decided.decision !== "transfer") {
        return { status: "failed", issue: { code: "TRANSFER_CONFIRMATION_REQUIRED", message: "Confirme se o aluno deve ser transferido ou mantido." } };
      }
      if (decided.expectedEnrollmentId !== row.currentEnrollment?.id) return { status: "failed", issue: STALE };
      const issue = await this.transfer(schoolId, row.currentEnrollment!.id, classroomId, account!.userId);
      return issue ? { status: "failed", issue } : { status: "transferred" };
    }
    const { userId: studentId, accessLink } = await this.accountFor(schoolId, row, "aluno", account);
    const link = accessLink ? { accessLink } : {};
    try {
      await this.repository.enroll(schoolId, classroomId, studentId);
    } catch (error) {
      if (!(error instanceof RosterError) || error.code !== "DUPLICATE_ENROLLMENT") throw error;
      const current = await this.repository.activeEnrollment(schoolId, studentId);
      return current?.classroomId === classroomId ? { status: "already_applied", ...link } : { status: "failed", issue: STALE, ...link };
    }
    return { status: row.status === "new" ? "created" : "enrolled", ...link };
  }

  private async applyTeacher(schoolId: string, classroomId: string, row: PreviewRow, snapshot: Snapshot): Promise<RowOutcome> {
    if (row.status === "invalid") return { status: "failed", issue: row.issues[0] };
    if (row.status === "already_assigned") return { status: "already_applied" };
    const account = snapshot.accounts.get(row.email);
    const { userId: teacherId, accessLink } = await this.accountFor(schoolId, row, "professor", account);
    // A later line for the same new teacher must reuse the identity created by the first one.
    snapshot.accounts.set(row.email, { userId: teacherId, schoolId, fullName: row.fullName, roles: ["professor"] });
    const assignment = await this.repository.createAssignment(schoolId, { classroomId, teacherId, subjectId: row.subjectId! });
    snapshot.assignments.push(assignment);
    return { status: row.status === "new" ? "created" : "assigned", ...(accessLink ? { accessLink } : {}) };
  }
}
