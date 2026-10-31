import "server-only";
import type { GeneratedQuestion, QuestionAnswerKey, QuestionForStudent, StudentPreferences, StudentSummary } from "@/contracts";

export type GenerationContext = {
  original: QuestionForStudent;
  preferences: Pick<StudentPreferences, "interests" | "context" | "version">;
};

export interface LearningAiGateway {
  extractQuestions(input: { text: string; subjectId: string; grade: number }): Promise<GeneratedQuestion[]>;
  adaptQuestion(input: GenerationContext): Promise<GeneratedQuestion>;
  generateRecoveryQuestion(input: GenerationContext & { selectedOptionId: string }): Promise<GeneratedQuestion>;
  generateHint(input: { question: QuestionForStudent }): Promise<{ text: string }>;
  explainAnswer(input: { question: QuestionForStudent; answerKey: QuestionAnswerKey; selectedOptionId: string }): Promise<{ text: string }>;
  summarizeStudent(input: { summary: StudentSummary }): Promise<{ text: string }>;
}

export class AiNotConfiguredError extends Error {
  constructor() {
    super("O gateway de IA está preparado, mas o adaptador do fornecedor ainda precisa ser implementado na Tarefa 04.");
    this.name = "AiNotConfiguredError";
  }
}

class DisabledLearningAiGateway implements LearningAiGateway {
  extractQuestions(): Promise<GeneratedQuestion[]> { return Promise.reject(new AiNotConfiguredError()); }
  adaptQuestion(): Promise<GeneratedQuestion> { return Promise.reject(new AiNotConfiguredError()); }
  generateRecoveryQuestion(): Promise<GeneratedQuestion> { return Promise.reject(new AiNotConfiguredError()); }
  generateHint(): Promise<{ text: string }> { return Promise.reject(new AiNotConfiguredError()); }
  explainAnswer(): Promise<{ text: string }> { return Promise.reject(new AiNotConfiguredError()); }
  summarizeStudent(): Promise<{ text: string }> { return Promise.reject(new AiNotConfiguredError()); }
}

export function getLearningAiGateway(): LearningAiGateway {
  // Explicitly disabled until a compatible provider is implemented. No synthetic output is returned as real generation.
  return new DisabledLearningAiGateway();
}
