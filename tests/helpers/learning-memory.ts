import {
  SessionContextSchema, type GeneratedQuestion, type SessionContext, type StudentPreferencesUpdate,
} from "@/contracts";
import type { LearningScoringPolicy } from "@/config/scoring";
import { emptyLearningState, notFound, type LearningState, type LoadedStudent, type VersionedCatalog } from "@/features/learning/server/model";
import type { LearningRepository } from "@/features/learning/server/repository";

export const fixtureIds = {
  school: "11111111-1111-4111-8111-111111111111",
  otherSchool: "22222222-2222-4222-8222-222222222222",
  classId: "10000000-0000-4000-8000-000000000001",
  otherClass: "10000000-0000-4000-8000-000000000002",
  student: "00000000-0000-4000-8000-000000000004",
  teacher: "00000000-0000-4000-8000-000000000003",
  coordinator: "00000000-0000-4000-8000-000000000001",
  guardian: "00000000-0000-4000-8000-000000000007",
};
export const testPolicy: LearningScoringPolicy = { originalPoints: 100, recoveryReference: "original", adaptiveXpFollowsRoot: true, recoveryCapPoints: null };
export const testNow = () => new Date("2026-10-30T23:00:00Z");
export function actor(overrides: Partial<SessionContext> = {}): SessionContext {
  return SessionContextSchema.parse({
    userId: fixtureIds.student, studentId: fixtureIds.student, institutionId: fixtureIds.school, roles: ["aluno"], ...overrides,
  });
}
export const coordinator = () => actor({ userId: fixtureIds.coordinator, studentId: undefined, roles: ["coordenador"], coordinatorInstitutionIds: [fixtureIds.school] });
export const teacher = () => actor({ userId: fixtureIds.teacher, studentId: undefined, roles: ["professor"], teacherAssignments: [{ institutionId: fixtureIds.school, classId: fixtureIds.classId, subjectId: "matematica" }] });
export function question(number = 1): GeneratedQuestion {
  return {
    subjectId: "matematica", grade: 6, skillCodes: ["EF06MA01"], statement: `Questão sintética de teste ${number}: quanto é 2 + 2?`,
    options: [{ id: "a", text: "4" }, { id: "b", text: "5" }], correctOptionId: "a",
    explanation: "Dois pares somam quatro.", hint: "Conte dois pares.", difficulty: "facil",
  };
}
export function catalog(): VersionedCatalog {
  return { version: 0, catalog: {
    classId: fixtureIds.classId, institutionId: fixtureIds.school, grade: 6, schoolYear: 2026, rotations: [],
    activities: Array.from({ length: 12 }, (_, i) => ({
      rootQuestionId: `root-${String(i + 1).padStart(2, "0")}`, body: question(i + 1), contentVersion: 1,
      activityType: "weekly_challenge" as const, reviewed: true as const, active: i < 10, activatedAt: i < 10 ? "2026-10-29T12:00:00Z" : null,
    })),
  } };
}

/** Test adapter only. Production always uses the database adapter. */
export class MemoryLearningRepository implements LearningRepository {
  async classroomName(institutionId: string, classId: string) {
    await this.loadCatalog(institutionId, classId);
    return classId === fixtureIds.classId ? "6A fictícia" : "6B fictícia";
  }
  readonly catalogs = new Map<string, VersionedCatalog>([[fixtureIds.classId, catalog()]]);
  readonly students = new Map<string, LoadedStudent>();

  constructor() { this.addStudent(fixtureIds.student); }
  addStudent(id: string, classId = fixtureIds.classId) {
    const versioned = this.catalogs.get(classId)!;
    this.students.set(id, {
      studentId: id, institutionId: fixtureIds.school, studentName: `Aluno fictício ${id.slice(-3)}`,
      preferences: { studentId: id, interests: ["futebol"], context: "Campeonatos", version: 1 },
      catalog: structuredClone(versioned.catalog), catalogVersion: versioned.version, state: emptyLearningState(), stateVersion: 0,
    });
  }
  async loadStudent(institutionId: string, studentId: string) {
    const record = this.students.get(studentId);
    if (!record || record.institutionId !== institutionId) notFound();
    const current = await this.loadCatalog(institutionId, record.catalog.classId);
    return structuredClone({ ...record, catalog: current.catalog, catalogVersion: current.version });
  }
  async commitStudent(before: LoadedStudent, state: LearningState) {
    const current = this.students.get(before.studentId)!;
    const currentCatalog = this.catalogs.get(before.catalog.classId)!;
    if (current.stateVersion !== before.stateVersion || currentCatalog.version !== before.catalogVersion) return false;
    this.students.set(before.studentId, structuredClone({ ...current, state, stateVersion: current.stateVersion + 1 }));
    return true;
  }
  async savePreferences(institutionId: string, studentId: string, value: StudentPreferencesUpdate) {
    await this.loadStudent(institutionId, studentId);
    const record = this.students.get(studentId)!;
    const changed = record.preferences && (record.preferences.context !== value.context || JSON.stringify(record.preferences.interests) !== JSON.stringify(value.interests));
    const preferences = { ...value, studentId, version: (record.preferences?.version ?? 1) + (changed ? 1 : 0), updatedAt: testNow().toISOString() };
    record.preferences = structuredClone(preferences);
    return structuredClone(preferences);
  }
  async loadCatalog(institutionId: string, classId: string) {
    const current = this.catalogs.get(classId);
    if (!current || current.catalog.institutionId !== institutionId) notFound();
    return structuredClone(current);
  }
  async commitCatalog(before: VersionedCatalog, after: VersionedCatalog["catalog"]) {
    const current = this.catalogs.get(before.catalog.classId)!;
    if (current.version !== before.version) return false;
    this.catalogs.set(after.classId, structuredClone({ catalog: after, version: current.version + 1 }));
    return true;
  }
  async ranking(institutionId: string, classId: string) {
    const current = await this.loadCatalog(institutionId, classId);
    const active = new Set(current.catalog.activities.filter((item) => item.active).map((item) => item.rootQuestionId));
    const rows = [...this.students.values()].filter((student) => student.institutionId === institutionId && student.catalog.classId === classId).map((student) => ({
      studentId: student.studentId, name: student.studentName,
      xp: student.state.ledger.filter((entry) => entry.kind === "xp" && entry.classId === classId && (entry.keepAfterRotation || active.has(entry.rootQuestionId))).reduce((total, entry) => total + entry.points, 0),
      rankPoints: student.state.ledger.filter((entry) => entry.kind === "annual" && entry.schoolYear === current.catalog.schoolYear).reduce((total, entry) => total + entry.points, 0),
    }));
    return rows.sort((a, b) => b.xp - a.xp || b.rankPoints - a.rankPoints || a.studentId.localeCompare(b.studentId)).slice(0, 10);
  }
}
