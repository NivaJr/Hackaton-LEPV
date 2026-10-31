import { z } from "zod";
import { GradeSchema, IdSchema, StudentSummarySchema } from "@/contracts";
import { ClassMetricsRequestSchema, type ClassMetrics, type StudentClassMetrics } from "../domain/model";
import { TeacherMetricsUnavailableError, type TeacherMetricsGateway } from "../ports";

/** GET against the learning API on the same deployment; path always starts with /api/learning/. */
export type LearningJsonFetch = (path: string) => Promise<{ status: number; body: unknown }>;

export const ClassRosterSchema = z.object({
  classId: IdSchema,
  className: z.string().trim().min(1).max(100),
  grade: GradeSchema,
  students: z.array(z.object({ studentId: IdSchema, displayName: z.string().trim().min(1).max(200) }).strict()),
}).strict();
export type ClassRoster = z.infer<typeof ClassRosterSchema>;

export interface ClassRosterSource {
  getClassRoster(institutionId: string, classId: string): Promise<ClassRoster | null>;
}

const SummaryEnvelopeSchema = z.object({
  summary: StudentSummarySchema,
  accessDaysScope: z.enum(["student", "not_available_for_subject"]),
  originalAttempts: z.number().int().nonnegative(),
  recoveryAttempts: z.number().int().nonnegative(),
});

const RankingEnvelopeSchema = z.object({
  classId: IdSchema,
  top10: z.array(z.object({
    position: z.number().int().min(1).max(10),
    studentId: IdSchema,
    name: z.string().trim().min(1).max(200),
    xp: z.number().nonnegative(),
  })).max(10),
});

export const ACCESS_DAYS_NOTE = "O núcleo não mostra dias de acesso ao professor. O engajamento conta os dias com respostas.";
export const MIXED_SUBJECTS_NOTE = "O resumo do núcleo soma as matérias que você leciona nesta turma, então o progresso por matéria ainda não aparece.";
export const RANKING_UNAVAILABLE_NOTE = "O ranking da turma não respondeu agora.";

const SUMMARY_CONCURRENCY = 6;

async function mapLimit<T, R>(items: T[], limit: number, task: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await task(items[index]);
    }
  });
  await Promise.all(workers);
  return results;
}

function failure(status: number): TeacherMetricsUnavailableError {
  if (status === 401) return new TeacherMetricsUnavailableError("Sua sessão expirou. Entre de novo para ver a turma.");
  if (status === 403) return new TeacherMetricsUnavailableError("Seu perfil não tem acesso a estes dados.");
  if (status === 503) return new TeacherMetricsUnavailableError("O serviço de aprendizagem está sem configuração ou fora do ar.");
  return new TeacherMetricsUnavailableError("Não foi possível carregar as métricas desta turma.");
}

export function createLearningTeacherMetricsGateway(deps: { fetchJson: LearningJsonFetch; roster: ClassRosterSource }): TeacherMetricsGateway {
  return {
    source: "learning",
    async getClassMetrics(input) {
      const request = ClassMetricsRequestSchema.parse(input);
      const rosterValue = await deps.roster.getClassRoster(request.institutionId, request.classId);
      if (!rosterValue) throw new TeacherMetricsUnavailableError("Turma não encontrada para o seu perfil.");
      const roster = ClassRosterSchema.parse(rosterValue);
      if (roster.classId !== request.classId) throw new TeacherMetricsUnavailableError("A lista de alunos veio de outra turma.");

      const loaded = await mapLimit(roster.students, SUMMARY_CONCURRENCY, async (student) => {
        const query = new URLSearchParams({ studentId: student.studentId, from: request.from, to: request.to });
        const response = await deps.fetchJson(`/api/learning/summary?${query}`);
        if (response.status === 404) return null;
        if (response.status !== 200) throw failure(response.status);
        const parsed = SummaryEnvelopeSchema.safeParse(response.body);
        if (!parsed.success || parsed.data.summary.studentId !== student.studentId) {
          throw new TeacherMetricsUnavailableError("O resumo de aprendizagem veio em formato inesperado.");
        }
        const { summary, accessDaysScope, originalAttempts } = parsed.data;
        const metrics: StudentClassMetrics = {
          studentId: student.studentId,
          displayName: student.displayName,
          activityDays: summary.activityDays,
          accessDays: accessDaysScope === "student" ? summary.accessDays : null,
          correctAnswers: summary.correctAnswers,
          incorrectAnswers: summary.incorrectAnswers,
          difficultSkillCodes: summary.difficultSkillCodes,
        };
        return { metrics, originalAttempts };
      });
      const available = loaded.filter((item): item is NonNullable<typeof item> => item !== null);
      const students = available.map((item) => item.metrics);
      const originalAttempts = available.reduce((sum, item) => sum + item.originalAttempts, 0);
      const notes: string[] = [];
      if (students.some((student) => student.accessDays === null)) notes.push(ACCESS_DAYS_NOTE);
      if (request.subjectIds.length > 1) notes.push(MIXED_SUBJECTS_NOTE);
      if (available.length < roster.students.length) {
        notes.push(`${roster.students.length - available.length} aluno(s) da lista ainda sem resumo no núcleo.`);
      }

      let topStudents: ClassMetrics["topStudents"] = [];
      try {
        const ranking = await deps.fetchJson(`/api/learning/ranking?${new URLSearchParams({ classId: request.classId })}`);
        const parsed = ranking.status === 200 ? RankingEnvelopeSchema.safeParse(ranking.body) : null;
        if (parsed?.success && parsed.data.classId === request.classId) {
          topStudents = parsed.data.top10.map((row) => ({ position: row.position, displayName: row.name, xp: row.xp }));
        } else notes.push(RANKING_UNAVAILABLE_NOTE);
      } catch {
        notes.push(RANKING_UNAVAILABLE_NOTE);
      }

      return {
        classId: roster.classId,
        className: roster.className,
        grade: roster.grade,
        studentsEnrolled: roster.students.length,
        students,
        subjectProgress: request.subjectIds.map((subjectId) => ({
          subjectId,
          activeActivities: null,
          answeredOriginals: request.subjectIds.length === 1 ? originalAttempts : null,
        })),
        topStudents,
        notes,
      };
    },
  };
}
