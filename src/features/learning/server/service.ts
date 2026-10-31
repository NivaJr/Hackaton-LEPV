import { randomUUID } from "node:crypto";
import {
  AttemptResultSchema, AttemptSubmissionSchema, GeneratedQuestionSchema, IdSchema,
  QuestionForStudentSchema, StudentPreferencesUpdateSchema, StudentSummarySchema,
  type SessionContext, type StudentPreferences, type SubjectId,
} from "@/contracts";
import type { LearningScoringPolicy } from "@/config/scoring";
import {
  CONFIRMED_LEARNING_SCORING_POLICY, RECOVERY_RANK_POINTS, REGULAR_EXERCISE_RANK_POINTS,
  WEEKLY_CHALLENGE_RANK_POINTS, WEEKLY_CHALLENGE_XP,
} from "@/config/scoring";
import { advanceRecovery, canViewStudentData, createRecoveryState, getRankForPoints, interruptRecovery } from "@/features/learning/domain";
import type { LearningAiGateway } from "@/lib/llm/gateway";
import {
  ActivitySchema, LearningError, ScoringPolicySchema, brazilDay, notFound, type ActivityCatalogView,
  type LearningActivity, type LearningCatalog, type LearningInstance, type LearningState,
  type LoadedStudent,
} from "./model";
import type { LearningRepository } from "./repository";

const sum = (values: number[]) => Math.round(values.reduce((total, value) => total + value, 0) * 100) / 100;
const normalizeStatement = (text: string) => text.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("pt-BR");

export type TeacherAssignmentLookup = (institutionId: string, classId: string, subjectId: SubjectId) => Promise<boolean>;

export class LearningService {
  constructor(
    private readonly repository: LearningRepository,
    private readonly ai: Pick<LearningAiGateway, "generateRecoveryQuestion">,
    private readonly scoring: LearningScoringPolicy | null,
    private readonly now: () => Date = () => new Date(),
    private readonly hasAssignedTeacher: TeacherAssignmentLookup = async () => false,
  ) {}

  private student(actor: SessionContext): string {
    if (!actor.roles.includes("aluno") || actor.studentId !== actor.userId) {
      throw new LearningError("STUDENT_REQUIRED", "Esta operação exige a conta do próprio aluno.", 403);
    }
    return actor.userId;
  }

  private async own(actor: SessionContext) {
    return this.repository.loadStudent(actor.institutionId, this.student(actor));
  }

  /** The callback is synchronous: no external side effects can be repeated on a CAS retry. */
  private async transact<T>(actor: SessionContext, change: (loaded: LoadedStudent, state: LearningState) => T): Promise<T> {
    for (let retry = 0; retry < 8; retry++) {
      const loaded = await this.own(actor);
      const state = structuredClone(loaded.state);
      const result = change(loaded, state);
      if (JSON.stringify(state) === JSON.stringify(loaded.state)
        || await this.repository.commitStudent(loaded, state)) return result;
    }
    throw new LearningError("CONCURRENT_UPDATE", "O progresso mudou. Repita a operação com a mesma chave.");
  }

  /** The assigned teacher decides; the coordinator acts only for a subject without one. */
  private async requireActivityManager(actor: SessionContext, classId: string, subjectId: SubjectId) {
    const teaches = actor.roles.includes("professor") && actor.teacherAssignments.some((item) => item.institutionId === actor.institutionId
      && item.classId === classId && item.subjectId === subjectId);
    if (teaches) return;
    if (!actor.roles.includes("coordenador") || !actor.coordinatorInstitutionIds.includes(actor.institutionId)) {
      throw new LearningError("ACTIVITY_MANAGER_REQUIRED", "Operação do professor desta turma e matéria.", 403);
    }
    if (await this.hasAssignedTeacher(actor.institutionId, classId, subjectId)) {
      throw new LearningError("TEACHER_ASSIGNED", "Esta matéria tem professor atribuído; a ativação fica com ele.", 403);
    }
  }

  private currentWeekStart() {
    const monday = new Date(`${brazilDay(this.now())}T12:00:00Z`);
    monday.setUTCDate(monday.getUTCDate() - (monday.getUTCDay() + 6) % 7);
    return monday.toISOString().slice(0, 10);
  }

