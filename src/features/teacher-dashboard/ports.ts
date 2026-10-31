import { TeacherMetricsSourceSchema, type ClassMetrics, type ClassMetricsRequest, type TeacherMetricsSource } from "./domain/model";

export interface TeacherMetricsGateway {
  readonly source: TeacherMetricsSource;
  getClassMetrics(request: ClassMetricsRequest): Promise<ClassMetrics>;
}

/** Message is safe to show to the teacher; never include tokens, URLs or raw upstream bodies. */
export class TeacherMetricsUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TeacherMetricsUnavailableError";
  }
}

export function resolveTeacherMetricsSource(value: string | undefined): { source: TeacherMetricsSource; invalid: boolean } {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return { source: "fake", invalid: false };
  const parsed = TeacherMetricsSourceSchema.safeParse(normalized);
  return parsed.success ? { source: parsed.data, invalid: false } : { source: "fake", invalid: true };
}
