import type { Role } from "@/contracts";
import type { AccountRecord, AssignmentRecord, ClassMetrics, ClassroomInput, ClassroomPatch, ClassroomRecord, EnrollmentRecord, PersonRecord } from "./model";

/** Every method is scoped by a schoolId taken from the session, never from the request. */
export interface RosterRepository {
  listClassrooms(schoolId: string): Promise<ClassroomRecord[]>;
  getClassroom(schoolId: string, classroomId: string): Promise<ClassroomRecord | null>;
  createClassroom(schoolId: string, input: ClassroomInput): Promise<ClassroomRecord>;
  updateClassroom(schoolId: string, classroomId: string, patch: ClassroomPatch): Promise<ClassroomRecord | null>;
  deleteClassroom(schoolId: string, classroomId: string): Promise<boolean>;
  listPeople(schoolId: string, role: "aluno" | "professor"): Promise<PersonRecord[]>;
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
}

/**
 * Identity provisioning. Emails live in Supabase Auth, so this port requires the
 * privileged client; RosterService authorizes the coordinator before calling it.
 */
export interface AccountDirectory {
  findByEmails(emails: string[]): Promise<Map<string, AccountRecord>>;
  /** Idempotent: resumes a partial provisioning instead of creating a second identity. */
  ensureAccount(input: { email: string; fullName: string; role: Role; schoolId: string; userId?: string }): Promise<string>;
}

export interface RosterMetricsGateway {
  classMetrics(schoolId: string, classroomIds: string[]): Promise<{ source: "fixture" | "real"; classes: ClassMetrics[] }>;
}
