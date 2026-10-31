import type { SessionContext, StudentAccessScope, SubjectId } from "@/contracts/schemas";

export type StudentDataCategory = "preferences" | "academic_history" | "health" | "support";

function isOwnStudent(actor: SessionContext, student: StudentAccessScope): boolean {
  return actor.roles.includes("aluno")
    && actor.institutionId === student.institutionId
    && actor.studentId === student.studentId;
}

function isLinkedGuardian(actor: SessionContext, student: StudentAccessScope): boolean {
  return actor.roles.includes("responsavel")
    && actor.guardianStudentIds.includes(student.studentId);
}

function isInstitutionCoordinator(actor: SessionContext, student: StudentAccessScope): boolean {
  return actor.roles.includes("coordenador")
    && actor.coordinatorInstitutionIds.includes(student.institutionId);
}

function hasTeachingAssignment(
  actor: SessionContext,
  student: StudentAccessScope,
  subjectId?: SubjectId,
): boolean {
  return actor.roles.includes("professor") && actor.teacherAssignments.some((assignment) =>
    assignment.institutionId === student.institutionId
    && student.classIds.includes(assignment.classId)
    && (subjectId === undefined || assignment.subjectId === subjectId));
}

/** actor and student scopes must be resolved from authenticated server-side records, never client roles/links. */
export function canViewStudentData(
  actor: SessionContext,
  student: StudentAccessScope,
  category: StudentDataCategory,
): boolean {
  if (category === "preferences") return isOwnStudent(actor, student);
  return isOwnStudent(actor, student)
    || isLinkedGuardian(actor, student)
    || hasTeachingAssignment(actor, student)
    || isInstitutionCoordinator(actor, student);
}

export function canEditStudentPreferences(actor: SessionContext, student: StudentAccessScope): boolean {
  return isOwnStudent(actor, student);
}

/** The teacher must also have the subject being edited assigned to the student's class. */
export function canEditStudentData(
  actor: SessionContext,
  student: StudentAccessScope,
  category: StudentDataCategory,
  subjectId?: SubjectId,
): boolean {
  if (category === "preferences") return canEditStudentPreferences(actor, student);
  if (category === "health" || category === "support") return isLinkedGuardian(actor, student);
  if (isInstitutionCoordinator(actor, student)) return true;
  return subjectId !== undefined && hasTeachingAssignment(actor, student, subjectId);
}
