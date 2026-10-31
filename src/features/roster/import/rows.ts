import { z } from "zod";
import { SUBJECTS } from "@/config/catalog";
import type { SubjectId } from "@/contracts";
import { MAX_IMPORT_ROWS, RosterError, type ImportKind, type RowIssue } from "../model";
import type { SheetRow } from "./spreadsheet";

export interface ParsedRow {
  line: number;
  fullName: string;
  email: string;
  subject?: string;
  subjectId?: SubjectId;
  issues: RowIssue[];
}

const NAME_PATTERN = /^\p{L}[\p{L}\p{M}'’. -]*$/u;
const FORMULA_PREFIX = /^[=+\-@]/;
const EmailSchema = z.email();

export function normalizeLabel(value: string): string {
  return value.normalize("NFD").replace(/\p{M}/gu, "").trim().toLocaleLowerCase("pt-BR").replace(/\s+/g, " ");
}

const SUBJECT_BY_LABEL = new Map<string, SubjectId>(SUBJECTS.flatMap((subject) => [
  [normalizeLabel(subject.name), subject.id],
  [subject.id, subject.id],
]));

const HEADERS: Record<string, "fullName" | "email" | "subject"> = {
  "nome completo": "fullName",
  "email": "email", "e-mail": "email", "email do aluno": "email", "e-mail do aluno": "email",
  "materia": "subject",
};

export const TEMPLATES: Record<ImportKind, { fileName: string; content: string }> = {
  students: { fileName: "modelo-alunos.csv", content: "nome completo,email\nAluna Exemplo Silva,aluna.exemplo@escola.example\n" },
  teachers: { fileName: "modelo-professores.csv", content: "nome completo,email,matéria\nProfessor Exemplo Lima,professor.exemplo@escola.example,Matemática\n" },
};

export function validateRow(kind: ImportKind, row: { line: number; fullName: string; email: string; subject?: string }): ParsedRow {
  const fullName = row.fullName.trim().replace(/\s+/g, " ");
  const email = row.email.trim().toLocaleLowerCase("pt-BR");
  const subject = row.subject?.trim();
  const issues: RowIssue[] = [];
  if ([fullName, email, subject ?? ""].some((value) => FORMULA_PREFIX.test(value))) {
    issues.push({ code: "FORMULA_CELL", message: "Células com fórmula não são aceitas." });
  }
  if (!fullName) issues.push({ code: "NAME_REQUIRED", message: "Informe o nome completo." });
  else if (fullName.length > 200 || !NAME_PATTERN.test(fullName) || !fullName.includes(" ")) {
    issues.push({ code: "INVALID_NAME", message: "Nome completo inválido." });
  }
  if (!email) issues.push({ code: "EMAIL_REQUIRED", message: "Informe o email." });
  else if (!EmailSchema.safeParse(email).success) issues.push({ code: "INVALID_EMAIL", message: "Email inválido." });
  const subjectId = kind === "teachers" ? SUBJECT_BY_LABEL.get(normalizeLabel(subject ?? "")) : undefined;
  if (kind === "teachers" && !subjectId) {
    issues.push({ code: "INVALID_SUBJECT", message: "Matéria fora do catálogo." });
  }
  return { line: row.line, fullName, email, ...(subject ? { subject } : {}), ...(subjectId ? { subjectId } : {}), issues };
}

export function rowKey(kind: ImportKind, row: ParsedRow): string {
  return kind === "teachers" ? `${row.email}|${row.subjectId ?? row.subject ?? ""}` : row.email;
}

/** Later occurrences of the same person (or teacher and subject) are rejected with the first line. */
export function markDuplicates(kind: ImportKind, rows: ParsedRow[]): ParsedRow[] {
  const seen = new Map<string, number>();
  return rows.map((row) => {
    if (!row.email) return row;
    const key = rowKey(kind, row);
    const first = seen.get(key);
    if (first === undefined) { seen.set(key, row.line); return row; }
    return { ...row, issues: [...row.issues, { code: "DUPLICATE_IN_FILE", message: `Repete a linha ${first} do arquivo.` }] };
  });
}

export function parseImportRows(kind: ImportKind, sheet: SheetRow[]): ParsedRow[] {
  const [header, ...body] = sheet;
  if (!header) throw new RosterError("INVALID_FILE", "O arquivo não tem cabeçalho.", 422);
  const columns = new Map<string, number>();
  header.cells.forEach((cell, index) => {
    const field = HEADERS[normalizeLabel(cell)];
    if (field && !columns.has(field)) columns.set(field, index);
  });
  const required = kind === "teachers" ? ["fullName", "email", "subject"] : ["fullName", "email"];
  if (required.some((field) => !columns.has(field))) {
    const expected = kind === "teachers" ? "nome completo, email e matéria" : "nome completo e email (ou email do aluno)";
    throw new RosterError("INVALID_HEADERS", `Cabeçalhos obrigatórios: ${expected}.`, 422);
  }
  if (body.length === 0) throw new RosterError("INVALID_FILE", "O arquivo não tem linhas de dados.", 422);
  if (body.length > MAX_IMPORT_ROWS) throw new RosterError("TOO_MANY_ROWS", `O limite é de ${MAX_IMPORT_ROWS} linhas por arquivo.`, 422);
  const cell = (row: SheetRow, field: string) => row.cells[columns.get(field) ?? -1] ?? "";
  return markDuplicates(kind, body.map((row) => validateRow(kind, {
    line: row.line, fullName: cell(row, "fullName"), email: cell(row, "email"),
    ...(kind === "teachers" ? { subject: cell(row, "subject") } : {}),
  })));
}
