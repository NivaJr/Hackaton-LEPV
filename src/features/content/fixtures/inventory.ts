import { GRADES, SUBJECTS, type Grade, type SubjectId } from "@/config/catalog";
import { DEMO_EXAMPLES } from "./examples";

export const TARGET_PER_COMBINATION = 10;
export const TARGET_TOTAL = GRADES.length * SUBJECTS.length * TARGET_PER_COMBINATION;

export type InventoryRow = { grade: Grade; subjectId: SubjectId; demoExamples: number; reviewedByTeacher: number; target: number };

/** reviewedByTeacher stays 0: demo examples were written by developers, not reviewed in class. */
export function buildContentInventory(): { rows: InventoryRow[]; totalDemoExamples: number; totalReviewed: number; target: number } {
  const rows = GRADES.flatMap((grade) => SUBJECTS.map((subject) => ({
    grade,
    subjectId: subject.id,
    demoExamples: DEMO_EXAMPLES.filter((example) => example.body.grade === grade && example.body.subjectId === subject.id).length,
    reviewedByTeacher: 0,
    target: TARGET_PER_COMBINATION,
  })));
  return {
    rows,
    totalDemoExamples: rows.reduce((sum, row) => sum + row.demoExamples, 0),
    totalReviewed: 0,
    target: TARGET_TOTAL,
  };
}