  private oldestActive(catalog: LearningCatalog, subjectId: SubjectId) {
    return catalog.activities.filter((item) => item.active && item.activityType === "weekly_challenge" && item.body.subjectId === subjectId)
      .sort((a, b) => (a.activatedAt ?? "").localeCompare(b.activatedAt ?? "") || a.rootQuestionId.localeCompare(b.rootQuestionId));
  }

  private async catalogTransaction<T>(actor: SessionContext, classId: string, change: (catalog: LearningCatalog) => T): Promise<T> {
    for (let retry = 0; retry < 8; retry++) {
      const loaded = await this.repository.loadCatalog(actor.institutionId, classId);
      const after = structuredClone(loaded.catalog);
      const result = change(after);
      if (JSON.stringify(after) === JSON.stringify(loaded.catalog)
        || await this.repository.commitCatalog(loaded, after)) return result;
    }
    throw new LearningError("CONCURRENT_UPDATE", "A turma mudou. Repita a operação.");
  }

  private instance(loaded: LoadedStudent, id: string): LearningInstance {
    return loaded.state.instances.find((item) => item.question.questionInstanceId === id) ?? notFound();
  }

  private publicInstance(state: LearningState, instance: LearningInstance) {
    const attempt = state.attempts.find((item) => item.result.questionInstanceId === instance.question.questionInstanceId);
    return {
      question: QuestionForStudentSchema.parse(instance.question),
      status: attempt ? "answered" as const : "pending" as const,
      ...(attempt ? { result: AttemptResultSchema.parse(attempt.result) } : {}),
    };
  }

  private activeRoot(loaded: LoadedStudent, rootId: string): LearningActivity {
    return loaded.catalog.activities.find((item) => item.rootQuestionId === rootId && item.active) ?? notFound();
  }

  async getPreferences(actor: SessionContext) {
    const loaded = await this.own(actor);
    return {
      preferences: loaded.preferences ?? { studentId: loaded.studentId, interests: [], context: "", version: 1 },
      saved: loaded.preferences !== null,
    };
  }

  async savePreferences(actor: SessionContext, input: unknown): Promise<StudentPreferences> {
    const studentId = this.student(actor);
    await this.own(actor);
    return this.repository.savePreferences(actor.institutionId, studentId, StudentPreferencesUpdateSchema.parse(input));
  }

  async listActivities(actor: SessionContext) {
    const loaded = await this.own(actor);
    const activities = loaded.catalog.activities.filter((activity) => activity.active).map((activity) => {
      const instance = loaded.state.instances.find((item) => item.classId === loaded.catalog.classId
        && item.question.rootQuestionId === activity.rootQuestionId && item.recoveryId === null);
      const answered = instance && loaded.state.attempts.some((item) => item.result.questionInstanceId === instance.question.questionInstanceId);
      const recovery = loaded.state.recoveries.find((item) => item.classId === loaded.catalog.classId && item.rootQuestionId === activity.rootQuestionId);
      return {
        rootQuestionId: activity.rootQuestionId, subjectId: activity.body.subjectId,
        activityType: activity.activityType,
        grade: activity.body.grade, skillCodes: activity.body.skillCodes,
        questionInstanceId: instance?.question.questionInstanceId ?? null,
        status: answered ? "answered" : instance ? "pending" : "not_started",
        recoveryId: recovery?.id ?? null, recoveryStatus: recovery?.state.status ?? null,
        recoveryConsecutiveCorrect: recovery?.state.consecutiveCorrect ?? 0,
      };
    });
    const className = await this.repository.classroomName(actor.institutionId, loaded.catalog.classId);
    return { classId: loaded.catalog.classId, className, grade: loaded.catalog.grade, schoolYear: loaded.catalog.schoolYear, activities };
  }

  async openActivity(actor: SessionContext, rootQuestionId: string) {
    IdSchema.parse(rootQuestionId);
    return this.transact(actor, (loaded, state) => {
      const root = this.activeRoot(loaded, rootQuestionId);
      const previous = state.instances.find((item) => item.classId === loaded.catalog.classId
        && item.question.rootQuestionId === rootQuestionId && item.recoveryId === null);
      if (previous) return this.publicInstance(state, previous);
      if (!loaded.preferences) throw new LearningError("PREFERENCES_REQUIRED", "Salve a ficha antes de iniciar a atividade.");
      const policy = ScoringPolicySchema.parse(this.scoring ?? CONFIRMED_LEARNING_SCORING_POLICY);
      const nominalPoints = root.activityType === "weekly_challenge"
        ? WEEKLY_CHALLENGE_RANK_POINTS : REGULAR_EXERCISE_RANK_POINTS;
      const instance = this.makeInstance(loaded, root, loaded.preferences, nominalPoints, policy, null);
      state.instances.push(instance);
      return this.publicInstance(state, instance);
    });
  }

