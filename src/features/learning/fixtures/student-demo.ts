import type { QuestionForStudent, StudentPreferences, StudentSummary } from "@/contracts";
import type { ActivityList, RankingResponse } from "@/features/learning/client/types";

export const DEMO_STUDENT_ID = "student-viegas-demo";

export const demoPreferences: StudentPreferences = {
  studentId: DEMO_STUDENT_ID,
  interests: ["futebol", "jogos", "música"],
  context: "Gosto de exemplos diretos e desafios curtos.",
  version: 1,
  updatedAt: "2026-10-30T23:00:00.000Z",
};

export const demoActivities: ActivityList = {
  classId: "class-7a-demo",
  className: "7º ano A",
  grade: 7,
  schoolYear: 2026,
  activities: [
    { rootQuestionId: "math-root-01", subjectId: "matematica", grade: 7, skillCodes: ["EF07MA01"], questionInstanceId: null, status: "not_started", recoveryId: null, recoveryStatus: null },
    { rootQuestionId: "port-root-01", subjectId: "portugues", grade: 7, skillCodes: ["EF07LP01"], questionInstanceId: null, status: "not_started", recoveryId: null, recoveryStatus: null },
    { rootQuestionId: "eng-root-01", subjectId: "ingles", grade: 7, skillCodes: ["EF07LI01"], questionInstanceId: null, status: "not_started", recoveryId: null, recoveryStatus: null },
    { rootQuestionId: "hist-root-01", subjectId: "historia", grade: 7, skillCodes: ["EF07HI01"], questionInstanceId: null, status: "not_started", recoveryId: null, recoveryStatus: null },
    { rootQuestionId: "geo-root-01", subjectId: "geografia", grade: 7, skillCodes: ["EF07GE01"], questionInstanceId: null, status: "not_started", recoveryId: null, recoveryStatus: null },
    { rootQuestionId: "bio-root-01", subjectId: "biologia", grade: 7, skillCodes: ["EF07CI01"], questionInstanceId: null, status: "not_started", recoveryId: null, recoveryStatus: null },
  ],
};

const statements: Record<string, Pick<QuestionForStudent, "statement" | "options">> = {
  matematica: { statement: "Uma equipe marcou 18 pontos no primeiro jogo e 27 no segundo. Quantos pontos marcou ao todo?", options: [{ id: "a", text: "35 pontos" }, { id: "b", text: "45 pontos" }, { id: "c", text: "55 pontos" }, { id: "d", text: "65 pontos" }] },
  portugues: { statement: "Na frase ‘A turma resolveu rapidamente o desafio’, qual palavra indica o modo como o desafio foi resolvido?", options: [{ id: "a", text: "turma" }, { id: "b", text: "resolveu" }, { id: "c", text: "rapidamente" }, { id: "d", text: "desafio" }] },
  ingles: { statement: "Complete a frase: ‘My friends ___ soccer after school.’", options: [{ id: "a", text: "plays" }, { id: "b", text: "play" }, { id: "c", text: "playing" }, { id: "d", text: "played is" }] },
  historia: { statement: "Qual alternativa representa uma fonte histórica escrita?", options: [{ id: "a", text: "Uma carta antiga" }, { id: "b", text: "Uma ferramenta de pedra" }, { id: "c", text: "Uma construção" }, { id: "d", text: "Uma pintura sem texto" }] },
  geografia: { statement: "Qual elemento de um mapa explica o significado das cores e dos símbolos usados?", options: [{ id: "a", text: "Escala" }, { id: "b", text: "Legenda" }, { id: "c", text: "Título" }, { id: "d", text: "Orientação" }] },
  biologia: { statement: "Qual estrutura celular controla a entrada e a saída de substâncias da célula?", options: [{ id: "a", text: "Membrana plasmática" }, { id: "b", text: "Núcleo" }, { id: "c", text: "Citoplasma" }, { id: "d", text: "Ribossomo" }] },
};

export const correctOptions: Record<string, string> = {
  matematica: "b", portugues: "c", ingles: "b", historia: "a", geografia: "b", biologia: "a",
};

export function createDemoQuestion(rootQuestionId: string, recovery = false): QuestionForStudent {
  const activity = demoActivities.activities.find((item) => item.rootQuestionId === rootQuestionId) ?? demoActivities.activities[0];
  const content = statements[activity.subjectId];
  return {
    questionInstanceId: `${rootQuestionId}-${recovery ? "recovery" : "original"}-instance`,
    questionId: `${rootQuestionId}-${recovery ? "recovery" : "original"}`,
    rootQuestionId,
    subjectId: activity.subjectId,
    grade: activity.grade,
    skillCodes: activity.skillCodes,
    statement: recovery ? `Novo desafio sobre a mesma habilidade: ${content.statement}` : content.statement,
    options: content.options,
    sourceType: recovery ? "recuperacao" : "original",
    preferencesVersion: demoPreferences.version,
  };
}

export const demoSummary: StudentSummary = {
  studentId: DEMO_STUDENT_ID,
  periodStart: "2026-10-01",
  periodEnd: "2026-10-30",
  accessDays: 8,
  activityDays: 6,
  correctAnswers: 12,
  incorrectAnswers: 4,
  xp: 1240,
  rankPoints: 860,
  rankName: "Bronze (proposta)",
  difficultSkillCodes: ["EF07MA01"],
};

export const demoRanking: RankingResponse = {
  classId: demoActivities.classId,
  rankCalibration: "proposed",
  top10: [
    { position: 1, studentId: "student-1", name: "Lucas Martins", xp: 1560, rankPoints: 1040, rankName: "Prata (proposta)" },
    { position: 2, studentId: "student-2", name: "Beatriz Souza", xp: 1420, rankPoints: 950, rankName: "Bronze (proposta)" },
    { position: 3, studentId: DEMO_STUDENT_ID, name: "Ana Lima", xp: 1240, rankPoints: 860, rankName: "Bronze (proposta)" },
    { position: 4, studentId: "student-4", name: "Rafael Costa", xp: 1170, rankPoints: 790, rankName: "Bronze (proposta)" },
    { position: 5, studentId: "student-5", name: "Mariana Alves", xp: 1080, rankPoints: 740, rankName: "Bronze (proposta)" },
  ],
};
