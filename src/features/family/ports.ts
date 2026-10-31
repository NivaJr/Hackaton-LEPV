import type { SessionContext } from "@/contracts";
import type { ChildRecord, FamilyRecord, FamilyRecordCategory, HistoryEntry, MetricsResult } from "./model";

export interface FamilyRepository {
  getChildren(schoolId: string, studentIds: string[]): Promise<ChildRecord[]>;
  getRecord(schoolId: string, studentId: string, category: FamilyRecordCategory): Promise<FamilyRecord>;
  saveRecord(schoolId: string, studentId: string, category: FamilyRecordCategory, details: string): Promise<FamilyRecord>;
  getHistory(schoolId: string, studentId: string): Promise<HistoryEntry[]>;
}

export interface FamilyMetricsGateway {
  /** The actor travels with the call so the learning core repeats its own authorization. */
  studentSummary(actor: SessionContext, studentId: string, from: string, to: string): Promise<MetricsResult>;
}