  private makeInstance(
    loaded: LoadedStudent, root: LearningActivity, preferences: StudentPreferences,
    nominalPoints: number, scoring: LearningScoringPolicy, recoveryId: string | null,
  ): LearningInstance {
    const questionId = recoveryId ? randomUUID() : root.rootQuestionId;
    const body = root.body;
    return {
      classId: loaded.catalog.classId, contentVersion: recoveryId ? 1 : root.contentVersion,
      rootContentVersion: root.contentVersion, recoveryId, scoring, nominalPoints, issuedAt: this.now().toISOString(),
      question: QuestionForStudentSchema.parse({
        questionInstanceId: randomUUID(), questionId, rootQuestionId: root.rootQuestionId,
        subjectId: body.subjectId, grade: body.grade, skillCodes: body.skillCodes,
        statement: body.statement, options: body.options, preferencesVersion: preferences.version,
        sourceType: recoveryId ? "recuperacao" : "original",
      }),
      answerKey: { questionId, correctOptionId: body.correctOptionId, explanation: body.explanation, hint: body.hint },
    };
  }

  async getInstance(actor: SessionContext, id: string) {
    const loaded = await this.own(actor);
    return this.publicInstance(loaded.state, this.instance(loaded, id));
  }

  async submitAttempt(actor: SessionContext, input: unknown) {
    const submission = AttemptSubmissionSchema.parse(input);
    return this.transact(actor, (loaded, state) => {
      const reusedKey = state.attempts.find((item) => item.idempotencyKey === submission.idempotencyKey);
      if (reusedKey && (reusedKey.result.questionInstanceId !== submission.questionInstanceId || reusedKey.selectedOptionId !== submission.selectedOptionId)) {
        throw new LearningError("IDEMPOTENCY_CONFLICT", "Esta chave já foi usada em outra resposta.");
      }
      const previous = state.attempts.find((item) => item.result.questionInstanceId === submission.questionInstanceId);
      if (previous) {
        if (previous.selectedOptionId !== submission.selectedOptionId) throw new LearningError("ALREADY_ANSWERED", "A questão já foi respondida e não pode ser refeita.");
        const recovery = state.recoveries.find((item) => item.classId === previous.classId && item.rootQuestionId === previous.rootQuestionId);
        return { result: previous.result, recoveryId: recovery?.id ?? null };
      }
      const instance = this.instance(loaded, submission.questionInstanceId);
      if (instance.classId !== loaded.catalog.classId) notFound();
      const root = this.activeRoot(loaded, instance.question.rootQuestionId);
      if (!instance.question.options.some((option) => option.id === submission.selectedOptionId)) {
        throw new LearningError("INVALID_OPTION", "A alternativa não pertence a esta questão.", 422);
      }
      let recovery = instance.recoveryId ? state.recoveries.find((item) => item.id === instance.recoveryId) : undefined;
      if (instance.recoveryId && (!recovery || recovery.state.status !== "in_progress")) {
        throw new LearningError("RECOVERY_CLOSED", "Esta recuperação já foi encerrada.");
      }
      const isCorrect = submission.selectedOptionId === instance.answerKey.correctOptionId;
      if (recovery) recovery.state = advanceRecovery(recovery.state, isCorrect);
      else if (!isCorrect) {
        recovery = {
          id: randomUUID(), classId: instance.classId, rootQuestionId: instance.question.rootQuestionId,
          state: createRecoveryState(), leaseToken: null, leaseUntil: null,
        };
        state.recoveries.push(recovery);
      }
      const rankPointsAwarded = isCorrect ? instance.nominalPoints : 0;
      const xpAwarded = isCorrect && instance.recoveryId === null && root.activityType === "weekly_challenge"
        ? WEEKLY_CHALLENGE_XP : 0;
      const result = AttemptResultSchema.parse({
        attemptId: randomUUID(), questionInstanceId: submission.questionInstanceId, isCorrect,
        explanation: instance.answerKey.explanation, xpAwarded, rankPointsAwarded,
        consecutiveCorrect: recovery?.state.consecutiveCorrect ?? 0, recoveryStatus: recovery?.state.status ?? null,
      });
      state.attempts.push({
        selectedOptionId: submission.selectedOptionId, idempotencyKey: submission.idempotencyKey,
        classId: instance.classId, rootQuestionId: instance.question.rootQuestionId,
        subjectId: instance.question.subjectId, skillCodes: instance.question.skillCodes,
        source: instance.recoveryId ? "recovery" : "original", createdAt: this.now().toISOString(), result,
      });
      for (const kind of ["xp", "annual"] as const) {
        state.ledger.push({
          id: randomUUID(), attemptId: result.attemptId, classId: instance.classId,
          rootQuestionId: instance.question.rootQuestionId, subjectId: instance.question.subjectId,
          schoolYear: loaded.catalog.schoolYear, kind, points: kind === "xp" ? xpAwarded : rankPointsAwarded,
          keepAfterRotation: kind === "annual",
        });
      }
      return { result, recoveryId: recovery?.id ?? null };
    });
  }

