import type { Role, SessionContext } from "@/contracts";
import type { AccountRecord, AssignmentRecord, ClassMetrics, GuardianLinkRecord, ClassroomInput, ClassroomPatch, ClassroomRecord, EnrollmentRecord, PendingAccessLink, PersonRecord, ProvisionedAccount, StudentResults } from "./model";

/** Every method is scoped by a schoolId taken from the session, never from the request. */
export interface RosterRepository {
  listClassrooms(schoolId: string): Promise<ClassroomRecord[]>;
  getClassroom(schoolId: string, classroomId: string): Promise<ClassroomRecord | null>;
  createClassroom(schoolId: string, input: ClassroomInput): Promise<ClassroomRecord>;
  updateClassroom(schoolId: string, classroomId: string, patch: ClassroomPatch): Promise<ClassroomRecord | null>;
  deleteClassroom(schoolId: string, classroomId: string): Promise<boolean>;
  listPeople(schoolId: string, role: "aluno" | "professor" | "responsavel"): Promise<PersonRecord[]>;
  listEnrollments(schoolId: string): Promise<EnrollmentRecord[]>;
  activeEnrollment(schoolId: string, studentId: string): Promise<EnrollmentRecord | null>;
  /** Throws RosterError DUPLICATE_ENROLLMENT when the student already has an active enrollment. */
  enroll(schoolId: string, classroomId: string, studentId: string): Promise<EnrollmentRecord>;
  /** Returns false when the enrollment is no longer active. */
  closeEnrollment(schoolId: string, enrollmentId: string, status: "transferred" | "inactive"): Promise<boolean>;
  reopenEnrollment(schoolId: string, enrollmentId: string): Promise<void>;
  listAssignments(schoolId: string): Promise<AssignmentRecord[]>;
  createAssignment(schoolId: string, input: Omit<AssignmentRecord, "id">): Promise<AssignmentRecord>;
  deleteAssignment(schoolId: string, assignmentId: string): Promise<boolean>;
  listGuardianLinks(schoolId: string): Promise<GuardianLinkRecord[]>;
  /** Idempotent: returns the existing link for the same guardian and student. */
  createGuardianLink(schoolId: string, guardianId: string, studentId: string): Promise<GuardianLinkRecord>;
  setGuardianLinkStatus(schoolId: string, linkId: string, status: "confirmed" | "revoked"): Promise<GuardianLinkRecord | null>;
}

/**
 * Identity provisioning. Emails live in Supabase Auth, so this port requires the
 * privileged client; RosterService authorizes the coordinator before calling it.
 */
export interface AccountDirectory {
  findByEmails(emails: string[]): Promise<Map<string, AccountRecord>>;
  /** Idempotent: resumes a partial provisioning instead of creating a second identity. */
  ensureAccount(input: { email: string; fullName: string; role: Role; schoolId: string; userId?: string }): Promise<ProvisionedAccount>;
  /** Refuses accounts already activated, so a link can never take over a person's account. */
  issueAccessLink(userId: string): Promise<string>;
  /** Skips activated accounts. Each new link replaces the previous one of that person. */
  issuePendingAccessLinks(userIds: string[]): Promise<PendingAccessLink[]>;
}

/** The actor travels with the call so the learning core repeats its own authorization. */
export interface StudentResultsGateway {
  studentResults(actor: SessionContext, studentId: string, from: string, to: string): Promise<StudentResults>;
}

export interface RosterMetricsGateway {
  classMetrics(schoolId: string, classroomIds: string[]): Promise<{ source: "fixture" | "real"; classes: ClassMetrics[] }>;
}
