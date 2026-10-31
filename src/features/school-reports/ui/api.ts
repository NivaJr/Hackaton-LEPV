import type { SchoolReportFile } from "../model";

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/school-reports/${path}`, { cache: "no-store", ...init });
  const body = await response.json().catch(() => null) as { error?: { message?: string } } | null;
  if (!response.ok) throw new Error(body?.error?.message ?? "Não foi possível concluir a operação.");
  return body as T;
}

export const reportFileUrl = (studentId: string, fileId: string) => `/api/school-reports/students/${studentId}/files/${fileId}`;

export const schoolReportsApi = {
  classStudents: (classId: string) => call<{ students: { id: string; fullName: string }[] }>(`classes/${classId}/students`),
  list: (studentId: string) => call<{ reports: SchoolReportFile[] }>(`students/${studentId}`),
  upload: (studentId: string, label: string, file: File) => {
    const form = new FormData();
    form.set("label", label);
    form.set("file", file);
    return call<SchoolReportFile>(`students/${studentId}`, { method: "POST", body: form });
  },
  remove: (studentId: string, fileId: string) => call(`students/${studentId}/files/${fileId}`, { method: "DELETE" }),
};
