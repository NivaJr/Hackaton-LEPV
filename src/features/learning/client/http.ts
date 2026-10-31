import {
  AttemptResultSchema,
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
  const response = await fetch(`/api/learning/${path}`, {
    method,
    credentials: "same-origin",
    cache: "no-store",
    ...(body === undefined ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
  });
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

export function createHttpStudentLearningClient(): StudentLearningClient {
  return {
    async loadSnapshot(): Promise<StudentLearningSnapshot> {
      const [preferencesPayload, activitiesPayload, summaryPayload] = await Promise.all([
        learning("preferences"), learning("activities"), learning("summary"),
      ]);
      const preferenceEnvelope = preferencesPayload as { preferences: unknown; saved: boolean };
      const activities = activitiesPayload as ActivityList;
      const summaryEnvelope = summaryPayload as { summary: unknown };
      const ranking = await this.getRanking(activities.classId);
      return {
        preferences: StudentPreferencesSchema.parse(preferenceEnvelope.preferences),
        preferencesSaved: preferenceEnvelope.saved,
        activities,
        summary: StudentSummarySchema.parse(summaryEnvelope.summary),
        ranking,
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
      const payload = await learning("attempts", "POST", input) as { result: unknown; recoveryId: string | null };
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
