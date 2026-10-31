import type { AttemptResult, AttemptSubmission, RecoveryState, StudentPreferencesUpdate } from "@/contracts";
import { AttemptSubmissionSchema, StudentPreferencesUpdateSchema } from "@/contracts";
import {
  correctOptions,
  createDemoQuestion,
  demoActivities,
  demoPreferences,
  demoRanking,
  demoSubjectProgress,
  demoSummary,
} from "@/features/learning/fixtures/student-demo";
import type { AttemptResponse, QuestionState, StudentLearningClient, StudentLearningSnapshot } from "./types";
import { LearningClientError } from "./types";

function pause(milliseconds = 220) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export function createFakeStudentLearningClient(): StudentLearningClient {
  let preferences = structuredClone(demoPreferences);
  let activities = structuredClone(demoActivities);
  let summary = structuredClone(demoSummary);
  let ranking = structuredClone(demoRanking);
  let subjectProgress = structuredClone(demoSubjectProgress);
  const questions = new Map<string, QuestionState>();
  const attempts = new Map<string, AttemptResponse>();
  const selectedAnswers = new Map<string, string>();
  const idempotencyRequests = new Map<string, string>();
  const recoveryRoots = new Map<string, string>();
  const recoveryCorrect = new Map<string, number>();
  const closedRecoveries = new Set<string>();

  return {
    async recordAccess() { /* Demonstration has no remote persistence. */ },
    async loadSnapshot(): Promise<StudentLearningSnapshot> {
      await pause();
      return { preferences: structuredClone(preferences), preferencesSaved: true, activities: structuredClone(activities), summary: structuredClone(summary), ranking: structuredClone(ranking), subjectProgress: structuredClone(subjectProgress) };
    },
    async savePreferences(input: StudentPreferencesUpdate) {
      await pause();
      const parsed = StudentPreferencesUpdateSchema.parse(input);
      const changed = JSON.stringify(parsed) !== JSON.stringify({ interests: preferences.interests, context: preferences.context });
      preferences = { ...preferences, ...parsed, version: changed ? preferences.version + 1 : preferences.version, updatedAt: new Date().toISOString() };
      return structuredClone(preferences);
    },
    async openActivity(rootQuestionId: string) {
      await pause();
      const activity = activities.activities.find((item) => item.rootQuestionId === rootQuestionId);
      if (!activity) throw new LearningClientError("Atividade não encontrada.", "NOT_FOUND", 404);
      const question = createDemoQuestion(rootQuestionId);
      const existing = questions.get(question.questionInstanceId);
      if (existing) return structuredClone(existing);
      const state: QuestionState = { question, status: "pending" };
      questions.set(question.questionInstanceId, state);
      activity.questionInstanceId = question.questionInstanceId;
      activity.status = "pending";
      return structuredClone(state);
    },
    async getQuestion(questionInstanceId: string) {
      await pause();
      const state = questions.get(questionInstanceId);
      if (!state) throw new LearningClientError("Questão não encontrada.", "NOT_FOUND", 404);
      return structuredClone(state);
    },
    async submitAttempt(input: AttemptSubmission) {
      await pause(350);
      const parsed = AttemptSubmissionSchema.parse(input);
      const requestSignature = `${parsed.questionInstanceId}:${parsed.selectedOptionId}`;
      const previousRequest = idempotencyRequests.get(parsed.idempotencyKey);
      if (previousRequest && previousRequest !== requestSignature) {
        throw new LearningClientError("Esta chave de envio já foi usada em outra resposta.", "IDEMPOTENCY_CONFLICT", 409);
      }
      const replay = attempts.get(parsed.questionInstanceId);
      if (replay) {
        if (selectedAnswers.get(parsed.questionInstanceId) !== parsed.selectedOptionId) {
          throw new LearningClientError("Esta questão já foi respondida com outra alternativa.", "ALREADY_ANSWERED", 409);
        }
        return structuredClone(replay);
      }
      const state = questions.get(parsed.questionInstanceId);
      if (!state || state.status === "answered") throw new LearningClientError("Esta questão já foi respondida.", "ALREADY_ANSWERED", 409);
      const answer = correctOptions[state.question.subjectId];
      const isCorrect = parsed.selectedOptionId === answer;
      const isRecovery = state.question.sourceType === "recuperacao";
      const recoveryId = isCorrect && !isRecovery ? null : `recovery-${state.question.rootQuestionId}`;
      if (isRecovery && recoveryId && closedRecoveries.has(recoveryId)) throw new LearningClientError("A recuperação já foi encerrada.", "RECOVERY_CLOSED", 409);
      let consecutiveCorrect = 0;
      let recoveryStatus: AttemptResult["recoveryStatus"] = null;
      if (recoveryId) {
        recoveryRoots.set(recoveryId, state.question.rootQuestionId);
        consecutiveCorrect = isCorrect ? (recoveryCorrect.get(recoveryId) ?? 0) + 1 : 0;
        recoveryCorrect.set(recoveryId, consecutiveCorrect);
        recoveryStatus = consecutiveCorrect >= 2 ? "recovered" : "in_progress";
      }
      const result: AttemptResult = {
        attemptId: `attempt-${parsed.questionInstanceId}`,
        questionInstanceId: parsed.questionInstanceId,
        isCorrect,
        explanation: isCorrect ? "Boa! Você aplicou a habilidade corretamente." : "Ainda não. Observe os dados principais do enunciado e tente a mesma habilidade em um novo desafio.",
        xpAwarded: isCorrect && !isRecovery ? 100 : 0,
        rankPointsAwarded: isCorrect ? (isRecovery ? 35 : 100) : 0,
        consecutiveCorrect: Math.min(consecutiveCorrect, 2),
        recoveryStatus,
      };
      const response = { result, recoveryId };
      state.status = "answered";
      state.result = result;
      idempotencyRequests.set(parsed.idempotencyKey, requestSignature);
      selectedAnswers.set(parsed.questionInstanceId, parsed.selectedOptionId);
      attempts.set(parsed.questionInstanceId, response);
      summary = {
        ...summary,
        correctAnswers: summary.correctAnswers + (isCorrect ? 1 : 0),
        incorrectAnswers: summary.incorrectAnswers + (isCorrect ? 0 : 1),
        xp: summary.xp + result.xpAwarded,
        rankPoints: summary.rankPoints + result.rankPointsAwarded,
      };
      subjectProgress = subjectProgress.map((entry) => entry.subjectId === state.question.subjectId
        ? { ...entry, earnedRankPoints: entry.earnedRankPoints + result.rankPointsAwarded } : entry);
      ranking = {
        ...ranking,
        top10: ranking.top10
          .map((entry) => entry.studentId === summary.studentId ? { ...entry, xp: summary.xp, rankPoints: summary.rankPoints } : entry)
          .sort((a, b) => b.xp - a.xp || b.rankPoints - a.rankPoints || a.studentId.localeCompare(b.studentId))
          .map((entry, index) => ({ ...entry, position: index + 1 })),
      };
      const activity = activities.activities.find((item) => item.rootQuestionId === state.question.rootQuestionId);
      if (activity) {
        activity.status = "answered";
        activity.recoveryId = recoveryId;
        activity.recoveryStatus = recoveryStatus;
        activity.recoveryConsecutiveCorrect = Math.min(consecutiveCorrect, 2);
      }
      return structuredClone(response);
    },
    async getNextRecoveryQuestion(recoveryId: string) {
      await pause(450);
      const rootQuestionId = recoveryRoots.get(recoveryId);
      if (!rootQuestionId) throw new LearningClientError("Recuperação não encontrada.", "NOT_FOUND", 404);
      if (closedRecoveries.has(recoveryId) || (recoveryCorrect.get(recoveryId) ?? 0) >= 2) throw new LearningClientError("A recuperação já foi encerrada.", "RECOVERY_CLOSED", 409);
      const pending = [...questions.values()].find((item) => item.question.rootQuestionId === rootQuestionId && item.question.sourceType === "recuperacao" && item.status === "pending");
      if (pending) return structuredClone(pending);
      const base = createDemoQuestion(rootQuestionId, true);
      const count = [...questions.values()].filter((item) => item.question.rootQuestionId === rootQuestionId && item.question.sourceType === "recuperacao").length + 1;
      const question = { ...base, questionInstanceId: `${base.questionInstanceId}-${count}`, questionId: `${base.questionId}-${count}` };
      const state: QuestionState = { question, status: "pending" };
      questions.set(question.questionInstanceId, state);
      return structuredClone(state);
    },
    async getHint(questionInstanceId: string) {
      await pause();
      const state = questions.get(questionInstanceId);
      if (!state || state.status !== "pending" || state.question.sourceType !== "recuperacao" || closedRecoveries.has(`recovery-${state.question.rootQuestionId}`)) throw new LearningClientError("A dica não está disponível para esta questão.", "HINT_UNAVAILABLE", 409);
      return { questionInstanceId, text: "Separe as informações importantes e elimine primeiro as alternativas que não combinam com o enunciado." };
    },
    async interruptRecovery(recoveryId: string) {
      await pause();
      if (!recoveryRoots.has(recoveryId)) throw new LearningClientError("Recuperação não encontrada.", "NOT_FOUND", 404);
      closedRecoveries.add(recoveryId);
      const state: RecoveryState = { status: "interrupted", consecutiveCorrect: Math.min(recoveryCorrect.get(recoveryId) ?? 0, 1), answeredCount: [...attempts.values()].filter((item) => item.recoveryId === recoveryId).length };
      const activity = activities.activities.find((item) => item.recoveryId === recoveryId);
      if (activity) activity.recoveryStatus = "interrupted";
      return { recoveryId, state };
    },
    async getRanking(classId: string) {
      await pause();
      if (classId !== ranking.classId) throw new LearningClientError("Turma não encontrada.", "NOT_FOUND", 404);
      return structuredClone(ranking);
    },
  };
}
