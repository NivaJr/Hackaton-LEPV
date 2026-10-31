import type { NotificationView, RecognitionOutcome, RecognitionReason } from "../model";

export class RecognitionApiError extends Error {
  constructor(readonly code: string, message: string, readonly status: number) {
    super(message);
    this.name = "RecognitionApiError";
  }
}

export interface ClassStudent {
  studentId: string;
  name: string;
  initials: string;
  awardedToday: number;
  remainingToday: number;
}

export interface ClassStudentsResponse {
  classId: string;
  className: string;
  day: string;
  dailyLimit: number;
  points: number;
  students: ClassStudent[];
}

export interface GrantResponse {
  classId: string;
  subjectId: string;
  reason: RecognitionReason;
  day: string;
  results: RecognitionOutcome[];
}

export interface NotificationsResponse {
  unreadCount: number;
  notifications: NotificationView[];
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, { credentials: "same-origin", cache: "no-store", ...init });
  } catch {
    throw new RecognitionApiError("NETWORK", "Sem conexão. Confira a internet e tente de novo.", 0);
  }
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error = (payload as { error?: { code?: string; message?: string } } | null)?.error;
    throw new RecognitionApiError(error?.code ?? "HTTP_ERROR", error?.message ?? "Não foi possível concluir agora.", response.status);
  }
  return payload as T;
}

const json = (body: unknown): RequestInit => ({
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
});

export const recognitionApi = {
  students: (classId: string) => request<ClassStudentsResponse>(`/api/recognition/students?classId=${encodeURIComponent(classId)}`),
  grant: (input: { classId: string; subjectId: string; studentIds: string[]; reason: RecognitionReason; note?: string; idempotencyKey: string }) =>
    request<GrantResponse>("/api/recognition", json(input)),
  notifications: () => request<NotificationsResponse>("/api/notifications"),
  markRead: (id: string) => request<{ notification: NotificationView }>(`/api/notifications/${encodeURIComponent(id)}/read`, json({})),
};
