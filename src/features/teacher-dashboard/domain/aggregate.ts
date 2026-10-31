import { getSubject, type Grade, type SubjectId } from "@/config/catalog";
import type {
  ClassMetrics,
  ClassOverview,
  EngagementSummary,
  ImprovementReason,
  SkillDifficulty,
  StudentClassMetrics,
  StudentToImprove,
  SubjectProgressView,
} from "./model";
import { restrictMetricsToScope, subjectForSkill, type TeacherClassScope } from "./scope";
import type { MetricsPeriod } from "./period";

/** A skill is collective when it is difficult for at least this share of students with answers. */
export const COLLECTIVE_DIFFICULTY_SHARE = 0.3;
export const LOW_ACCURACY = 0.6;
export const MIN_ANSWERS_FOR_ACCURACY = 3;
export const REGULAR_ENGAGED_DAYS = 2;
export const STUDENTS_TO_IMPROVE_LIMIT = 8;
const EPSILON = 1e-9;

export function answeredCount(student: StudentClassMetrics) {
  return student.correctAnswers + student.incorrectAnswers;
}

export function accuracyOf(student: Pick<StudentClassMetrics, "correctAnswers" | "incorrectAnswers">): number | null {
  const answered = student.correctAnswers + student.incorrectAnswers;
  return answered ? student.correctAnswers / answered : null;
}

function engagementBasis(students: StudentClassMetrics[]): EngagementSummary["basis"] {
  return students.length > 0 && students.every((student) => student.accessDays !== null) ? "acesso" : "atividade";
}

function engagedDays(student: StudentClassMetrics, basis: EngagementSummary["basis"]) {
  return basis === "acesso" ? Math.max(student.accessDays ?? 0, student.activityDays) : student.activityDays;
}

function regularDays(periodDays: number) {
  return Math.max(1, Math.min(REGULAR_ENGAGED_DAYS, periodDays));
}

export function aggregateSkillDifficulties(
  students: StudentClassMetrics[],
  scope: { grade: Grade; subjectIds: readonly SubjectId[] },
  collectiveShare = COLLECTIVE_DIFFICULTY_SHARE,
): SkillDifficulty[] {
  const withData = students.filter((student) => answeredCount(student) > 0);
  const bySkill = new Map<string, SkillDifficulty>();
  for (const student of withData) {
    for (const skillCode of new Set(student.difficultSkillCodes)) {
      const subjectId = subjectForSkill(skillCode, scope.subjectIds, scope.grade);
      if (!subjectId) continue;
      const entry = bySkill.get(skillCode)
        ?? { skillCode, subjectId, studentCount: 0, share: 0, scope: "individual" as const, students: [] };
      entry.studentCount += 1;
      entry.students.push({ studentId: student.studentId, displayName: student.displayName });
      bySkill.set(skillCode, entry);
    }
  }
  return [...bySkill.values()]
    .map((entry) => {
      const share = entry.studentCount / withData.length;
      return { ...entry, share, scope: share + EPSILON >= collectiveShare ? "coletiva" as const : "individual" as const };
    })
    .sort((a, b) => b.studentCount - a.studentCount || a.skillCode.localeCompare(b.skillCode));
}

const REASON_WEIGHT: Record<ImprovementReason, number> = { sem_atividade: 3, acerto_baixo: 2, pouca_atividade: 1 };

export function rankStudentsToImprove(
  students: StudentClassMetrics[],
  periodDays: number,
  limit = STUDENTS_TO_IMPROVE_LIMIT,
): StudentToImprove[] {
  const basis = engagementBasis(students);
  const required = regularDays(periodDays);
  return students
    .map((student): StudentToImprove => {
      const answered = answeredCount(student);
      const accuracy = accuracyOf(student);
      const days = engagedDays(student, basis);
      const reasons: ImprovementReason[] = [];
      if (answered === 0) reasons.push("sem_atividade");
      else {
        if (answered >= MIN_ANSWERS_FOR_ACCURACY && accuracy !== null && accuracy < LOW_ACCURACY) reasons.push("acerto_baixo");
        if (days < required) reasons.push("pouca_atividade");
      }
      return { studentId: student.studentId, displayName: student.displayName, accuracy, answered, engagedDays: days, reasons };
    })
    .filter((student) => student.reasons.length > 0)
    .sort((a, b) => weight(b) - weight(a)
      || (a.accuracy ?? -1) - (b.accuracy ?? -1)
      || a.engagedDays - b.engagedDays
      || a.displayName.localeCompare(b.displayName, "pt-BR")
      || a.studentId.localeCompare(b.studentId))
    .slice(0, limit);
}

function weight(student: StudentToImprove) {
  return student.reasons.reduce((total, reason) => total + REASON_WEIGHT[reason], 0);
}

export function summarizeEngagement(students: StudentClassMetrics[], periodDays: number): EngagementSummary {
  const basis = engagementBasis(students);
  const required = regularDays(periodDays);
  const days = students.map((student) => Math.min(engagedDays(student, basis), periodDays));
  const total = days.reduce((sum, value) => sum + value, 0);
  const averageDays = students.length ? total / students.length : 0;
  return {
    basis,
    periodDays,
    studentsTotal: students.length,
    studentsWithActivity: students.filter((student) => student.activityDays > 0).length,
    averageDays,
    rate: periodDays > 0 ? Math.min(1, averageDays / periodDays) : 0,
    buckets: {
      none: days.filter((value) => value === 0).length,
      low: days.filter((value) => value > 0 && value < required).length,
      regular: days.filter((value) => value >= required).length,
    },
  };
}

export function summarizeSubjectProgress(metrics: ClassMetrics, subjectIds: readonly SubjectId[]): SubjectProgressView[] {
  return subjectIds.map((subjectId) => {
    const progress = metrics.subjectProgress.find((item) => item.subjectId === subjectId);
    const answered = progress?.answeredOriginals ?? null;
    const expected = progress?.activeActivities != null ? progress.activeActivities * metrics.studentsEnrolled : null;
    return {
      subjectId,
      subjectName: getSubject(subjectId).name,
      answeredOriginals: answered,
      expectedAnswers: expected,
      completion: answered !== null && expected ? Math.min(1, answered / expected) : null,
    };
  });
}

export function buildClassOverview(raw: ClassMetrics, scope: TeacherClassScope, period: MetricsPeriod): ClassOverview {
  const metrics = restrictMetricsToScope(raw, scope);
  const difficulties = aggregateSkillDifficulties(metrics.students, { grade: metrics.grade, subjectIds: scope.subjectIds });
  const correct = metrics.students.reduce((sum, student) => sum + student.correctAnswers, 0);
  const incorrect = metrics.students.reduce((sum, student) => sum + student.incorrectAnswers, 0);
  return {
    classId: metrics.classId,
    className: metrics.className,
    grade: metrics.grade,
    studentsEnrolled: metrics.studentsEnrolled,
    studentsWithData: metrics.students.filter((student) => answeredCount(student) > 0).length,
    subjects: summarizeSubjectProgress(metrics, scope.subjectIds),
    accuracy: accuracyOf({ correctAnswers: correct, incorrectAnswers: incorrect }),
    engagement: summarizeEngagement(metrics.students, period.days),
    collectiveDifficulties: difficulties.filter((item) => item.scope === "coletiva"),
    individualDifficulties: difficulties.filter((item) => item.scope === "individual"),
    studentsToImprove: rankStudentsToImprove(metrics.students, period.days),
    topStudents: metrics.topStudents.slice(0, 3),
    notes: metrics.notes,
  };
}
