import {
  AttemptResultSchema,
  AttemptSubmissionSchema,
  QuestionForStudentSchema,
  RecoveryStateSchema,
  StudentPreferencesSchema,
  StudentPreferencesUpdateSchema,
  StudentSummarySchema,
  type AttemptSubmission,
  type StudentPreferencesUpdate,
} from "@/contracts";
import type {
  ActivityList,
  AttemptResponse,
  QuestionState,
  RankingResponse,
  StudentLearningClient,
  StudentLearningSnapshot,
} from "./types";
import { LearningClientError } from "./types";

async function learning(path: string, method = "GET", body?: unknown): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(`/api/learning/${path}`, {
      method,
      credentials: "same-origin",
      cache: "no-store",
      ...(body === undefined ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
    });
  } catch {
    throw new LearningClientError("Não foi possível confirmar a conexão. Tente novamente; uma resposta já salva não receberá créditos duplicados.", "NETWORK_ERROR", 0);
  }
  const payload = await response.json().catch(() => ({})) as { error?: { code?: string; message?: string } };
  if (!response.ok) {
    throw new LearningClientError(payload.error?.message ?? "Não foi possível concluir a operação.", payload.error?.code ?? "UNKNOWN_ERROR", response.status);
  }
  return payload;
}

function asQuestionState(payload: unknown): QuestionState {
  const value = payload as { question: unknown; status: "pending" | "answered"; result?: unknown };
  return { question: QuestionForStudentSchema.parse(value.question), status: value.status, ...(value.result ? { result: AttemptResultSchema.parse(value.result) } : {}) };
}

function brazilDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
}

export function createHttpStudentLearningClient(): StudentLearningClient {
  return {
    async recordAccess() { await learning("access", "POST", {}); },
    async loadSnapshot(): Promise<StudentLearningSnapshot> {
      const [preferencesPayload, activitiesPayload] = await Promise.all([
        learning("preferences"), learning("activities"),
      ]);
      const preferenceEnvelope = preferencesPayload as { preferences: unknown; saved: boolean };
      const rawActivities = activitiesPayload as Omit<ActivityList, "className"> & { className?: string };
      const activities: ActivityList = {
        ...rawActivities,
        className: rawActivities.className?.trim() || `${rawActivities.grade}º ano`,
      };
      const periodStart = `${activities.schoolYear}-01-01`;
      const periodEnd = brazilDate();
      const [summaryPayload, ranking] = await Promise.all([
        learning(`summary?from=${periodStart}&to=${periodEnd}`),
        this.getRanking(activities.classId),
      ]);
      const summaryEnvelope = summaryPayload as { summary: unknown; activityDates?: string[] };
      return {
        preferences: StudentPreferencesSchema.parse(preferenceEnvelope.preferences),
        preferencesSaved: preferenceEnvelope.saved,
        activities,
        summary: StudentSummarySchema.parse(summaryEnvelope.summary),
        ranking,
        activityDates: summaryEnvelope.activityDates ?? [],
      };
    },
    async savePreferences(input: StudentPreferencesUpdate) {
      const parsed = StudentPreferencesUpdateSchema.parse(input);
      return StudentPreferencesSchema.parse(await learning("preferences", "PUT", parsed));
    },
    async openActivity(rootQuestionId: string) {
      return asQuestionState(await learning(`activities/${encodeURIComponent(rootQuestionId)}/open`, "POST", {}));
    },
    async getQuestion(questionInstanceId: string) {
      return asQuestionState(await learning(`instances/${encodeURIComponent(questionInstanceId)}`));
    },
    async submitAttempt(input: AttemptSubmission): Promise<AttemptResponse> {
      const payload = await learning("attempts", "POST", AttemptSubmissionSchema.parse(input)) as { result: unknown; recoveryId: string | null };
      return { result: AttemptResultSchema.parse(payload.result), recoveryId: payload.recoveryId };
    },
    async getNextRecoveryQuestion(recoveryId: string) {
      return asQuestionState(await learning(`recoveries/${encodeURIComponent(recoveryId)}/next`, "POST", {}));
    },
    async getHint(questionInstanceId: string) {
      return await learning(`instances/${encodeURIComponent(questionInstanceId)}/hint`, "POST", {}) as { questionInstanceId: string; text: string };
    },
    async interruptRecovery(recoveryId: string) {
      const payload = await learning(`recoveries/${encodeURIComponent(recoveryId)}/interrupt`, "POST", {}) as { recoveryId: string; state: unknown };
      return { recoveryId: payload.recoveryId, state: RecoveryStateSchema.parse(payload.state) };
    },
    async getRanking(classId: string): Promise<RankingResponse> {
      return await learning(`ranking?classId=${encodeURIComponent(classId)}`) as RankingResponse;
    },
  };
}