  async nextRecovery(actor: SessionContext, recoveryId: string) {
    const claim = await this.transact(actor, (loaded, state) => {
      const recovery = state.recoveries.find((item) => item.id === recoveryId && item.classId === loaded.catalog.classId) ?? notFound();
      if (recovery.state.status !== "in_progress") throw new LearningError("RECOVERY_CLOSED", "Esta recuperação já foi encerrada.");
      const root = this.activeRoot(loaded, recovery.rootQuestionId);
      const pending = state.instances.find((instance) => instance.recoveryId === recoveryId
        && !state.attempts.some((attempt) => attempt.result.questionInstanceId === instance.question.questionInstanceId));
      if (pending) return { pending: this.publicInstance(state, pending) };
      if (recovery.leaseToken && Date.parse(recovery.leaseUntil!) > this.now().getTime()) {
        throw new LearningError("GENERATION_IN_PROGRESS", "A próxima questão está sendo preparada. Tente novamente em instantes.");
      }
      if (!loaded.preferences) throw new LearningError("PREFERENCES_REQUIRED", "Salve a ficha antes de continuar.");
      const original = state.instances.find((item) => item.classId === loaded.catalog.classId
        && item.question.rootQuestionId === root.rootQuestionId && item.recoveryId === null) ?? notFound();
      const lastAttempt = [...state.attempts].reverse().find((item) => item.classId === original.classId && item.rootQuestionId === root.rootQuestionId) ?? notFound();
      const previous = state.instances.find((item) => item.question.questionInstanceId === lastAttempt.result.questionInstanceId) ?? notFound();
      const token = randomUUID();
      recovery.leaseToken = token;
      recovery.leaseUntil = new Date(this.now().getTime() + 300_000).toISOString();
      return { token, original, previous, root, preferences: loaded.preferences, selectedOptionId: lastAttempt.selectedOptionId };
    });
    if ("pending" in claim) return claim.pending;
    try {
      const body = GeneratedQuestionSchema.parse(await this.ai.generateRecoveryQuestion({
        original: claim.previous.question,
        preferences: {
          interests: claim.preferences.interests,
          context: claim.preferences.context,
          version: claim.preferences.version,
        },
        selectedOptionId: claim.selectedOptionId,
      }));
      const sameSkills = [...body.skillCodes].sort().join("|") === [...claim.root.body.skillCodes].sort().join("|");
      if (body.subjectId !== claim.root.body.subjectId || body.grade !== claim.root.body.grade || !sameSkills) {
        throw new LearningError("INVALID_GENERATED_QUESTION", "A IA não preservou a matéria, o ano e as habilidades.", 503);
      }
      return await this.transact(actor, (loaded, state) => {
        const recovery = state.recoveries.find((item) => item.id === recoveryId) ?? notFound();
        this.activeRoot(loaded, recovery.rootQuestionId);
        if (recovery.state.status !== "in_progress" || recovery.leaseToken !== claim.token) {
          throw new LearningError("GENERATION_SUPERSEDED", "A recuperação mudou enquanto a questão era preparada.");
        }
        if (state.instances.some((item) => normalizeStatement(item.question.statement) === normalizeStatement(body.statement))) {
          throw new LearningError("REPEATED_GENERATED_QUESTION", "A IA repetiu uma questão já atribuída. Solicite outra variante.", 503);
        }
        const instance = this.makeInstance(loaded, { ...claim.root, body }, claim.preferences, RECOVERY_RANK_POINTS, claim.original.scoring, recoveryId);
        state.instances.push(instance);
        recovery.leaseToken = null;
        recovery.leaseUntil = null;
        return this.publicInstance(state, instance);
      });
    } catch (error) {
      await this.transact(actor, (_loaded, state) => {
        const recovery = state.recoveries.find((item) => item.id === recoveryId);
        if (recovery?.leaseToken === claim.token) { recovery.leaseToken = null; recovery.leaseUntil = null; }
      }).catch(() => undefined); // A failed cleanup leaves only a bounded lease; the original error stays visible.
      if (error instanceof LearningError) throw error;
      throw new LearningError("AI_UNAVAILABLE", "A tentativa está salva. A geração da próxima questão não está disponível; tente novamente depois.", 503);
    }
  }

