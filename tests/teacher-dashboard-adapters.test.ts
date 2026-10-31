import { describe, expect, it } from "vitest";
import type { SessionContext } from "@/contracts";
import {
  ClassMetricsSchema,
  composeTeacherOverview,
  createFakeTeacherMetricsGateway,
  createLearningTeacherMetricsGateway,
  FAKE_METRICS_NOTE,
  TeacherMetricsUnavailableError,
  type ClassRoster,
  type LearningJsonFetch,
  type TeacherMetricsGateway,
} from "@/features/teacher-dashboard";

const request = { institutionId: "school-1", classId: "class-a", subjectIds: ["matematica" as const], from: "2026-10-26", to: "2026-10-30" };

const roster: ClassRoster = {
  classId: "class-a",
  className: "6º ano A",
  grade: 6,
  students: [
    { studentId: "s1", displayName: "Ana" },
    { studentId: "s2", displayName: "Bruno" },
    { studentId: "s3", displayName: "Caio" },
  ],
};

function summaryBody(studentId: string, values: Record<string, unknown> = {}) {
  return {
    summary: {
      studentId, periodStart: "2026-10-26", periodEnd: "2026-10-30",
      accessDays: 0, activityDays: 2, correctAnswers: 3, incorrectAnswers: 1,
      xp: 300, rankPoints: 300, rankName: "Bronze (proposta)", difficultSkillCodes: ["EF06MA01"],
      ...values,
    },
    rankCalibration: "proposed",
    accessDaysScope: "not_available_for_subject",
    originalAttempts: 4,
    recoveryAttempts: 0,
  };
}

function fakeFetch(handler: (path: string) => { status: number; body: unknown }) {
  const calls: string[] = [];
  const fetchJson: LearningJsonFetch = async (path) => {
    calls.push(path);
    return handler(path);
  };
  return { fetchJson, calls };
}

describe("adapter de demonstração", () => {
  it("gera dados válidos, determinísticos e marcados como sintéticos", async () => {
    const gateway = createFakeTeacherMetricsGateway();
    const first = await gateway.getClassMetrics({ ...request, subjectIds: ["matematica", "biologia"] });
    const second = await gateway.getClassMetrics({ ...request, subjectIds: ["matematica", "biologia"] });
    expect(ClassMetricsSchema.parse(first)).toEqual(second);
    expect(gateway.source).toBe("fake");
    expect(first.notes).toContain(FAKE_METRICS_NOTE);
    expect(first.className).toContain("demonstração");
    expect(first.students.every((student) => student.displayName.startsWith("Aluno fictício"))).toBe(true);
    expect(first.subjectProgress.map((item) => item.subjectId)).toEqual(["matematica", "biologia"]);
  });
});

