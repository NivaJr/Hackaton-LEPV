import type { NotificationRecord, RecognitionRecord } from "./model";
import type {
  ClassroomInfo, GrantInput, GrantResult, NotificationRepository, RecognitionRepository, RosterReader, RosterStudent,
} from "./ports";

/** Single-process store for tests and demos. Data disappears on restart. */
export class MemoryRecognitionStore implements RecognitionRepository, NotificationRepository {
  readonly recognitions: RecognitionRecord[] = [];
  readonly notifications: NotificationRecord[] = [];

  constructor(private readonly newId: () => string = () => crypto.randomUUID()) {}

  async grant(input: GrantInput): Promise<GrantResult> {
    const { recognition } = input;
    const previous = this.recognitions.find((item) => item.schoolId === recognition.schoolId
      && item.teacherId === recognition.teacherId && item.idempotencyKey === recognition.idempotencyKey
      && item.studentId === recognition.studentId);
    if (previous) return { status: "duplicate", recognition: previous };
    const today = this.recognitions.filter((item) => item.schoolId === recognition.schoolId
      && item.teacherId === recognition.teacherId && item.studentId === recognition.studentId && item.day === recognition.day);
    if (today.length >= input.dailyLimit) return { status: "limit" };
    this.recognitions.push({ ...recognition });
    const recipients = [
      { userId: recognition.studentId, draft: input.studentNotification },
      ...[...new Set(input.guardianIds)].filter((id) => id !== recognition.studentId)
        .map((userId) => ({ userId, draft: input.guardianNotification })),
    ];
    for (const recipient of recipients) {
      this.notifications.push({
        id: this.newId(), schoolId: recognition.schoolId, userId: recipient.userId, studentId: recognition.studentId,
        kind: "recognition", recognitionId: recognition.id, title: recipient.draft.title, body: recipient.draft.body,
        createdAt: recognition.createdAt, readAt: null,
      });
    }
    return { status: "created", recognition: { ...recognition } };
  }

  async findByIdempotency(schoolId: string, teacherId: string, idempotencyKey: string, studentId: string) {
    const found = this.recognitions.find((item) => item.schoolId === schoolId && item.teacherId === teacherId
      && item.idempotencyKey === idempotencyKey && item.studentId === studentId);
    return found ? { ...found } : null;
  }

  async countForDay(schoolId: string, teacherId: string, day: string, studentIds: string[]) {
    const wanted = new Set(studentIds);
    const counts = new Map<string, number>();
    for (const item of this.recognitions) {
      if (item.schoolId !== schoolId || item.teacherId !== teacherId || item.day !== day || !wanted.has(item.studentId)) continue;
      counts.set(item.studentId, (counts.get(item.studentId) ?? 0) + 1);
    }
    return counts;
  }

  async listForStudent(schoolId: string, studentId: string, limit: number) {
    return this.recognitions
      .filter((item) => item.schoolId === schoolId && item.studentId === studentId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id))
      .slice(0, limit)
      .map((item) => ({ ...item }));
  }

  async sumAnnualPoints(schoolId: string, studentId: string, schoolYear: number) {
    return this.recognitions
      .filter((item) => item.schoolId === schoolId && item.studentId === studentId && item.schoolYear === schoolYear)
      .reduce((total, item) => total + item.points, 0);
  }

  async listForUser(schoolId: string, userId: string, limit: number) {
    return this.notifications
      .filter((item) => item.schoolId === schoolId && item.userId === userId)
      .sort((a, b) => Number(a.readAt !== null) - Number(b.readAt !== null) || b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit)
      .map((item) => ({ ...item }));
  }

  async markRead(schoolId: string, userId: string, notificationId: string, readAt: string) {
    const found = this.notifications.find((item) => item.id === notificationId && item.schoolId === schoolId && item.userId === userId);
    if (!found) return null;
    found.readAt ??= readAt;
    return { ...found };
  }
}

export interface MemoryRosterSeed {
  classrooms: ClassroomInfo[];
  enrollments: Array<{ schoolId: string; classId: string; studentId: string; fullName: string; status: "active" | "transferred" | "inactive" }>;
  guardians?: Array<{ schoolId: string; guardianId: string; studentId: string; status: "pending" | "confirmed" | "revoked" }>;
}

export class MemoryRosterReader implements RosterReader {
  constructor(private readonly seed: MemoryRosterSeed) {}

  async getClassrooms(schoolId: string, classIds: string[]) {
    return this.seed.classrooms.filter((item) => item.schoolId === schoolId && classIds.includes(item.id));
  }

  async listActiveStudents(schoolId: string, classId: string): Promise<RosterStudent[]> {
    return this.seed.enrollments
      .filter((item) => item.schoolId === schoolId && item.classId === classId && item.status === "active")
      .map((item) => ({ studentId: item.studentId, fullName: item.fullName }));
  }

  async getActiveClassId(schoolId: string, studentId: string) {
    return this.seed.enrollments.find((item) => item.schoolId === schoolId && item.studentId === studentId && item.status === "active")?.classId ?? null;
  }

  async listConfirmedGuardians(schoolId: string, studentId: string) {
    return (this.seed.guardians ?? [])
      .filter((item) => item.schoolId === schoolId && item.studentId === studentId && item.status === "confirmed")
      .map((item) => item.guardianId);
  }
}
