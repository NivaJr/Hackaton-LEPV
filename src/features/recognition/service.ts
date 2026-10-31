import { IdSchema, type SessionContext } from "@/contracts";
import { getSubject } from "@/config/catalog";
import {
  RECOGNITION_DAILY_LIMIT,
  RECOGNITION_POINTS,
  RECOGNITION_REASON_LABELS,
  RecognitionError,
  RecognitionRequestSchema,
  initialsOf,
  recognitionDay,
  sortNotifications,
  toNotificationView,
  toRecognitionView,
  type RecognitionOutcome,
  type RecognitionRecord,
} from "./model";
import type { NotificationRepository, RecognitionRepository, RosterReader } from "./ports";

export interface RecognitionServiceDependencies {
  recognitions: RecognitionRepository;
  notifications: NotificationRepository;
  roster: RosterReader;
  now?: () => Date;
  newId?: () => string;
}

const LIST_LIMIT = 100;
const NOTIFICATION_LIMIT = 50;

function forbidden(message = "Seu perfil não tem acesso a esta operação.") {
  return new RecognitionError("FORBIDDEN", message, 403);
}

function requireTeacher(actor: SessionContext) {
  if (!actor.roles.includes("professor")) throw forbidden("Somente professores dão pontos por comportamento.");
}

function firstName(fullName: string) {
  return fullName.trim().split(/\s+/)[0] ?? "";
}

export class RecognitionService {
  private readonly now: () => Date;
  private readonly newId: () => string;

  constructor(private readonly deps: RecognitionServiceDependencies) {
    this.now = deps.now ?? (() => new Date());
    this.newId = deps.newId ?? (() => crypto.randomUUID());
  }

  private assignedClassIds(actor: SessionContext) {
    return new Set(actor.teacherAssignments
      .filter((assignment) => assignment.institutionId === actor.institutionId)
      .map((assignment) => assignment.classId));
  }

  async listAssignments(actor: SessionContext) {
    requireTeacher(actor);
    const assignments = actor.teacherAssignments.filter((assignment) => assignment.institutionId === actor.institutionId);
    const classrooms = await this.deps.roster.getClassrooms(actor.institutionId, [...new Set(assignments.map((item) => item.classId))]);
    const byId = new Map(classrooms.map((classroom) => [classroom.id, classroom]));
    return assignments.flatMap((assignment) => {
      const classroom = byId.get(assignment.classId);
      if (!classroom || classroom.schoolId !== actor.institutionId) return [];
      return [{
        classId: classroom.id, className: classroom.name, grade: classroom.grade,
        subjectId: assignment.subjectId, subjectName: getSubject(assignment.subjectId).name,
      }];
    }).sort((a, b) => a.grade - b.grade || a.className.localeCompare(b.className, "pt-BR") || a.subjectName.localeCompare(b.subjectName, "pt-BR"));
  }

  async listStudents(actor: SessionContext, classId: string) {
    requireTeacher(actor);
    const id = IdSchema.parse(classId);
    if (!this.assignedClassIds(actor).has(id)) throw forbidden("Você não leciona nesta turma.");
    const [classroom] = await this.deps.roster.getClassrooms(actor.institutionId, [id]);
    if (!classroom) throw new RecognitionError("CLASS_NOT_FOUND", "Turma não encontrada.", 404);
    const day = recognitionDay(this.now());
    const students = await this.deps.roster.listActiveStudents(actor.institutionId, id);
    const counts = await this.deps.recognitions.countForDay(actor.institutionId, actor.userId, day, students.map((item) => item.studentId));
    return {
      classId: classroom.id, className: classroom.name, day, dailyLimit: RECOGNITION_DAILY_LIMIT, points: RECOGNITION_POINTS,
      students: students
        .map((student) => {
          const awardedToday = counts.get(student.studentId) ?? 0;
          return {
            studentId: student.studentId, name: student.fullName, initials: initialsOf(student.fullName),
            awardedToday, remainingToday: Math.max(0, RECOGNITION_DAILY_LIMIT - awardedToday),
          };
        })
        .sort((a, b) => a.name.localeCompare(b.name, "pt-BR")),
    };
  }