describe("adapter do núcleo de aprendizagem", () => {
  it("monta métricas a partir de summary e ranking", async () => {
    const { fetchJson, calls } = fakeFetch((path) => {
      if (path.startsWith("/api/learning/ranking")) {
        return { status: 200, body: { classId: "class-a", rankCalibration: "proposed", top10: [{ position: 1, studentId: "s1", name: "Ana", xp: 300, rankPoints: 300, rankName: "Bronze (proposta)" }] } };
      }
      const studentId = new URLSearchParams(path.split("?")[1]).get("studentId")!;
      if (studentId === "s3") return { status: 404, body: { error: { code: "NOT_FOUND", message: "x" } } };
      return { status: 200, body: summaryBody(studentId, studentId === "s2" ? { correctAnswers: 0, incorrectAnswers: 4 } : {}) };
    });
    const gateway = createLearningTeacherMetricsGateway({ fetchJson, roster: { getClassRoster: async () => roster } });
    const metrics = ClassMetricsSchema.parse(await gateway.getClassMetrics(request));

    expect(calls).toContain("/api/learning/summary?studentId=s1&from=2026-10-26&to=2026-10-30");
    expect(calls).toContain("/api/learning/ranking?classId=class-a");
    expect(metrics.studentsEnrolled).toBe(3);
    expect(metrics.students.map((student) => [student.displayName, student.accessDays])).toEqual([["Ana", null], ["Bruno", null]]);
    expect(metrics.subjectProgress).toEqual([{ subjectId: "matematica", activeActivities: null, answeredOriginals: 8 }]);
    expect(metrics.topStudents).toEqual([{ position: 1, displayName: "Ana", xp: 300 }]);
    expect(metrics.notes.some((note) => note.includes("1 aluno(s)"))).toBe(true);
  });

  it("não atribui progresso a uma matéria quando o resumo soma várias", async () => {
    const { fetchJson } = fakeFetch((path) => path.includes("ranking")
      ? { status: 503, body: null }
      : { status: 200, body: summaryBody(new URLSearchParams(path.split("?")[1]).get("studentId")!) });
    const gateway = createLearningTeacherMetricsGateway({ fetchJson, roster: { getClassRoster: async () => roster } });
    const metrics = await gateway.getClassMetrics({ ...request, subjectIds: ["matematica", "biologia"] });
    expect(metrics.subjectProgress.every((item) => item.answeredOriginals === null)).toBe(true);
    expect(metrics.topStudents).toEqual([]);
  });

  it("recusa resumo de outro aluno ou fora do contrato", async () => {
    const { fetchJson } = fakeFetch(() => ({ status: 200, body: summaryBody("intruso") }));
    const gateway = createLearningTeacherMetricsGateway({ fetchJson, roster: { getClassRoster: async () => roster } });
    await expect(gateway.getClassMetrics(request)).rejects.toBeInstanceOf(TeacherMetricsUnavailableError);
  });

  it("traduz 401 e turma sem vínculo em erro explícito", async () => {
    const unauthorized = createLearningTeacherMetricsGateway({
      fetchJson: async () => ({ status: 401, body: null }),
      roster: { getClassRoster: async () => roster },
    });
    await expect(unauthorized.getClassMetrics(request)).rejects.toThrow("sessão expirou");
    const noRoster = createLearningTeacherMetricsGateway({
      fetchJson: async () => ({ status: 200, body: null }),
      roster: { getClassRoster: async () => null },
    });
    await expect(noRoster.getClassMetrics(request)).rejects.toThrow("Turma não encontrada");
  });
});

describe("composição do painel", () => {
  const session: SessionContext = {
    userId: "teacher-1", roles: ["professor"], institutionId: "school-1",
    guardianStudentIds: [], coordinatorInstitutionIds: [],
    teacherAssignments: [
      { institutionId: "school-1", classId: "class-a", subjectId: "matematica" },
      { institutionId: "school-1", classId: "class-b", subjectId: "portugues" },
      { institutionId: "school-9", classId: "class-z", subjectId: "historia" },
    ],
  };

  it("pede ao gateway só as turmas atribuídas e isola falhas por turma", async () => {
    const requested: string[] = [];
    const inner = createFakeTeacherMetricsGateway();
    const gateway: TeacherMetricsGateway = {
      source: "fake",
      async getClassMetrics(input) {
        requested.push(`${input.institutionId}/${input.classId}/${input.subjectIds.join(",")}`);
        if (input.classId === "class-b") throw new TeacherMetricsUnavailableError("Fora do ar.");
        return inner.getClassMetrics(input);
      },
    };
    const overview = await composeTeacherOverview(session, gateway, { now: new Date("2026-10-30T15:00:00Z") });
    expect(requested).toEqual(["school-1/class-a/matematica", "school-1/class-b/portugues"]);
    expect(overview.classes.map((item) => item.classId)).toEqual(["class-a"]);
    expect(overview.unavailableClasses).toEqual([{ classId: "class-b", message: "Fora do ar." }]);
    expect(overview.period).toEqual({ from: "2026-10-26", to: "2026-10-30", days: 5 });
    expect(overview.notices[0]).toContain("demonstração");
    expect(overview.classes[0].subjects.map((item) => item.subjectId)).toEqual(["matematica"]);
  });

  it("não expõe detalhe de erro inesperado", async () => {
    const gateway: TeacherMetricsGateway = { source: "learning", getClassMetrics: async () => { throw new Error("token=abc"); } };
    const overview = await composeTeacherOverview({ ...session, teacherAssignments: session.teacherAssignments.slice(0, 1) }, gateway);
    expect(overview.unavailableClasses[0].message).not.toContain("token");
  });

  it("avisa quando o professor não tem atribuição", async () => {
    const overview = await composeTeacherOverview({ ...session, teacherAssignments: [] }, createFakeTeacherMetricsGateway());
    expect(overview.classes).toEqual([]);
    expect(overview.notices.some((notice) => notice.includes("atribuída"))).toBe(true);
  });
});
