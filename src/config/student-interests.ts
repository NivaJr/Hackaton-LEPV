export const APPROVED_STUDENT_INTERESTS = [
  "animais",
  "artes",
  "astronomia",
  "ciência",
  "dança",
  "desenho",
  "esportes",
  "futebol",
  "geografia",
  "história",
  "idiomas",
  "jogos educativos",
  "leitura",
  "matemática",
  "música",
  "natureza",
  "programação",
  "quebra-cabeças",
  "tecnologia",
  "xadrez",
] as const;

export type ApprovedStudentInterest = (typeof APPROVED_STUDENT_INTERESTS)[number];

export function isApprovedStudentInterest(value: string): value is ApprovedStudentInterest {
  return (APPROVED_STUDENT_INTERESTS as readonly string[]).includes(value);
}
