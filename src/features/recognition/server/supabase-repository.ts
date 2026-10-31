import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SubjectIdSchema } from "@/contracts";
import { RecognitionError, RecognitionReasonSchema, type NotificationRecord, type RecognitionRecord } from "../model";
import type {
  ClassroomInfo, GrantInput, GrantResult, NotificationRepository, RecognitionRepository, RosterReader, RosterStudent,
} from "../ports";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MISSING_OBJECT_CODES = new Set(["42P01", "42883", "PGRST202", "PGRST205"]);
const RECOGNITION_COLUMNS = "id, school_id, teacher_id, teacher_name, classroom_id, subject_id, student_id, reason, note, points, school_year, award_day, idempotency_key, created_at";
const NOTIFICATION_COLUMNS = "id, school_id, user_id, student_id, kind, recognition_id, title, body, created_at, read_at";

type PostgrestError = { code?: string; message?: string } | null;

const uuids = (values: string[]) => values.filter((value) => UUID.test(value));

/** Maps database failures. Missing tables or RPCs mean the proposed migration was not applied yet. */
export function toStoreError(error: NonNullable<PostgrestError>): RecognitionError {
  if (error.code && MISSING_OBJECT_CODES.has(error.code)) {
    return new RecognitionError(
      "STORE_UNAVAILABLE",
      "Os elogios ainda não estão disponíveis neste banco. Falta aplicar a migração de reconhecimentos (docs/RECONHECIMENTO.md).",
      503,
    );
  }
  return new RecognitionError("STORE_ERROR", "Não foi possível acessar os elogios agora. Tente de novo em instantes.", 503);
}

function check(result: { data: unknown; error: PostgrestError }): unknown {
  if (result.error) throw toStoreError(result.error);
  return result.data;
}

type RecognitionRow = {
  id: string; school_id: string; teacher_id: string; teacher_name: string; classroom_id: string; subject_id: string;
  student_id: string; reason: string; note: string | null; points: number | string; school_year: number;
  award_day: string; idempotency_key: string; created_at: string;
};

type NotificationRow = {
  id: string; school_id: string; user_id: string; student_id: string; kind: string; recognition_id: string;
  title: string; body: string; created_at: string; read_at: string | null;
};

