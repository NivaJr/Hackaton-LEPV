import { isSkillCompatible, type Grade, type SubjectId } from "@/config/catalog";
import { ClassMetricsRequestSchema, type ClassMetrics, type StudentClassMetrics } from "../domain/model";
import { countDays } from "../domain/period";
import type { TeacherMetricsGateway } from "../ports";

export const FAKE_METRICS_NOTE = "Dados sintéticos de demonstração. Nenhum aluno real aparece aqui.";

/** Official BNCC codes used only as example labels for synthetic students. */
const EXAMPLE_SKILLS: Record<SubjectId, string[]> = {
  matematica: ["EF06MA01", "EF06MA03", "EF06MA07", "EF07MA04", "EF07MA18", "EF08MA01", "EF08MA06", "EF09MA01", "EF09MA09"],
  portugues: ["EF67LP04", "EF67LP28", "EF69LP03", "EF69LP44", "EF89LP04"],
  ingles: ["EF06LI01", "EF06LI02", "EF07LI01", "EF07LI02", "EF08LI01", "EF08LI02", "EF09LI01", "EF09LI02"],
  historia: ["EF06HI01", "EF06HI02", "EF07HI01", "EF07HI02", "EF08HI01", "EF08HI02", "EF09HI01", "EF09HI02"],
  geografia: ["EF06GE01", "EF06GE02", "EF07GE01", "EF07GE02", "EF08GE01", "EF08GE02", "EF09GE01", "EF09GE02"],
  biologia: ["EF06CI05", "EF06CI06", "EF07CI07", "EF07CI08", "EF08CI07", "EF08CI08", "EF09CI08", "EF09CI09"],
};

const ACTIVE_ACTIVITIES_PER_SUBJECT = 10;
const STUDENT_COUNT = 24;

function hash(value: string) {
  let result = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 16_777_619);
  }
  return result >>> 0;
}

function seededRandom(seed: number) {
  let state = seed || 1;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let next = Math.imul(state ^ (state >>> 15), 1 | state);
    next ^= next + Math.imul(next ^ (next >>> 7), 61 | next);
    return ((next ^ (next >>> 14)) >>> 0) / 4_294_967_296;
  };
}

export function exampleSkills(subjectId: SubjectId, grade: Grade) {
  return EXAMPLE_SKILLS[subjectId].filter((code) => isSkillCompatible(code, subjectId, grade));
}

export function createFakeTeacherMetricsGateway(): TeacherMetricsGateway {
  return {
    source: "fake",
    async getClassMetrics(input) {
      const request = ClassMetricsRequestSchema.parse(input);
      const seed = hash(request.classId);
      const random = seededRandom(seed);
      const grade = (6 + (seed % 4)) as Grade;
      const periodDays = Math.max(1, countDays(request.from, request.to));
      const skills = request.subjectIds.flatMap((subjectId) => exampleSkills(subjectId, grade));
      const commonSkill = skills[0];
      const xp: Array<{ name: string; xp: number }> = [];
      const students = Array.from({ length: STUDENT_COUNT }, (_, index): StudentClassMetrics => {
        const displayName = `Aluno fictício ${String(index + 1).padStart(2, "0")}`;
        const activityDays = Math.floor(random() * (periodDays + 1));
        const accessDays = Math.min(periodDays, activityDays + (random() < 0.4 ? 1 : 0));
        const answered = activityDays * (1 + Math.floor(random() * 4));
        const accuracy = 0.3 + random() * 0.65;
        const correctAnswers = Math.round(answered * accuracy);
        const difficult = new Set<string>();
        if (answered > 0) {
          if (commonSkill && random() < 0.45) difficult.add(commonSkill);
          for (const code of skills) if (random() < (1 - accuracy) * 0.3) difficult.add(code);
        }
        xp.push({ name: displayName, xp: correctAnswers * 100 });
        return {
          studentId: `demo-${seed.toString(36)}-${index + 1}`,
          displayName,
          activityDays,
          accessDays,
          correctAnswers,
          incorrectAnswers: answered - correctAnswers,
          difficultSkillCodes: [...difficult],
        };
      });
      const metrics: ClassMetrics = {
        classId: request.classId,
        className: `${grade}º ano ${String.fromCharCode(65 + (seed % 3))} (demonstração)`,
        grade,
        studentsEnrolled: STUDENT_COUNT,
        students,
        subjectProgress: request.subjectIds.map((subjectId) => ({
          subjectId,
          activeActivities: ACTIVE_ACTIVITIES_PER_SUBJECT,
          answeredOriginals: Math.floor(STUDENT_COUNT * ACTIVE_ACTIVITIES_PER_SUBJECT * (0.25 + random() * 0.6)),
        })),
        topStudents: xp.sort((a, b) => b.xp - a.xp || a.name.localeCompare(b.name)).slice(0, 10)
          .map((item, index) => ({ position: index + 1, displayName: item.name, xp: item.xp })),
        notes: [FAKE_METRICS_NOTE],
      };
      return metrics;
    },
  };
}
