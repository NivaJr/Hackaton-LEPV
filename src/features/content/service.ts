import { SUBJECT_IDS } from "@/config/catalog";
import type { SessionContext, SubjectId } from "@/contracts";
import { safeParseDraftQuestion, type DraftQuestion } from "@/lib/llm/draft-question";
import type { DocumentExtractionInput, TextExtractionInput } from "@/lib/llm/types";
import { examplesFor, findExample } from "./fixtures/examples";
import {
  canManageContent, ContentError, ContentMetadataSchema, contentNotFound, DraftUpdateSchema, ExampleImportSchema, isCoordinatorOf,
  MAX_QUESTIONS_PER_IMPORT, parseQuestionBody, ScopeQuerySchema, TextImportSchema,
  type ContentClass, type ContentMetadata, type ContentOrigin, type ContentQuestion, type ContentScope,
} from "./model";
import type { DocxTextReader } from "./docx";
import { InMemoryImportQuota } from "./memory";
import type { ActivityPublisher, ClassDirectory, ContentExtractionGateway, ContentFileStore, ContentRepository, ImportQuota } from "./ports";
import { bytesToBase64, inspectUpload, PDF_MIME_TYPE } from "./upload";

/**
 * rejected counts what the AI read but could not turn into a question, plus what failed the server check.
 * missingSkills counts drafts without a BNCC code; the teacher sets one before saving.
 */
export type ImportResult = { drafts: ContentQuestion[]; rejected: number; rejectedReasons: string[]; missingSkills: number };

const MAX_REASONS = 5;

const subjectOrder = (subjectId: SubjectId) => SUBJECT_IDS.indexOf(subjectId);