export function toRecognitionRecord(row: RecognitionRow): RecognitionRecord {
  return {
    id: row.id, schoolId: row.school_id, teacherId: row.teacher_id, teacherName: row.teacher_name,
    classId: row.classroom_id, subjectId: SubjectIdSchema.parse(row.subject_id), studentId: row.student_id,
    reason: RecognitionReasonSchema.parse(row.reason), note: row.note, points: Number(row.points),
    schoolYear: Number(row.school_year), day: row.award_day, idempotencyKey: row.idempotency_key,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

export function toNotificationRecord(row: NotificationRow): NotificationRecord {
  if (row.kind !== "recognition") throw new RecognitionError("STORE_ERROR", "Tipo de notificação desconhecido.", 500);
  return {
    id: row.id, schoolId: row.school_id, userId: row.user_id, studentId: row.student_id, kind: "recognition",
    recognitionId: row.recognition_id, title: row.title, body: row.body,
    createdAt: new Date(row.created_at).toISOString(), readAt: row.read_at ? new Date(row.read_at).toISOString() : null,
  };
}

/**
 * Uses the service-role client only after the service validated the session.
 * Every query filters by the school taken from the session.
 */
export class SupabaseRecognitionStore implements RecognitionRepository, NotificationRepository {
  constructor(private readonly client: SupabaseClient) {}

  async grant(input: GrantInput): Promise<GrantResult> {
    const { recognition: r } = input;
    const data = check(await this.client.rpc("recognition_grant", {
      p_id: r.id, p_school: r.schoolId, p_teacher: r.teacherId, p_teacher_name: r.teacherName, p_class: r.classId,
      p_subject: r.subjectId, p_student: r.studentId, p_reason: r.reason, p_note: r.note, p_points: r.points,
      p_school_year: r.schoolYear, p_day: r.day, p_key: r.idempotencyKey, p_created_at: r.createdAt,
      p_limit: input.dailyLimit, p_guardian_ids: uuids(input.guardianIds),
      p_student_title: input.studentNotification.title, p_student_body: input.studentNotification.body,
      p_guardian_title: input.guardianNotification.title, p_guardian_body: input.guardianNotification.body,
    })) as { status?: string; recognition?: RecognitionRow } | null;
    if (data?.status === "limit") return { status: "limit" };
    if (data?.status === "not_enrolled") return { status: "not_enrolled" };
    if ((data?.status === "created" || data?.status === "duplicate") && data.recognition) {
      return { status: data.status, recognition: toRecognitionRecord(data.recognition) };
    }
    throw new RecognitionError("STORE_ERROR", "Resposta inesperada do banco ao registrar o elogio.", 500);
  }

  async findByIdempotency(schoolId: string, teacherId: string, idempotencyKey: string, studentId: string) {
    if (!UUID.test(studentId)) return null;
    const row = check(await this.client.from("teacher_recognitions").select(RECOGNITION_COLUMNS)
      .eq("school_id", schoolId).eq("teacher_id", teacherId).eq("idempotency_key", idempotencyKey).eq("student_id", studentId)
      .maybeSingle()) as RecognitionRow | null;
    return row ? toRecognitionRecord(row) : null;
  }

  async countForDay(schoolId: string, teacherId: string, day: string, studentIds: string[]) {
    const counts = new Map<string, number>();
    const ids = uuids(studentIds);
    if (!ids.length) return counts;
    const rows = check(await this.client.from("teacher_recognitions").select("student_id")
      .eq("school_id", schoolId).eq("teacher_id", teacherId).eq("award_day", day).in("student_id", ids)) as Array<{ student_id: string }> | null;
    for (const row of rows ?? []) counts.set(row.student_id, (counts.get(row.student_id) ?? 0) + 1);
    return counts;
  }

  async listForStudent(schoolId: string, studentId: string, limit: number) {
    if (!UUID.test(studentId)) return [];
    const rows = check(await this.client.from("teacher_recognitions").select(RECOGNITION_COLUMNS)
      .eq("school_id", schoolId).eq("student_id", studentId)
      .order("created_at", { ascending: false }).limit(limit)) as RecognitionRow[] | null;
    return (rows ?? []).map(toRecognitionRecord);
  }

  async sumAnnualPoints(schoolId: string, studentId: string, schoolYear: number) {
    if (!UUID.test(studentId)) return 0;
    const rows = check(await this.client.from("teacher_recognitions").select("points")
      .eq("school_id", schoolId).eq("student_id", studentId).eq("school_year", schoolYear)) as Array<{ points: number | string }> | null;
    return (rows ?? []).reduce((total, row) => total + Number(row.points), 0);
  }

  async listForUser(schoolId: string, userId: string, limit: number) {
    const rows = check(await this.client.from("notifications").select(NOTIFICATION_COLUMNS)
      .eq("school_id", schoolId).eq("user_id", userId)
      .order("read_at", { ascending: false, nullsFirst: true }).order("created_at", { ascending: false })
      .limit(limit)) as NotificationRow[] | null;
    return (rows ?? []).map(toNotificationRecord);
  }

  async markRead(schoolId: string, userId: string, notificationId: string, readAt: string) {
    if (!UUID.test(notificationId)) return null;
    const updated = check(await this.client.from("notifications").update({ read_at: readAt })
      .eq("id", notificationId).eq("school_id", schoolId).eq("user_id", userId).is("read_at", null)
      .select(NOTIFICATION_COLUMNS).maybeSingle()) as NotificationRow | null;
    if (updated) return toNotificationRecord(updated);
    const current = check(await this.client.from("notifications").select(NOTIFICATION_COLUMNS)
      .eq("id", notificationId).eq("school_id", schoolId).eq("user_id", userId).maybeSingle()) as NotificationRow | null;
    return current ? toNotificationRecord(current) : null;
  }
}

export class SupabaseRosterReader implements RosterReader {
  constructor(private readonly client: SupabaseClient) {}

  async getClassrooms(schoolId: string, classIds: string[]): Promise<ClassroomInfo[]> {
    const ids = uuids(classIds);
    if (!ids.length) return [];
    const rows = check(await this.client.from("classrooms").select("id, school_id, name, grade, school_year")
      .eq("school_id", schoolId).in("id", ids)) as Array<{ id: string; school_id: string; name: string; grade: number; school_year: number }> | null;
    return (rows ?? []).map((row) => ({ id: row.id, schoolId: row.school_id, name: row.name, grade: row.grade, schoolYear: row.school_year }));
  }

  async listActiveStudents(schoolId: string, classId: string): Promise<RosterStudent[]> {
    if (!UUID.test(classId)) return [];
    const enrollments = check(await this.client.from("enrollments").select("student_id")
      .eq("school_id", schoolId).eq("classroom_id", classId).eq("status", "active")) as Array<{ student_id: string }> | null;
    const ids = (enrollments ?? []).map((row) => row.student_id);
    if (!ids.length) return [];
    const profiles = check(await this.client.from("profiles").select("id, full_name")
      .eq("school_id", schoolId).in("id", ids)) as Array<{ id: string; full_name: string }> | null;
    return (profiles ?? []).map((row) => ({ studentId: row.id, fullName: row.full_name }));
  }

  async getActiveClassId(schoolId: string, studentId: string) {
    if (!UUID.test(studentId)) return null;
    const row = check(await this.client.from("enrollments").select("classroom_id")
      .eq("school_id", schoolId).eq("student_id", studentId).eq("status", "active").maybeSingle()) as { classroom_id: string } | null;
    return row?.classroom_id ?? null;
  }

  async listConfirmedGuardians(schoolId: string, studentId: string) {
    if (!UUID.test(studentId)) return [];
    const rows = check(await this.client.from("guardian_links").select("guardian_id")
      .eq("school_id", schoolId).eq("student_id", studentId).eq("status", "confirmed")) as Array<{ guardian_id: string }> | null;
    return (rows ?? []).map((row) => row.guardian_id);
  }
}
