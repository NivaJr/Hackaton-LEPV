import { describe, expect, it } from "vitest";
import type { SessionContext } from "@/contracts";
import {
  aggregateSkillDifficulties,
  buildClassOverview,
  countDays,
  currentWeekPeriod,
  getTeacherClassScopes,
  rankStudentsToImprove,
  resolveTeacherMetricsSource,
  restrictMetricsToScope,
  summarizeEngagement,
  type ClassMetrics,
  type StudentClassMetrics,
} from "@/features/teacher-dashboard";

function student(id: string, values: Partial<StudentClassMetrics> = {}): StudentClassMetrics {
  return {
    studentId: id,
    displayName: `Aluno ${id}`,
    activityDays: 3,
    accessDays: 3,
    correctAnswers: 8,
    incorrectAnswers: 2,
    difficultSkillCodes: [],
    ...values,
  };
}

const teacher: SessionContext = {
  userId: "teacher-1",
  roles: ["professor"],
  institutionId: "school-1",
  guardianStudentIds: [],
  coordinatorInstitutionIds: [],
  teacherAssignments: [
    { institutionId: "school-1", classId: "class-a", subjectId: "matematica" },
    { institutionId: "school-1", classId: "class-a", subjectId: "biologia" },
    { institutionId: "school-1", classId: "class-a", subjectId: "matematica" },
    { institutionId: "school-1", classId: "class-b", subjectId: "portugues" },
    { institutionId: "school-2", classId: "class-x", subjectId: "historia" },
  ],
};

describe("escopo do professor", () => {
  it("usa somente atribuições da própria escola, sem duplicar matérias", () => {
    expect(getTeacherClassScopes(teacher)).toEqual([
      { institutionId: "school-1", classId: "class-a", subjectIds: ["matematica", "biologia"] },
      { institutionId: "school-1", classId: "class-b", subjectIds: ["portugues"] },
    ]);
  });

  it("não devolve turmas para quem não é professor", () => {
    expect(getTeacherClassScopes({ ...teacher, roles: ["coordenador"] })).toEqual([]);
  });

  it("remove matérias e habilidades fora da atribuição e recusa outra turma", () => {
    const metrics: ClassMetrics = {
      classId: "class-a", className: "6º A", grade: 6, studentsEnrolled: 1,
      students: [student("1", { difficultSkillCodes: ["EF06MA01", "EF06HI01", "EF07MA04", "EF06CI05", "EF06MA01"] })],
      subjectProgress: [
        { subjectId: "matematica", activeActivities: 10, answeredOriginals: 5 },
        { subjectId: "historia", activeActivities: 10, answeredOriginals: 9 },
      ],
      topStudents: [], notes: [],
    };
    const scope = getTeacherClassScopes(teacher)[0];
    const restricted = restrictMetricsToScope(metrics, scope);
    expect(restricted.subjectProgress.map((item) => item.subjectId)).toEqual(["matematica"]);
    expect(restricted.students[0].difficultSkillCodes).toEqual(["EF06MA01", "EF06CI05"]);
    expect(() => restrictMetricsToScope({ ...metrics, classId: "class-b" }, scope)).toThrow();
  });
});

describe("dificuldades por habilidade", () => {
  const scope = { grade: 6 as const, subjectIds: ["matematica"] as const };

  it("marca como coletiva a habilidade difícil para pelo menos 30% dos alunos com dados", () => {
    const students = [
      student("1", { difficultSkillCodes: ["EF06MA01"] }),
      student("2", { difficultSkillCodes: ["EF06MA01", "EF06MA03"] }),
      student("3", { difficultSkillCodes: ["EF06MA01"] }),
      ...Array.from({ length: 7 }, (_, index) => student(`x${index}`)),
      student("sem-dados", { correctAnswers: 0, incorrectAnswers: 0, difficultSkillCodes: ["EF06MA07"] }),
    ];
    const result = aggregateSkillDifficulties(students, scope);
    expect(result.map((item) => [item.skillCode, item.studentCount, item.scope])).toEqual([
      ["EF06MA01", 3, "coletiva"],
      ["EF06MA03", 1, "individual"],
    ]);
    expect(result[0].share).toBeCloseTo(0.3);
    expect(result[1].students).toEqual([{ studentId: "2", displayName: "Aluno 2" }]);
  });

  it("fica individual abaixo do limite", () => {
    const students = [student("1", { difficultSkillCodes: ["EF06MA01"] }), ...Array.from({ length: 4 }, (_, index) => student(`y${index}`))];
    expect(aggregateSkillDifficulties(students, scope)[0].scope).toBe("individual");
  });

  it("ignora habilidade incompatível com a matéria ou o ano", () => {
    const students = [student("1", { difficultSkillCodes: ["EF06LP01", "EF09MA01"] })];
    expect(aggregateSkillDifficulties(students, scope)).toEqual([]);
  });
});