  async interrupt(actor: SessionContext, recoveryId: string) {
    return this.transact(actor, (_loaded, state) => {
      const recovery = state.recoveries.find((item) => item.id === recoveryId) ?? notFound();
      recovery.state = interruptRecovery(recovery.state);
      recovery.leaseToken = null;
      recovery.leaseUntil = null;
      return { recoveryId, state: recovery.state };
    });
  }

  async hint(actor: SessionContext, instanceId: string) {
    const loaded = await this.own(actor);
    const instance = this.instance(loaded, instanceId);
    if (instance.classId !== loaded.catalog.classId) notFound();
    this.activeRoot(loaded, instance.question.rootQuestionId);
    const recovery = loaded.state.recoveries.find((item) => item.id === instance.recoveryId);
    if (!recovery || recovery.state.status !== "in_progress"
      || loaded.state.attempts.some((item) => item.result.questionInstanceId === instanceId)) {
      throw new LearningError("HINT_UNAVAILABLE", "A dica está disponível apenas na questão de recuperação ainda não respondida.");
    }
    return { questionInstanceId: instanceId, text: instance.answerKey.hint };
  }

  async recordAccess(actor: SessionContext) {
    const day = brazilDay(this.now());
    return this.transact(actor, (_loaded, state) => {
      if (!state.accessDays.includes(day)) state.accessDays.push(day);
      return { day };
    });
  }

  async summary(actor: SessionContext, studentId: string, from: string, to: string) {
    const loaded = await this.repository.loadStudent(actor.institutionId, studentId);
    const scope = { studentId, institutionId: loaded.institutionId, classIds: [loaded.catalog.classId] };
    if (!canViewStudentData(actor, scope, "academic_history")) notFound();
    const wholeStudent = actor.studentId === studentId || actor.guardianStudentIds.includes(studentId)
      || actor.coordinatorInstitutionIds.includes(loaded.institutionId);
    const allowedSubjects = new Set(actor.teacherAssignments.filter((item) => item.classId === loaded.catalog.classId
      && item.institutionId === loaded.institutionId).map((item) => item.subjectId));
    const mayRead = (item: { classId: string; subjectId: SubjectId }) => wholeStudent
      || (item.classId === loaded.catalog.classId && allowedSubjects.has(item.subjectId));
    const attempts = loaded.state.attempts.filter((item) => mayRead(item)
      && brazilDay(new Date(item.createdAt)) >= from && brazilDay(new Date(item.createdAt)) <= to);
    const ledger = loaded.state.ledger.filter(mayRead);
    const active = new Set(loaded.catalog.activities.filter((item) => item.active).map((item) => item.rootQuestionId));
    const xp = sum(ledger.filter((entry) => entry.kind === "xp" && entry.classId === loaded.catalog.classId
      && (entry.keepAfterRotation || active.has(entry.rootQuestionId))).map((entry) => entry.points));
    const recognitionPoints = await this.repository.recognitionPoints(loaded.institutionId, studentId, loaded.catalog.schoolYear,
      wholeStudent ? undefined : [...allowedSubjects]);
    const rankPoints = sum([...ledger.filter((entry) => entry.kind === "annual" && entry.schoolYear === loaded.catalog.schoolYear).map((entry) => entry.points), recognitionPoints]);
    const summary = StudentSummarySchema.parse({
      studentId, periodStart: from, periodEnd: to,
      accessDays: wholeStudent ? loaded.state.accessDays.filter((day) => day >= from && day <= to).length : 0,
      activityDays: new Set(attempts.map((attempt) => brazilDay(new Date(attempt.createdAt)))).size,
      correctAnswers: attempts.filter((attempt) => attempt.result.isCorrect).length,
      incorrectAnswers: attempts.filter((attempt) => !attempt.result.isCorrect).length,
      xp, rankPoints, rankName: getRankForPoints(rankPoints).name,
      difficultSkillCodes: [...new Set(attempts.filter((attempt) => !attempt.result.isCorrect).flatMap((attempt) => attempt.skillCodes))],
    });
    return {
      summary, rankCalibration: "confirmed" as const, accessDaysScope: wholeStudent ? "student" : "not_available_for_subject",
      activityDates: [...new Set(attempts.map((attempt) => brazilDay(new Date(attempt.createdAt))))].sort(),
      originalAttempts: attempts.filter((item) => item.source === "original").length,
      recoveryAttempts: attempts.filter((item) => item.source === "recovery").length,
    };
  }

