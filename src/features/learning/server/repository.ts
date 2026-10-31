import type { StudentPreferences, StudentPreferencesUpdate } from "@/contracts";
import type { LearningState, LoadedStudent, RankingRow, VersionedCatalog } from "./model";

/** All IDs in this port are derived/authorized by the server, never a client-supplied actor. */
export interface LearningRepository {
  loadStudent(institutionId: string, studentId: string): Promise<LoadedStudent>;
  commitStudent(before: LoadedStudent, state: LearningState): Promise<boolean>;
  savePreferences(institutionId: string, studentId: string, value: StudentPreferencesUpdate): Promise<StudentPreferences>;
  loadCatalog(institutionId: string, classId: string): Promise<VersionedCatalog>;
  commitCatalog(before: VersionedCatalog, after: VersionedCatalog["catalog"]): Promise<boolean>;
  ranking(institutionId: string, classId: string): Promise<RankingRow[]>;
}
