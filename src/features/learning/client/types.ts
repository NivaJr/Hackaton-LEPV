import type {
  AttemptResult,
  AttemptSubmission,
  Grade,
  QuestionForStudent,
  RecoveryState,
  StudentPreferences,
  StudentPreferencesUpdate,
  StudentSummary,
  SubjectId,
} from "@/contracts";

export type ActivityStatus = "not_started" | "pending" | "answered";

export interface StudentActivity {
  rootQuestionId: string;
  activityType: "exercise" | "weekly_challenge";
  subjectId: SubjectId;
  grade: Grade;
  skillCodes: string[];
  questionInstanceId: string | null;
  status: ActivityStatus;
  recoveryId: string | null;
  recoveryStatus: "in_progress" | "recovered" | "interrupted" | null;
  recoveryConsecutiveCorrect?: number;
}

export interface ActivityList {
  classId: string;
  className: string;
  grade: Grade;
  schoolYear: number;
  activities: StudentActivity[];
}

export interface QuestionState {
  question: QuestionForStudent;
  status: "pending" | "answered";
  result?: AttemptResult;
}

export interface AttemptResponse {
  result: AttemptResult;
  recoveryId: string | null;
}

export interface HintResponse {
  questionInstanceId: string;
  text: string;
}

export interface RankingEntry {
  position: number;
  studentId: string;
  name: string;
  xp: number;
  rankPoints: number;
  rankName: string;
}

export interface RankingResponse {
  classId: string;
  rankCalibration: "confirmed" | string;
  top10: RankingEntry[];
}

export interface StudentLearningSnapshot {
  activityDates?: string[];
  preferences: StudentPreferences;
  preferencesSaved: boolean;
  activities: ActivityList;
  summary: StudentSummary;
  ranking: RankingResponse;
}

export interface StudentLearningClient {
  recordAccess(): Promise<void>;
  loadSnapshot(): Promise<StudentLearningSnapshot>;
  savePreferences(input: StudentPreferencesUpdate): Promise<StudentPreferences>;
  openActivity(rootQuestionId: string): Promise<QuestionState>;
  getQuestion(questionInstanceId: string): Promise<QuestionState>;
  submitAttempt(input: AttemptSubmission): Promise<AttemptResponse>;
  getNextRecoveryQuestion(recoveryId: string): Promise<QuestionState>;
  getHint(questionInstanceId: string): Promise<HintResponse>;
  interruptRecovery(recoveryId: string): Promise<{ recoveryId: string; state: RecoveryState }>;
  getRanking(classId: string): Promise<RankingResponse>;
}

export class LearningClientError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "LearningClientError";
  }
}