  async classMetrics(actor: SessionContext, classIds: string[], from: string, to: string) {
    const ids = [...new Set(classIds)];
    if (actor.roles.includes("coordenador") && actor.coordinatorInstitutionIds.includes(actor.institutionId)) {
      const rows = await this.repository.classMetrics(actor.institutionId, ids, from, to);
      if (rows.length !== ids.length) notFound();
      return rows;
    }
    if (!actor.roles.includes("professor")) throw new LearningError("FORBIDDEN", "Métricas de turma são exclusivas da equipe vinculada.", 403);
    const rows = await Promise.all(ids.map(async (classId) => {
      const subjects = actor.teacherAssignments.filter((item) => item.classId === classId && item.institutionId === actor.institutionId)
        .map((item) => item.subjectId);
      if (!subjects.length) notFound();
      const result = await this.repository.classMetrics(actor.institutionId, [classId], from, to, subjects);
      if (result.length !== 1) notFound();
      return result[0];
    }));
    return rows;
  }

  private async authorizeClass(actor: SessionContext, classId: string) {
    if (actor.coordinatorInstitutionIds.includes(actor.institutionId) && actor.roles.includes("coordenador")) return;
    if (actor.roles.includes("professor") && actor.teacherAssignments.some((item) => item.classId === classId && item.institutionId === actor.institutionId)) return;
    const studentIds = [actor.studentId, ...actor.guardianStudentIds].filter((id): id is string => !!id);
    for (const id of studentIds) {
      try {
        const linked = await this.repository.loadStudent(actor.institutionId, id);
        if (linked.catalog.classId === classId) return;
      } catch (error) { if (!(error instanceof LearningError && error.status === 404)) throw error; }
    }
    notFound();
  }

  async ranking(actor: SessionContext, classId: string) {
    await this.authorizeClass(actor, classId);
    await this.repository.loadCatalog(actor.institutionId, classId);
    const rows = await this.repository.ranking(actor.institutionId, classId);
    return {
      classId, rankCalibration: "confirmed" as const,
      top10: rows.sort((a, b) => b.xp - a.xp || b.rankPoints - a.rankPoints || a.studentId.localeCompare(b.studentId)).slice(0, 10)
        .map((row, index) => ({ position: index + 1, ...row, rankName: getRankForPoints(row.rankPoints).name })),
    };
  }

  /** Internal content handoff; review/BNCC verification remain with the content owner. */
  async registerActivity(actor: SessionContext, classId: string, value: Pick<LearningActivity, "rootQuestionId" | "body" | "contentVersion" | "reviewed"> & { activityType?: LearningActivity["activityType"] }) {
    const activity = ActivitySchema.parse({ ...value, active: false, activatedAt: null });
    const coordinator = actor.roles.includes("coordenador") && actor.coordinatorInstitutionIds.includes(actor.institutionId);
    const teacher = actor.roles.includes("professor") && actor.teacherAssignments.some((item) => item.institutionId === actor.institutionId
      && item.classId === classId && item.subjectId === activity.body.subjectId);
    if (!coordinator && !teacher) throw new LearningError("CONTENT_FORBIDDEN", "A publicação exige atribuição nesta turma e matéria.", 403);
    return this.catalogTransaction(actor, classId, (catalog) => {
      if (activity.body.grade !== catalog.grade) throw new LearningError("GRADE_MISMATCH", "O ano da questão difere do ano da turma.", 422);
      const existing = catalog.activities.find((item) => item.rootQuestionId === activity.rootQuestionId);
      if (existing) {
        if (JSON.stringify(existing.body) !== JSON.stringify(activity.body) || existing.contentVersion !== activity.contentVersion) {
          throw new LearningError("CONTENT_VERSION_CONFLICT", "O snapshot publicado é imutável; publique uma nova raiz para outra versão.");
        }
      } else catalog.activities.push(activity);
      return { rootQuestionId: activity.rootQuestionId };
    });
  }

