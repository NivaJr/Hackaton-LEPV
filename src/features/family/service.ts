import type { SessionContext, StudentSummary } from "@/contracts";
import { canEditStudentData, canViewStudentData } from "@/features/learning/domain/permissions";
import { FamilyError, FamilyRecordCategorySchema, FamilyRecordInputSchema, type FeedbackResult, type StudentOverview } from "./model";
import type { FamilyMetricsGateway, FamilyRepository } from "./ports";

const PERIOD_DAYS = 30;

export interface FamilyDependencies {
  repository: FamilyRepository;
  metrics: FamilyMetricsGateway;
  /** Receives only the learning summary: health and support data never reach the AI gateway. */
  summarize(input: { summary: StudentSummary }): Promise<{ text: string }>;
  now?(): Date;
}

function deterministicFeedback(summary: StudentSummary): string {
  const answers = summary.correctAnswers + summary.incorrectAnswers;
  if (answers === 0) return "Ainda não há respostas registradas neste período. Uma conversa sobre a rotina de estudos pode ajudar a começar.";
  return `Neste período houve atividades em ${summary.activityDays} dia(s), com ${summary.correctAnswers} de ${answers} respostas corretas. Perguntar o que foi aprendido e quais dúvidas surgiram ajuda a manter o ritmo.`;
}

export class FamilyService {
  constructor(private readonly dependencies: FamilyDependencies) {}

  private assertGuardian(actor: SessionContext) {
    if (!actor.roles.includes("responsavel")) {
      throw new FamilyError("FORBIDDEN", "Esta área é exclusiva de responsáveis.", 403);
    }
  }

  /**
   * Unlinked IDs get the same 404 as nonexistent ones. Health editing is exclusive to the
   * confirmed guardian, so it also excludes actors allowed in only by another role.
   */
  private guardianScope(actor: SessionContext, studentId: string) {
    this.assertGuardian(actor);
    const scope = { studentId, institutionId: actor.institutionId, classIds: [] };
    if (!canViewStudentData(actor, scope, "health") || !canEditStudentData(actor, scope, "health")) {
      throw new FamilyError("NOT_FOUND", "Aluno não encontrado entre seus vínculos.", 404);
    }
    return scope;
  }

  private async metrics(actor: SessionContext, studentId: string) {
    const end = (this.dependencies.now ?? (() => new Date()))();
    const start = new Date(end.getTime() - (PERIOD_DAYS - 1) * 86_400_000);
    return this.dependencies.metrics.studentSummary(actor, studentId, start.toISOString().slice(0, 10), end.toISOString().slice(0, 10));
  }

  async listChildren(actor: SessionContext) {
    this.assertGuardian(actor);
    return this.dependencies.repository.getChildren(actor.institutionId, actor.guardianStudentIds);
  }

  async overview(actor: SessionContext, studentId: string): Promise<StudentOverview> {
    const { institutionId } = this.guardianScope(actor, studentId);
    const { repository } = this.dependencies;
    const [children, health, support, history, metrics] = await Promise.all([
      repository.getChildren(institutionId, [studentId]),
      repository.getRecord(institutionId, studentId, "health"),
      repository.getRecord(institutionId, studentId, "support"),
      repository.getHistory(institutionId, studentId),
      this.metrics(actor, studentId),
    ]);
    const student = children[0];
    if (!student) throw new FamilyError("NOT_FOUND", "Aluno não encontrado entre seus vínculos.", 404);
    return { student, health, support, history, metrics };
  }

  async saveRecord(actor: SessionContext, studentId: string, category: unknown, input: unknown) {
    const { institutionId } = this.guardianScope(actor, studentId);
    const { details } = FamilyRecordInputSchema.parse(input);
    return this.dependencies.repository.saveRecord(institutionId, studentId, FamilyRecordCategorySchema.parse(category), details);
  }

  /** Example metrics never reach a provider: text about a real child must come from real data. */
  async feedback(actor: SessionContext, studentId: string): Promise<FeedbackResult> {
    this.guardianScope(actor, studentId);
    const { source, summary } = await this.metrics(actor, studentId);
    if (!summary) return { text: "Os resultados deste período ainda não estão disponíveis.", origin: "automatica", metricsSource: source };
    if (source === "real") {
      try {
        const { text } = await this.dependencies.summarize({ summary });
        return { text, origin: "ia", metricsSource: source };
      } catch {
        // Disabled or failing gateway falls through to the identified automatic message.
      }
    }
    return { text: deterministicFeedback(summary), origin: "automatica", metricsSource: source };
  }
}
