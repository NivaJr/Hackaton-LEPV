import { z } from "zod";
import type { StudentSummary } from "@/contracts";

export class FamilyError extends Error {
  constructor(public readonly code: string, message: string, public readonly status: number) {
    super(message);
    this.name = "FamilyError";
  }
}

export const FamilyRecordCategorySchema = z.enum(["health", "support"]);
export type FamilyRecordCategory = z.infer<typeof FamilyRecordCategorySchema>;
export const FamilyRecordInputSchema = z.object({ details: z.string().max(10_000) }).strict();

export interface ChildRecord { id: string; fullName: string; classroomName: string | null; grade: number | null; }
export interface FamilyRecord { details: string; updatedAt: string | null; }
export interface HistoryEntry {
  id: string;
  subjectId: string;
  schoolYear: number;
  period: string;
  grade: number | null;
  notes: string;
}
export type MetricsResult = { source: "fixture" | "real"; summary: StudentSummary } | { source: "unavailable"; summary: null };
export interface StudentOverview {
  student: ChildRecord;
  health: FamilyRecord;
  support: FamilyRecord;
  history: HistoryEntry[];
  metrics: MetricsResult;
}
export interface FeedbackResult { text: string; origin: "ia" | "automatica"; metricsSource: MetricsResult["source"]; }
