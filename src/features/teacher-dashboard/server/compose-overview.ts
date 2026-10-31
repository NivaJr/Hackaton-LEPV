import type { SessionContext } from "@/contracts";
import { buildClassOverview } from "../domain/aggregate";
import { ClassMetricsSchema, type TeacherOverview } from "../domain/model";
import { currentWeekPeriod } from "../domain/period";
import { getTeacherClassScopes } from "../domain/scope";
import { TeacherMetricsUnavailableError, type TeacherMetricsGateway } from "../ports";

export const FAKE_SOURCE_NOTICE = "Painel em modo demonstração: turmas, alunos e números abaixo são sintéticos.";
export const INVALID_SOURCE_NOTICE = "TEACHER_METRICS_SOURCE tem um valor desconhecido. O painel voltou para a demonstração.";
export const NO_ASSIGNMENTS_NOTICE = "Você ainda não tem turma ou matéria atribuída. Peça à coordenação para fazer o vínculo.";

/** Scope comes from the server session; the gateway only receives classes the teacher is assigned to. */
export async function composeTeacherOverview(
  session: SessionContext,
  gateway: TeacherMetricsGateway,
  options: { now?: Date; invalidSource?: boolean } = {},
): Promise<TeacherOverview> {
  const period = currentWeekPeriod(options.now ?? new Date());
  const scopes = getTeacherClassScopes(session);
  const notices: string[] = [];
  if (gateway.source === "fake") notices.push(FAKE_SOURCE_NOTICE);
  if (options.invalidSource) notices.push(INVALID_SOURCE_NOTICE);
  if (!scopes.length) notices.push(NO_ASSIGNMENTS_NOTICE);

  const results = await Promise.all(scopes.map(async (scope) => {
    try {
      const raw = await gateway.getClassMetrics({ ...scope, from: period.from, to: period.to });
      return { ok: true as const, overview: buildClassOverview(ClassMetricsSchema.parse(raw), scope, period) };
    } catch (error) {
      const message = error instanceof TeacherMetricsUnavailableError
        ? error.message
        : "Não foi possível carregar as métricas desta turma.";
      return { ok: false as const, classId: scope.classId, message };
    }
  }));

  return {
    source: gateway.source,
    period,
    classes: results.flatMap((result) => result.ok ? [result.overview] : []),
    unavailableClasses: results.flatMap((result) => result.ok ? [] : [{ classId: result.classId, message: result.message }]),
    notices,
  };
}
