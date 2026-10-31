import type { ChildRecord, FamilyRecord, FamilyRecordCategory, HistoryEntry, MetricsResult } from "./model";

export interface FamilyRepository {
  getChildren(schoolId: string, studentIds: string[]): Promise<ChildRecord[]>;
  getRecord(schoolId: string, studentId: string, category: FamilyRecordCategory): Promise<FamilyRecord>;
  saveRecord(schoolId: string, studentId: string, category: FamilyRecordCategory, details: string): Promise<FamilyRecord>;
  getHistory(schoolId: string, studentId: string): Promise<HistoryEntry[]>;
}

export interface FamilyMetricsGateway {
  studentSummary(studentId: string, from: string, to: string): Promise<MetricsResult>;
}