describe("alunos a melhorar", () => {
  it("prioriza quem não respondeu e depois acerto baixo com pouca atividade", () => {
    const result = rankStudentsToImprove([
      student("bom"),
      student("parado", { activityDays: 0, accessDays: 0, correctAnswers: 0, incorrectAnswers: 0 }),
      student("baixo", { correctAnswers: 2, incorrectAnswers: 4 }),
      student("ambos", { activityDays: 1, accessDays: 1, correctAnswers: 1, incorrectAnswers: 3 }),
      student("pouco", { activityDays: 1, accessDays: 1, correctAnswers: 3, incorrectAnswers: 0 }),
    ], 5);
    expect(result.map((item) => [item.studentId, item.reasons])).toEqual([
      ["parado", ["sem_atividade"]],
      ["ambos", ["acerto_baixo", "pouca_atividade"]],
      ["baixo", ["acerto_baixo"]],
      ["pouco", ["pouca_atividade"]],
    ]);
  });

  it("não acusa acerto baixo com poucas respostas", () => {
    const result = rankStudentsToImprove([student("1", { correctAnswers: 0, incorrectAnswers: 2 })], 5);
    expect(result).toEqual([]);
  });

  it("não cobra dois dias quando a semana tem só um dia", () => {
    expect(rankStudentsToImprove([student("1", { activityDays: 1, accessDays: 1 })], 1)).toEqual([]);
  });

  it("respeita o limite", () => {
    const students = Array.from({ length: 12 }, (_, index) => student(`${index}`, { correctAnswers: 0, incorrectAnswers: 0, activityDays: 0 }));
    expect(rankStudentsToImprove(students, 5, 3)).toHaveLength(3);
  });
});

describe("engajamento", () => {
  it("usa dias de acesso quando todos têm o dado", () => {
    const summary = summarizeEngagement([
      student("1", { activityDays: 2, accessDays: 4 }),
      student("2", { activityDays: 0, accessDays: 0 }),
      student("3", { activityDays: 1, accessDays: 1 }),
    ], 5);
    expect(summary.basis).toBe("acesso");
    expect(summary.averageDays).toBeCloseTo(5 / 3);
    expect(summary.rate).toBeCloseTo(1 / 3);
    expect(summary.studentsWithActivity).toBe(2);
    expect(summary.buckets).toEqual({ none: 1, low: 1, regular: 1 });
  });

  it("cai para dias com respostas quando o acesso não é exposto", () => {
    const summary = summarizeEngagement([student("1", { activityDays: 2, accessDays: null }), student("2", { activityDays: 4 })], 5);
    expect(summary.basis).toBe("atividade");
    expect(summary.averageDays).toBe(3);
  });

  it("lida com turma vazia", () => {
    expect(summarizeEngagement([], 5)).toMatchObject({ studentsTotal: 0, averageDays: 0, rate: 0 });
  });
});

describe("período e visão da turma", () => {
  it("começa na segunda-feira de Brasília", () => {
    expect(currentWeekPeriod(new Date("2026-10-31T12:00:00Z"))).toEqual({ from: "2026-10-26", to: "2026-10-31", days: 6 });
    expect(currentWeekPeriod(new Date("2026-11-02T02:00:00Z"))).toEqual({ from: "2026-10-26", to: "2026-11-01", days: 7 });
    expect(currentWeekPeriod(new Date("2026-11-02T15:00:00Z"))).toEqual({ from: "2026-11-02", to: "2026-11-02", days: 1 });
    expect(countDays("2026-10-26", "2026-10-31")).toBe(6);
  });

  it("calcula progresso só das matérias atribuídas", () => {
    const overview = buildClassOverview({
      classId: "class-a", className: "6º A", grade: 6, studentsEnrolled: 2,
      students: [student("1"), student("2", { correctAnswers: 2, incorrectAnswers: 8 })],
      subjectProgress: [{ subjectId: "matematica", activeActivities: 10, answeredOriginals: 15 }],
      topStudents: [], notes: [],
    }, getTeacherClassScopes(teacher)[0], { from: "2026-10-26", to: "2026-10-30", days: 5 });
    expect(overview.subjects).toEqual([
      { subjectId: "matematica", subjectName: "Matemática", answeredOriginals: 15, expectedAnswers: 20, completion: 0.75 },
      { subjectId: "biologia", subjectName: "Biologia", answeredOriginals: null, expectedAnswers: null, completion: null },
    ]);
    expect(overview.accuracy).toBe(0.5);
    expect(overview.studentsToImprove.map((item) => item.studentId)).toEqual(["2"]);
  });
});

describe("fonte das métricas", () => {
  it("usa demonstração por padrão e sinaliza valor desconhecido", () => {
    expect(resolveTeacherMetricsSource(undefined)).toEqual({ source: "fake", invalid: false });
    expect(resolveTeacherMetricsSource(" Learning ")).toEqual({ source: "learning", invalid: false });
    expect(resolveTeacherMetricsSource("prod")).toEqual({ source: "fake", invalid: true });
  });
});
