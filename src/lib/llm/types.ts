import type {
  GeneratedQuestion,
  Grade,
  QuestionAnswerKey,
  QuestionForStudent,
  StudentPreferences,
  StudentSummary,
  SubjectId,
} from "@/contracts";
import type { DraftQuestion } from "./draft-question";

export type { DraftQuestion };

export type GenerationContext = {
  original: QuestionForStudent;
  preferences: Pick<StudentPreferences, "interests" | "context" | "version">;
};

export type TextExtractionInput = { text: string; subjectId: string; grade: number };

export type DocumentExtractionInput = {
  mimeType: "application/pdf";
  dataBase64: string;
  subjectId: SubjectId;
  grade: Grade;
};

export interface LearningAiGateway {
  extractQuestions(input: TextExtractionInput): Promise<DraftQuestion[]>;
  extractQuestionsFromDocument(input: DocumentExtractionInput): Promise<DraftQuestion[]>;
  adaptQuestion(input: GenerationContext): Promise<GeneratedQuestion>;
  generateRecoveryQuestion(input: GenerationContext & { selectedOptionId: string }): Promise<GeneratedQuestion>;
  generateHint(input: { question: QuestionForStudent }): Promise<{ text: string }>;
  explainAnswer(input: { question: QuestionForStudent; answerKey: QuestionAnswerKey; selectedOptionId: string }): Promise<{ text: string }>;
  summarizeStudent(input: { summary: StudentSummary }): Promise<{ text: string }>;
}

export type ExtractionIssue = { index: number; reason: string };

/**
 * Valid questions only; items the provider returned but the schemas rejected are counted, never repaired.
 * skillCodes holds only compatible codes the model copied from the document and may be empty.
 */
export type ExtractionReport = {
  questions: DraftQuestion[];
  discarded: number;
  issues: ExtractionIssue[];
};

export interface ExtractionReportingGateway {
  extractQuestionsReport(input: TextExtractionInput | DocumentExtractionInput): Promise<ExtractionReport>;
}

export type LearningAiGatewayWithReports = LearningAiGateway & ExtractionReportingGateway;