async function topicId(institutionId: string, classId: string, subjectId: SubjectId, title: string) {
  const normalized = title.normalize("NFKC").toLocaleLowerCase("pt-BR");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${institutionId}|${classId}|${subjectId}|${normalized}`));
  return `content-${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

export class ContentService {
  constructor(
    private readonly repository: ContentRepository,
    private readonly classes: ClassDirectory,
    private readonly ai: ContentExtractionGateway,
    private readonly publisher: ActivityPublisher,
    private readonly now: () => Date = () => new Date(),
    private readonly newId: () => string = () => crypto.randomUUID(),
    private readonly quota: ImportQuota = new InMemoryImportQuota(),
    // Injected so the browser demo never bundles mammoth; without it Word is refused.
    private readonly readDocx?: DocxTextReader,
    private readonly files?: ContentFileStore,
  ) {}

  /** Called by the HTTP handler before reading any request body. */
  requireStaff(actor: SessionContext) {
    this.staff(actor);
  }

  private staff(actor: SessionContext) {
    if (!actor.roles.includes("professor") && !isCoordinatorOf(actor)) {
      throw new ContentError("CONTENT_FORBIDDEN", "O banco de questões é usado por professores e pela coordenação.", 403);
    }
  }

  private async scopeClass(actor: SessionContext, classId: string, subjectId: SubjectId): Promise<ContentClass> {
    this.staff(actor);
    if (!canManageContent(actor, classId, subjectId)) {
      throw new ContentError("CONTENT_FORBIDDEN", "Você não tem atribuição nesta turma e matéria.", 403);
    }
    const teaches = actor.roles.includes("professor") && actor.teacherAssignments.some((item) => item.institutionId === actor.institutionId
      && item.classId === classId && item.subjectId === subjectId);
    if (!teaches && await this.classes.hasAssignedTeacher?.(actor.institutionId, classId, subjectId)) {
      throw new ContentError("TEACHER_ASSIGNED", "O conteúdo desta turma e disciplina é definido pelo professor atribuído.", 403);
    }
    const [found] = await this.classes.listClasses(actor.institutionId, [classId]);
    if (!found) throw new ContentError("CLASS_NOT_FOUND", "Turma não encontrada nesta escola.", 404);
    return found;
  }

  /** Hides records from other classes/subjects behind the same 404 as a missing ID. */
  private async owned(actor: SessionContext, id: string) {
    this.staff(actor);
    const item = await this.repository.get(actor.institutionId, id);
    if (!item || !canManageContent(actor, item.classId, item.body.subjectId)) contentNotFound();
    await this.scopeClass(actor, item.classId, item.body.subjectId);
    return item;
  }

  async listScopes(actor: SessionContext): Promise<ContentScope[]> {
    this.staff(actor);
    const coordinator = isCoordinatorOf(actor);
    const assignments = actor.teacherAssignments.filter((item) => item.institutionId === actor.institutionId);
    const classes = await this.classes.listClasses(actor.institutionId, coordinator ? undefined : [...new Set(assignments.map((item) => item.classId))]);
    const scopes = classes.flatMap((item) => {
      const subjects = coordinator ? [...SUBJECT_IDS] : assignments.filter((assignment) => assignment.classId === item.id).map((assignment) => assignment.subjectId);
      return [...new Set(subjects)].map((subjectId) => ({ classId: item.id, className: item.name, grade: item.grade, subjectId }));
    });
    const allowed = await Promise.all(scopes.map(async (scope) => {
      const teaches = assignments.some((assignment) => assignment.classId === scope.classId && assignment.subjectId === scope.subjectId);
      return teaches || !await this.classes.hasAssignedTeacher?.(actor.institutionId, scope.classId, scope.subjectId) ? scope : null;
    }));
    return allowed.filter((scope): scope is ContentScope => scope !== null)
      .sort((a, b) => a.grade - b.grade || a.className.localeCompare(b.className, "pt-BR") || subjectOrder(a.subjectId) - subjectOrder(b.subjectId));
  }

  async list(actor: SessionContext, input: unknown) {
    const { classId, subjectId } = ScopeQuerySchema.parse(input);
    const found = await this.scopeClass(actor, classId, subjectId);
    const items = await this.repository.list({ institutionId: actor.institutionId, classId, subjectId });
    return {
      scope: { classId, className: found.name, grade: found.grade, subjectId },
      drafts: items.filter((item) => item.status !== "publicada"),
      published: items.filter((item) => item.status === "publicada"),
      examples: examplesFor(subjectId, found.grade).map((example) => ({
        id: example.id, statement: example.body.statement, skillCodes: example.body.skillCodes, skillCheck: example.skillCheck,
      })),
      storage: this.repository.storage,
      delivery: this.publisher.delivery,
    };
  }

  private async callAi(actor: SessionContext, run: () => Promise<unknown>, unavailableMessage: string): Promise<unknown> {
    const slot = await this.quota.acquire({ institutionId: actor.institutionId, userId: actor.userId }, this.now());
    if (!slot.ok) {
      throw new ContentError("AI_RATE_LIMITED", slot.reason === "busy"
        ? "Espere a leitura anterior terminar antes de enviar outra lista."
        : `Você chegou ao limite de ${slot.limit} leituras pela IA hoje. Amanhã o limite volta; até lá, use um exemplo ou revise os rascunhos.`, 429);
    }
    try {
      return await run();
    } catch (error) {
      if (error instanceof ContentError) throw error;
      if (error instanceof Error && error.name === "AiNotConfiguredError") {
        throw new ContentError("AI_NOT_CONFIGURED", unavailableMessage, 503, undefined, { cause: error });
      }
      throw new ContentError("AI_PROVIDER_ERROR", "O serviço de IA não respondeu como esperado. Tente de novo em alguns minutos ou cole o texto.", 503, undefined, { cause: error });
    } finally {
      await slot.release();
    }
  }

  /** The model only proposes content. Scope, IDs, origin and review state are set here. */
  private async storeExtracted(actor: SessionContext, found: ContentClass, subjectId: SubjectId, output: unknown, origin: ContentOrigin, metadata: ContentMetadata): Promise<ImportResult> {
    const report = output as { questions?: unknown; discarded?: unknown; issues?: unknown } | null;
    if (!report || typeof report !== "object" || !Array.isArray(report.questions)) {
      throw new ContentError("AI_PROVIDER_ERROR", "A IA devolveu um formato inesperado. Tente de novo.", 503);
    }
    const reasons = new Set<string>();
    if (Array.isArray(report.issues)) {
      for (const issue of report.issues) {
        const reason = (issue as { reason?: unknown } | null)?.reason;
        if (typeof reason === "string" && reason.trim()) reasons.add(reason.trim().slice(0, 200));
      }
    }
    const accepted: DraftQuestion[] = [];
    let rejected = typeof report.discarded === "number" && Number.isSafeInteger(report.discarded) && report.discarded > 0 ? report.discarded : 0;
    for (const candidate of report.questions.slice(0, MAX_QUESTIONS_PER_IMPORT)) {
      const parsed = safeParseDraftQuestion(candidate);
      if (parsed.success && parsed.data.subjectId === subjectId && parsed.data.grade === found.grade) accepted.push(parsed.data);
      else {
        rejected++;
        reasons.add(parsed.success ? "Matéria ou série diferente da turma." : "Questão incompleta ou com campos inválidos.");
      }
    }
    if (report.questions.length > MAX_QUESTIONS_PER_IMPORT) {
      rejected += report.questions.length - MAX_QUESTIONS_PER_IMPORT;
      reasons.add(`Limite de ${MAX_QUESTIONS_PER_IMPORT} questões por envio.`);
    }
    const rejectedReasons = [...reasons].slice(0, MAX_REASONS);
    if (!accepted.length) {
      const message = rejected
        ? `A IA achou ${rejected} trecho(s), mas nenhum virou questão completa. Motivos: ${rejectedReasons.join(" ")} Confira o arquivo ou cole o texto das questões.`
        : "Nenhuma questão de múltipla escolha foi encontrada. Se o PDF for escaneado, cole o texto das questões.";
      throw new ContentError("NO_QUESTIONS_FOUND", message, 422);
    }
    const drafts = await Promise.all(accepted.map((body) => this.newDraft(actor, found.id, body, origin, "ia", metadata)));
    await this.repository.insert(drafts);
    return { drafts, rejected, rejectedReasons, missingSkills: accepted.filter((body) => body.skillCodes.length === 0).length };
  }

  private async newDraft(actor: SessionContext, classId: string, body: DraftQuestion, origin: ContentOrigin, answerKeySource: "ia" | "exemplo", metadata: ContentMetadata): Promise<ContentQuestion> {
    const id = this.newId();
    const at = this.now().toISOString();
    const contentId = await topicId(actor.institutionId, classId, body.subjectId, metadata.contentTitle);
    const teaches = actor.roles.includes("professor") && actor.teacherAssignments.some((item) => item.institutionId === actor.institutionId && item.classId === classId && item.subjectId === body.subjectId);
    return {
      ...metadata, contentId, contentDefinedBy: teaches ? "teacher" : "coordinator",
      id, institutionId: actor.institutionId, classId, status: "rascunho", sourceType: "original", rootQuestionId: id,
      origin, body, answerKeySource, reviewed: false, version: 1, createdBy: actor.userId,
      createdAt: at, updatedAt: at, publishedAt: null,
    };
  }

  async importText(actor: SessionContext, input: unknown): Promise<ImportResult> {
    const { classId, subjectId, text, ...metadata } = TextImportSchema.parse(input);
    const found = await this.scopeClass(actor, classId, subjectId);
    const request: TextExtractionInput = { text, subjectId, grade: found.grade };
    const output = await this.callAi(
      actor,
      () => this.ai.extractQuestionsReport(request),
      "A leitura automática de questões está desligada neste ambiente. Use um exemplo ou cadastre depois.",
    );
    return this.storeExtracted(actor, found, subjectId, output, { kind: "texto" }, metadata);
  }

  async importFile(actor: SessionContext, input: { classId: unknown; subjectId: unknown; contentTitle?: unknown; activityType?: unknown; fileName: string; mimeType: string; bytes: Uint8Array }): Promise<ImportResult> {
    const metadata = ContentMetadataSchema.parse({ contentTitle: input.contentTitle, activityType: input.activityType });
    const { classId, subjectId } = ScopeQuerySchema.parse({ classId: input.classId, subjectId: input.subjectId });
    const found = await this.scopeClass(actor, classId, subjectId);
    const file = inspectUpload(input);
    if (file.kind === "docx") {
      if (!this.readDocx) throw new ContentError("WORD_NOT_SUPPORTED", "Esta versão de teste não lê Word. Cole o texto das questões.", 415);
      const request: TextExtractionInput = { text: await this.readDocx(input.bytes), subjectId, grade: found.grade };
      const output = await this.callAi(
        actor,
        () => this.ai.extractQuestionsReport(request),
        "A leitura automática de questões está desligada neste ambiente. Cole o texto das questões.",
      );
      const storagePath = await this.files?.save(actor, { classId, subjectId, kind: "docx", bytes: input.bytes });
      return this.storeExtracted(actor, found, subjectId, output, { kind: "docx", fileName: file.fileName, ...(storagePath ? { storagePath } : {}) }, metadata);
    }
    const document: DocumentExtractionInput = { mimeType: PDF_MIME_TYPE, dataBase64: bytesToBase64(input.bytes), subjectId, grade: found.grade };
    const output = await this.callAi(
      actor,
      () => this.ai.extractQuestionsReport(document),
      "A leitura de PDF pela IA está desligada neste ambiente. Cole o texto das questões.",
    );
    const storagePath = await this.files?.save(actor, { classId, subjectId, kind: "pdf", bytes: input.bytes });
    return this.storeExtracted(actor, found, subjectId, output, { kind: "pdf", fileName: file.fileName, ...(storagePath ? { storagePath } : {}) }, metadata);
  }

  async importExample(actor: SessionContext, input: unknown): Promise<ImportResult> {
    const { classId, subjectId, exampleId, ...metadata } = ExampleImportSchema.parse(input);
    const found = await this.scopeClass(actor, classId, subjectId);
    const example = findExample(exampleId);
    if (!example || example.body.subjectId !== subjectId || example.body.grade !== found.grade) {
      throw new ContentError("EXAMPLE_NOT_FOUND", "Exemplo não encontrado para esta série e matéria.", 404);
    }
    const draft = await this.newDraft(actor, found.id, structuredClone(example.body), { kind: "exemplo", exampleId }, "exemplo", metadata);
    await this.repository.insert([draft]);
    return { drafts: [draft], rejected: 0, rejectedReasons: [], missingSkills: 0 };
  }

  async updateDraft(actor: SessionContext, id: string, input: unknown): Promise<ContentQuestion> {
    const update = DraftUpdateSchema.parse(input);
    const current = await this.owned(actor, id);
    if (current.status !== "rascunho") throw new ContentError("ALREADY_PUBLISHED", "Questão publicada não pode ser editada. Crie um novo rascunho.");
    if (current.version !== update.version) throw new ContentError("VERSION_CONFLICT", "Este rascunho mudou em outra aba. Recarregue antes de salvar.");
    const body = parseQuestionBody(update.body);
    const found = await this.scopeClass(actor, current.classId, body.subjectId);
    if (body.grade !== found.grade) {
      throw new ContentError("GRADE_MISMATCH", `A série da questão precisa ser a da turma (${found.grade}º ano).`, 422, [{ path: "grade", message: "Série diferente da turma." }]);
    }
    const next: ContentQuestion = {
      ...current, body, reviewed: update.reviewed, answerKeySource: "professor",
      contentId: current.contentTitle ? await topicId(actor.institutionId, current.classId, body.subjectId, current.contentTitle) : current.contentId,
      version: current.version + 1, updatedAt: this.now().toISOString(),
    };
    if (!await this.repository.replace(next, current.version)) {
      throw new ContentError("VERSION_CONFLICT", "Este rascunho mudou em outra aba. Recarregue antes de salvar.");
    }
    return next;
  }

  async deleteDraft(actor: SessionContext, id: string): Promise<{ id: string }> {
    const current = await this.owned(actor, id);
    if (current.status !== "rascunho") throw new ContentError("ALREADY_PUBLISHED", "Questões publicadas não são apagadas por aqui.");
    if (!await this.repository.remove(actor.institutionId, id, current.version)) {
      throw new ContentError("VERSION_CONFLICT", "Este rascunho mudou em outra aba. Recarregue a lista.");
    }
    return { id };
  }

  async publish(actor: SessionContext, id: string): Promise<ContentQuestion> {
    let current = await this.owned(actor, id);
    if (current.status === "publicada") return current;
    if (!current.reviewed || current.answerKeySource !== "professor") {
      throw new ContentError("REVIEW_REQUIRED", "Revise a questão, confirme o gabarito e salve antes de publicar.", 422);
    }
    const body = parseQuestionBody(current.body);
    const found = await this.scopeClass(actor, current.classId, body.subjectId);
    if (body.grade !== found.grade) throw new ContentError("GRADE_MISMATCH", "A série da questão difere da série da turma.", 422);
    if (current.activityType === "weekly_challenge" && body.difficulty !== "dificil") {
      throw new ContentError("CHALLENGE_DIFFICULTY_REQUIRED", "Revise a dificuldade do desafio semanal como Difícil antes de publicar.", 422);
    }
    // Freeze the reviewed version before the external catalogue commit. Retrying a
    // failed or interrupted publication always uses this same immutable snapshot.
    if (current.status === "rascunho") {
      const frozen: ContentQuestion = { ...current, status: "publicando", version: current.version + 1, updatedAt: this.now().toISOString() };
      if (!await this.repository.replace(frozen, current.version)) {
        throw new ContentError("VERSION_CONFLICT", "A questão mudou antes da publicação. Recarregue a lista.");
      }
      current = frozen;
    }
    try {
      await this.publisher.registerActivity(actor, current.classId, {
        activityType: current.activityType ?? "exercise", contentId: current.contentId, contentTitle: current.contentTitle, contentDefinedBy: current.contentDefinedBy,
        rootQuestionId: current.rootQuestionId, body, contentVersion: current.version, reviewed: true,
      });
    } catch (error) {
      if (error instanceof ContentError) throw error;
      const coded = error as { code?: unknown; status?: unknown; message?: unknown };
      if (typeof coded.code === "string" && typeof coded.status === "number" && typeof coded.message === "string") {
        throw new ContentError(coded.code, coded.message, coded.status, undefined, { cause: error });
      }
      throw error;
    }
    const at = this.now().toISOString();
    const next: ContentQuestion = { ...current, status: "publicada", publishedAt: at, updatedAt: at };
    if (!await this.repository.replace(next, current.version)) {
      throw new ContentError("VERSION_CONFLICT", "A questão mudou durante a publicação. Recarregue a lista.");
    }
    return next;
  }
}
