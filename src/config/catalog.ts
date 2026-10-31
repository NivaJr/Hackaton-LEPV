export const GRADES = [6, 7, 8, 9] as const;

export const SUBJECT_IDS = [
  "matematica",
  "portugues",
  "ingles",
  "historia",
  "geografia",
  "biologia",
] as const;

export type Grade = (typeof GRADES)[number];
export type SubjectId = (typeof SUBJECT_IDS)[number];

export const SUBJECTS = [
  { id: "matematica", name: "Matemática", bnccComponent: "MA" },
  { id: "portugues", name: "Português", bnccComponent: "LP" },
  { id: "ingles", name: "Inglês", bnccComponent: "LI" },
  { id: "historia", name: "História", bnccComponent: "HI" },
  { id: "geografia", name: "Geografia", bnccComponent: "GE" },
  { id: "biologia", name: "Biologia", bnccComponent: "CI" },
] as const satisfies ReadonlyArray<{
  id: SubjectId;
  name: string;
  bnccComponent: string;
}>;

export function getSubject(subjectId: SubjectId) {
  return SUBJECTS.find((subject) => subject.id === subjectId)!;
}

/** Syntactic/grade compatibility only; publication still requires an official catalogue lookup. */
export function isSkillCompatible(
  skillCode: string,
  subjectId: SubjectId,
  grade: Grade,
): boolean {
  const match = /^EF(0[6-9]|67|69|89)(MA|LP|LI|HI|GE|CI)\d{2}$/.exec(skillCode);
  if (!match || match[2] !== getSubject(subjectId).bnccComponent) return false;
  const year = match[1];
  if (year.startsWith("0")) return Number(year) === grade;
  return grade >= Number(year[0]) && grade <= Number(year[1]);
}
