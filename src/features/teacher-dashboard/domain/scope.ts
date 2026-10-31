import type { SessionContext } from "@/contracts";
import { isSkillCompatible, type Grade, type SubjectId } from "@/config/catalog";
import type { ClassMetrics } from "./model";

export interface TeacherClassScope {
  institutionId: string;
  classId: string;
  subjectIds: SubjectId[];
}

/** Classes and subjects come only from server-side teacher assignments in the session. */
export function getTeacherClassScopes(session: SessionContext): TeacherClassScope[] {
  if (!session.roles.includes("professor")) return [];
  const scopes = new Map<string, TeacherClassScope>();
  for (const assignment of session.teacherAssignments) {
    if (assignment.institutionId !== session.institutionId) continue;
    const scope = scopes.get(assignment.classId)
      ?? { institutionId: assignment.institutionId, classId: assignment.classId, subjectIds: [] };
    if (!scope.subjectIds.includes(assignment.subjectId)) scope.subjectIds.push(assignment.subjectId);
    scopes.set(assignment.classId, scope);
  }
  return [...scopes.values()];
}

export function subjectForSkill(skillCode: string, subjectIds: readonly SubjectId[], grade: Grade): SubjectId | null {
  return subjectIds.find((subjectId) => isSkillCompatible(skillCode, subjectId, grade)) ?? null;
}

/** Drops anything a source returned outside the teacher's class and assigned subjects. */
export function restrictMetricsToScope(metrics: ClassMetrics, scope: TeacherClassScope): ClassMetrics {
  if (metrics.classId !== scope.classId) throw new Error("Métricas de outra turma foram recusadas.");
  const allowed = new Set(scope.subjectIds);
  const seenSubjects = new Set<SubjectId>();
  return {
    ...metrics,
    subjectProgress: metrics.subjectProgress.filter((item) => {
      if (!allowed.has(item.subjectId) || seenSubjects.has(item.subjectId)) return false;
      seenSubjects.add(item.subjectId);
      return true;
    }),
    students: metrics.students.map((student) => ({
      ...student,
      difficultSkillCodes: [...new Set(student.difficultSkillCodes)]
        .filter((code) => subjectForSkill(code, scope.subjectIds, metrics.grade) !== null),
    })),
  };
}