  async activityCatalog(actor: SessionContext, classId: string, subjectId: SubjectId): Promise<ActivityCatalogView> {
    await this.requireActivityManager(actor, classId, subjectId);
    const { catalog } = await this.repository.loadCatalog(actor.institutionId, classId);
    const weekStart = this.currentWeekStart();
    return {
      classId, subjectId, weekStart,
      rotatedThisWeek: catalog.rotations.some((item) => item.subjectId === subjectId && item.weekStart === weekStart),
      outgoingNext: this.oldestActive(catalog, subjectId).slice(0, 2).map((item) => item.rootQuestionId),
      activities: catalog.activities.filter((item) => item.activityType === "weekly_challenge" && item.body.subjectId === subjectId).map((item) => ({
        rootQuestionId: item.rootQuestionId, statement: item.body.statement, skillCodes: item.body.skillCodes,
        active: item.active, retired: !item.active && item.activatedAt !== null,
      })),
    };
  }

  async activate(actor: SessionContext, classId: string, subjectId: SubjectId, rootIds: string[]) {
    await this.requireActivityManager(actor, classId, subjectId);
    if (rootIds.length !== 10 || new Set(rootIds).size !== 10) throw new LearningError("TEN_CHALLENGES_REQUIRED", "Selecione dez desafios semanais distintos.", 422);
    return this.catalogTransaction(actor, classId, (catalog) => {
      const current = this.oldestActive(catalog, subjectId);
      if (current.length) {
        if (current.length === 10 && current.every((item) => rootIds.includes(item.rootQuestionId))) return { rootQuestionIds: rootIds };
        throw new LearningError("ALREADY_ACTIVATED", "A seleção inicial já existe. Use a rotação semanal.");
      }
      const selected = rootIds.map((id) => catalog.activities.find((item) => item.rootQuestionId === id
        && item.activityType === "weekly_challenge" && item.body.subjectId === subjectId) ?? notFound());
      for (const item of selected) { item.active = true; item.activatedAt = this.now().toISOString(); }
      return { rootQuestionIds: rootIds };
    });
  }

  async rotate(actor: SessionContext, classId: string, subjectId: SubjectId, weekStart: string, incomingRootIds: string[]) {
    await this.requireActivityManager(actor, classId, subjectId);
    if (incomingRootIds.length !== 2 || new Set(incomingRootIds).size !== 2) throw new LearningError("TWO_CHALLENGES_REQUIRED", "Selecione dois desafios semanais distintos.", 422);
    return this.catalogTransaction(actor, classId, (catalog) => {
      const previous = catalog.rotations.find((item) => item.subjectId === subjectId && item.weekStart === weekStart);
      if (previous) {
        if ([...previous.incomingRootIds].sort().join("|") !== [...incomingRootIds].sort().join("|")) throw new LearningError("ROTATION_CONFLICT", "Esta semana já foi processada com outra seleção.");
        return previous;
      }
      if (weekStart !== this.currentWeekStart()) throw new LearningError("INVALID_WEEK", "Use a segunda-feira da semana atual em Brasília.", 422);
      const active = this.oldestActive(catalog, subjectId);
      if (active.length !== 10) throw new LearningError("TEN_CHALLENGES_REQUIRED", "A rotação exige dez desafios semanais ativos nesta matéria.");
      const incoming = incomingRootIds.map((id) => catalog.activities.find((item) => item.rootQuestionId === id
        && item.activityType === "weekly_challenge" && item.body.subjectId === subjectId && !item.active && item.activatedAt === null) ?? notFound());
      const outgoing = active.slice(0, 2);
      for (const item of outgoing) item.active = false;
      for (const item of incoming) { item.active = true; item.activatedAt = this.now().toISOString(); }
      const result = { subjectId, weekStart, incomingRootIds, outgoingRootIds: outgoing.map((item) => item.rootQuestionId) };
      catalog.rotations.push(result);
      return result;
    });
  }
}
