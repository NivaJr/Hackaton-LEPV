import { SessionContextSchema, type SessionContext } from "@/contracts";
import { MemoryRecognitionStore, MemoryRosterReader } from "@/features/recognition/memory-repository";
import { RecognitionService } from "@/features/recognition/service";

export const SCHOOL = "school-1";
export const OTHER_SCHOOL = "school-2";
export const CLASS_A = "class-7a";
export const CLASS_B = "class-7b";

export function actor(overrides: Partial<SessionContext>): SessionContext {
  return SessionContextSchema.parse({ userId: "user-x", roles: ["aluno"], institutionId: SCHOOL, ...overrides });
}

export const teacher = () => actor({
  userId: "teacher-1", roles: ["professor"],
  teacherAssignments: [{ institutionId: SCHOOL, classId: CLASS_A, subjectId: "matematica" }],
});
export const otherTeacher = () => actor({
  userId: "teacher-2", roles: ["professor"],
  teacherAssignments: [{ institutionId: SCHOOL, classId: CLASS_B, subjectId: "matematica" }],
});
export const student = (id = "student-ana") => actor({ userId: id, roles: ["aluno"], studentId: id });
export const guardian = (studentIds: string[]) => actor({ userId: "guardian-1", roles: ["responsavel"], guardianStudentIds: studentIds });
export const coordinator = () => actor({ userId: "coord-1", roles: ["coordenador"], coordinatorInstitutionIds: [SCHOOL] });

export function createFixture(start = new Date("2026-10-31T14:00:00.000Z")) {
  let now = start;
  let sequence = 0;
  const store = new MemoryRecognitionStore(() => `notification-${++sequence}`);
  const roster = new MemoryRosterReader({
    classrooms: [
      { id: CLASS_A, schoolId: SCHOOL, name: "7º A", grade: 7, schoolYear: 2026 },
      { id: CLASS_B, schoolId: SCHOOL, name: "7º B", grade: 7, schoolYear: 2026 },
    ],
    enrollments: [
      { schoolId: SCHOOL, classId: CLASS_A, studentId: "student-ana", fullName: "Ana Souza Lima", status: "active" },
      { schoolId: SCHOOL, classId: CLASS_A, studentId: "student-bruno", fullName: "Bruno Alves", status: "active" },
      { schoolId: SCHOOL, classId: CLASS_A, studentId: "student-caio", fullName: "Caio Prado", status: "transferred" },
      { schoolId: SCHOOL, classId: CLASS_B, studentId: "student-duda", fullName: "Duda Reis", status: "active" },
    ],
    guardians: [
      { schoolId: SCHOOL, guardianId: "guardian-1", studentId: "student-ana", status: "confirmed" },
      { schoolId: SCHOOL, guardianId: "guardian-pending", studentId: "student-ana", status: "pending" },
    ],
  });
  let ids = 0;
  const service = new RecognitionService({
    recognitions: store, notifications: store, roster, now: () => now, newId: () => `recognition-${++ids}`,
  });
  return {
    store, roster, service,
    setNow(value: string) { now = new Date(value); },
  };
}

export const grantBody = (overrides: Record<string, unknown> = {}) => ({
  classId: CLASS_A, subjectId: "matematica", studentIds: ["student-ana"], reason: "ajudou_turma",
  idempotencyKey: "key-00000001", ...overrides,
});