  async grant(actor: SessionContext, actorName: string, body: unknown) {
    requireTeacher(actor);
    const input = RecognitionRequestSchema.parse(body);
    const assigned = actor.teacherAssignments.some((assignment) => assignment.institutionId === actor.institutionId
      && assignment.classId === input.classId && assignment.subjectId === input.subjectId);
    if (!assigned) throw forbidden("Você não leciona esta matéria nesta turma.");
    const [classroom] = await this.deps.roster.getClassrooms(actor.institutionId, [input.classId]);
    if (!classroom) throw new RecognitionError("CLASS_NOT_FOUND", "Turma não encontrada.", 404);

    const school = actor.institutionId;
    const studentIds = [...new Set(input.studentIds)];
    const note = input.note ? input.note : null;
    const existing = new Map<string, RecognitionRecord>();
    for (const studentId of studentIds) {
      const found = await this.deps.recognitions.findByIdempotency(school, actor.userId, input.idempotencyKey, studentId);
      if (!found) continue;
      if (found.classId !== input.classId || found.subjectId !== input.subjectId || found.reason !== input.reason || found.note !== note) {
        throw new RecognitionError("IDEMPOTENCY_CONFLICT", "Esta chave já foi usada em outro envio. Atualize a tela e tente de novo.", 409);
      }
      existing.set(studentId, found);
    }

    const roster = new Map((await this.deps.roster.listActiveStudents(school, input.classId)).map((item) => [item.studentId, item]));
    const at = this.now();
    const day = recognitionDay(at);
    const subjectName = getSubject(input.subjectId).name;
    const reasonLabel = RECOGNITION_REASON_LABELS[input.reason];
    const teacherName = actorName.trim() || "Seu professor";
    const detail = note ? ` "${note}"` : "";
    const outcomes: RecognitionOutcome[] = [];

    for (const studentId of studentIds) {
      const previous = existing.get(studentId);
      if (previous) {
        outcomes.push({ studentId, status: "concedido", recognitionId: previous.id, points: previous.points, repeated: true });
        continue;
      }
      const student = roster.get(studentId);
      if (!student) {
        outcomes.push({ studentId, status: "sem_vinculo", points: 0 });
        continue;
      }
      const recognition: RecognitionRecord = {
        id: this.newId(), schoolId: school, teacherId: actor.userId, teacherName, classId: input.classId,
        subjectId: input.subjectId, studentId, reason: input.reason, note, points: RECOGNITION_POINTS,
        schoolYear: classroom.schoolYear, day, idempotencyKey: input.idempotencyKey, createdAt: at.toISOString(),
      };
      const guardianIds = await this.deps.roster.listConfirmedGuardians(school, studentId);
      const result = await this.deps.recognitions.grant({
        recognition, dailyLimit: RECOGNITION_DAILY_LIMIT, guardianIds,
        studentNotification: {
          title: `Você ganhou ${RECOGNITION_POINTS} pontos de patente`,
          body: `${teacherName} reconheceu em ${subjectName}: ${reasonLabel}.${detail}`,
        },
        guardianNotification: {
          title: `Elogio para ${firstName(student.fullName)}`,
          body: `${reasonLabel} em ${subjectName}, por ${teacherName}. Valeu ${RECOGNITION_POINTS} pontos de patente.${detail}`,
        },
      });
      if (result.status === "limit") outcomes.push({ studentId, status: "limite_diario", points: 0 });
      else if (result.status === "not_enrolled") outcomes.push({ studentId, status: "sem_vinculo", points: 0 });
      else outcomes.push({
        studentId, status: "concedido", recognitionId: result.recognition.id, points: result.recognition.points,
        repeated: result.status === "duplicate",
      });
    }

    const counts = await this.deps.recognitions.countForDay(school, actor.userId, day, studentIds.filter((id) => roster.has(id)));
    return {
      classId: input.classId, subjectId: input.subjectId, reason: input.reason, day,
      results: outcomes.map((outcome) => roster.has(outcome.studentId)
        ? { ...outcome, remainingToday: Math.max(0, RECOGNITION_DAILY_LIMIT - (counts.get(outcome.studentId) ?? 0)) }
        : outcome),
    };
  }

  async listForStudent(actor: SessionContext, requestedStudentId?: string) {
    const studentId = IdSchema.parse(requestedStudentId ?? actor.studentId ?? "");
    const school = actor.institutionId;
    const fullScope = (actor.roles.includes("aluno") && actor.studentId === studentId)
      || (actor.roles.includes("responsavel") && actor.guardianStudentIds.includes(studentId))
      || (actor.roles.includes("coordenador") && actor.coordinatorInstitutionIds.includes(school));
    // A teacher reads only records from his own class and subject pairs, not other teachers' notes.
    let visiblePairs: Set<string> | null = null;
    const activeClassId = await this.deps.roster.getActiveClassId(school, studentId);
    if (!fullScope) {
      const taught = actor.roles.includes("professor") ? this.assignedClassIds(actor) : new Set<string>();
      if (!activeClassId || !taught.has(activeClassId)) {
        throw new RecognitionError("STUDENT_NOT_FOUND", "Aluno não encontrado no seu escopo.", 404);
      }
      visiblePairs = new Set(actor.teacherAssignments
        .filter((assignment) => assignment.institutionId === school)
        .map((assignment) => `${assignment.classId}:${assignment.subjectId}`));
    }
    const records = (await this.deps.recognitions.listForStudent(school, studentId, LIST_LIMIT))
      .filter((record) => record.schoolId === school && record.studentId === studentId)
      .filter((record) => !visiblePairs || visiblePairs.has(`${record.classId}:${record.subjectId}`));
    let annualPoints: { schoolYear: number; points: number } | null = null;
    if (fullScope && activeClassId) {
      const [classroom] = await this.deps.roster.getClassrooms(school, [activeClassId]);
      if (classroom) {
        annualPoints = {
          schoolYear: classroom.schoolYear,
          points: await this.deps.recognitions.sumAnnualPoints(school, studentId, classroom.schoolYear),
        };
      }
    }
    return { studentId, annualPoints, recognitions: records.map(toRecognitionView) };
  }

  async annualPoints(schoolId: string, studentId: string, schoolYear: number) {
    return this.deps.recognitions.sumAnnualPoints(schoolId, studentId, schoolYear);
  }

  async listNotifications(actor: SessionContext) {
    const items = sortNotifications((await this.deps.notifications.listForUser(actor.institutionId, actor.userId, NOTIFICATION_LIMIT))
      .filter((item) => item.userId === actor.userId && item.schoolId === actor.institutionId)
      .filter((item) => actor.studentId === item.studentId || actor.guardianStudentIds.includes(item.studentId)));
    return {
      unreadCount: items.filter((item) => item.readAt === null).length,
      notifications: items.map(toNotificationView),
    };
  }

  async markNotificationRead(actor: SessionContext, notificationId: string) {
    const id = IdSchema.parse(notificationId);
    const updated = await this.deps.notifications.markRead(actor.institutionId, actor.userId, id, this.now().toISOString());
    if (!updated || (actor.studentId !== updated.studentId && !actor.guardianStudentIds.includes(updated.studentId))) {
      throw new RecognitionError("NOTIFICATION_NOT_FOUND", "Notificação não encontrada.", 404);
    }
    return { notification: toNotificationView(updated) };
  }
}
