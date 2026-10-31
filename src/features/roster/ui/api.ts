import type { SubjectId } from "@/contracts";
import type { ImportConfirm, ImportKind, ImportPreview, ImportResult } from "../model";
import type { AssignmentRecord, ClassMetrics, ClassroomRecord, EnrollmentRecord, GuardianLinkRecord, PersonRecord } from "../model";

export interface RosterOverview {
  classrooms: ClassroomRecord[];
  enrollments: EnrollmentRecord[];
  assignments: AssignmentRecord[];
  students: PersonRecord[];
  teachers: PersonRecord[];
  guardians: PersonRecord[];
  guardianLinks: GuardianLinkRecord[];
  metrics: { source: "fixture" | "real"; classes: ClassMetrics[] };
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/roster/${path}`, init);
  const body = await response.json().catch(() => null) as { error?: { message?: string } } | null;
  if (!response.ok) throw new Error(body?.error?.message ?? "Não foi possível concluir a operação.");
  return body as T;
}

const send = (method: string, body?: unknown): RequestInit => ({
  method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body ?? {}),
});

export const rosterApi = {
  overview: () => call<RosterOverview>("overview"),
  createClassroom: (input: { name: string; grade: number; schoolYear: number }) => call<ClassroomRecord>("classrooms", send("POST", input)),
  updateClassroom: (id: string, input: { name: string; grade: number; schoolYear: number }) => call<ClassroomRecord>(`classrooms/${id}`, send("PATCH", input)),
  deleteClassroom: (id: string) => call(`classrooms/${id}`, send("DELETE")),
  assign: (input: { classroomId: string; teacherId: string; subjectId: SubjectId }) => call("assignments", send("POST", input)),
  unassign: (id: string) => call(`assignments/${id}`, send("DELETE")),
  allocate: (input: { classroomId: string; studentId: string; expectedEnrollmentId?: string }) => call("enrollments", send("POST", input)),
  removeEnrollment: (id: string) => call(`enrollments/${id}`, send("DELETE")),
  linkGuardian: (input: { studentId: string; fullName: string; email: string }) => call<GuardianLinkRecord>("guardian-links", send("POST", input)),
  setGuardianLink: (id: string, status: "confirmed" | "revoked") => call<GuardianLinkRecord>(`guardian-links/${id}`, send("PATCH", { status })),
  preview: (kind: ImportKind, classroomId: string, file: File) => {
    const form = new FormData();
    form.set("kind", kind);
    form.set("classroomId", classroomId);
    form.set("file", file);
    return call<ImportPreview>("imports/preview", { method: "POST", body: form });
  },
  confirm: (input: ImportConfirm) => call<ImportResult>("imports/confirm", send("POST", input)),
};
