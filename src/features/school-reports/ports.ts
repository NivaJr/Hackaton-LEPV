import type { SchoolReportFile } from "./model";

/** Every method is scoped by a schoolId taken from the session, never from the request. */
export interface SchoolReportStore {
  isStudentOfSchool(schoolId: string, studentId: string): Promise<boolean>;
  activeClassId(schoolId: string, studentId: string): Promise<string | null>;
  listClassStudents(schoolId: string, classId: string): Promise<{ id: string; fullName: string }[]>;
  list(schoolId: string, studentId: string): Promise<SchoolReportFile[]>;
  save(schoolId: string, studentId: string, input: { id: string; label: string; bytes: Uint8Array }): Promise<SchoolReportFile>;
  /** Null when the file does not exist for this student. */
  read(schoolId: string, studentId: string, fileId: string): Promise<Uint8Array | null>;
  remove(schoolId: string, studentId: string, fileId: string): Promise<boolean>;
}
