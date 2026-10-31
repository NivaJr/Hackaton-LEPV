import { describe, expect, it } from "vitest";
import { TEMPLATES, parseImportRows } from "@/features/roster/import/rows";
import { MAX_FILE_BYTES, parseCsv, parseXlsx, readSpreadsheet } from "@/features/roster/import/spreadsheet";
import { workbook, zip } from "./helpers/xlsx";

const csv = (text: string) => new TextEncoder().encode(text);
const students = (text: string) => parseImportRows("students", readSpreadsheet({ name: "alunos.csv", bytes: csv(text) }));
const teachers = (text: string) => parseImportRows("teachers", readSpreadsheet({ name: "professores.csv", bytes: csv(text) }));

describe("leitura de CSV", () => {
  it("aceita vírgula, ponto e vírgula, aspas, BOM e preserva o número real da linha", () => {
    expect(parseCsv("﻿a;b\n\n\"Silva; Ana\";x\n")).toEqual([
      { line: 1, cells: ["a", "b"] }, { line: 3, cells: ["Silva; Ana", "x"] },
    ]);
    expect(parseCsv("a,b\r\n\"com \"\"aspas\"\"\nquebra\",y\r\nz,w")).toEqual([
      { line: 1, cells: ["a", "b"] }, { line: 2, cells: ["com \"aspas\"\nquebra", "y"] }, { line: 4, cells: ["z", "w"] },
    ]);
  });

  it("rejeita aspas sem fechamento", () => {
    expect(() => parseCsv("a,b\n\"aberto,x")).toThrowError(/aspas/);
  });

  it("lê acentos de CSV salvo em Windows-1252", () => {
    const bytes = Uint8Array.from([...Buffer.from("nome completo,email\nJo"), 0xe3, ...Buffer.from("o Silva,joao@exemplo.com\n")]);
    expect(parseImportRows("students", readSpreadsheet({ name: "a.csv", bytes }))[0].fullName).toBe("João Silva");
  });
});

describe("validação de arquivo", () => {
  it("recusa tipo, tamanho, conteúdo vazio e extensão que não corresponde ao conteúdo", () => {
    expect(() => readSpreadsheet({ name: "a.xls", bytes: csv("x") })).toThrowError(/\.csv ou \.xlsx/);
    expect(() => readSpreadsheet({ name: "a.csv", bytes: new Uint8Array() })).toThrowError(/vazio/);
    expect(() => readSpreadsheet({ name: "a.csv", bytes: new Uint8Array(MAX_FILE_BYTES + 1) })).toThrowError(/2 MB/);
    expect(() => readSpreadsheet({ name: "a.csv", bytes: workbook("") })).toThrowError(/\.csv ou \.xlsx/);
    expect(() => readSpreadsheet({ name: "a.xlsx", bytes: csv("a,b") })).toThrowError(/\.csv ou \.xlsx/);
  });

  it("exige cabeçalhos e limita a quantidade de linhas", () => {
    expect(() => students("nome,email\nAna Lima,a@b.com")).toThrowError(/Cabeçalhos/);
    expect(() => teachers("nome completo,email\nAna Lima,a@b.com")).toThrowError(/matéria/);
    expect(() => students("nome completo,email\n")).toThrowError(/linhas de dados/);
    const many = Array.from({ length: 1_001 }, (_, index) => `Ana Lima,a${index}@b.com`).join("\n");
    expect(() => students(`nome completo,email\n${many}`)).toThrowError(/1000/);
  });
});

describe("linhas de alunos e professores", () => {
  it("aceita o alias email do aluno, ignora colunas extras e normaliza o email", () => {
    const [row] = students("Turma,Nome Completo,E-mail do Aluno\n6A,  Ana   Lima ,ANA@Exemplo.com\n");
    expect(row).toMatchObject({ line: 2, fullName: "Ana Lima", email: "ana@exemplo.com", issues: [] });
    expect(students("nome completo,email do aluno\nAna Lima,a@b.com")[0].issues).toEqual([]);
  });

  it("informa erros por linha sem interromper as demais", () => {
    const rows = students("nome completo,email\nAna Lima,invalido\nAna,ana@b.com\n,x@b.com\nBia Lima,\nCaio Lima,caio@b.com\n");
    expect(rows.map((row) => [row.line, row.issues.map((issue) => issue.code)])).toEqual([
      [2, ["INVALID_EMAIL"]], [3, ["INVALID_NAME"]], [4, ["NAME_REQUIRED"]], [5, ["EMAIL_REQUIRED"]], [6, []],
    ]);
  });

  it("marca duplicatas internas apontando a primeira linha, sem diferenciar maiúsculas", () => {
    const rows = students("nome completo,email\nAna Lima,ana@b.com\nAna Souza,ANA@b.com\n");
    expect(rows[1].issues).toEqual([{ code: "DUPLICATE_IN_FILE", message: "Repete a linha 2 do arquivo." }]);
  });

  it("valida matéria pelo catálogo; o mesmo professor pode ter duas matérias", () => {
    const rows = teachers("nome completo,email,matéria\nAna Lima,a@b.com,Matemática\nAna Lima,a@b.com,PORTUGUÊS\nBia Lima,b@b.com,Física\nAna Lima,a@b.com,matematica\n");
    expect(rows.map((row) => row.subjectId)).toEqual(["matematica", "portugues", undefined, "matematica"]);
    expect(rows.map((row) => row.issues.map((issue) => issue.code))).toEqual([[], [], ["INVALID_SUBJECT"], ["DUPLICATE_IN_FILE"]]);
  });

  it("recusa conteúdo que uma planilha interpretaria como fórmula", () => {
    const rows = students("nome completo,email\n=HYPERLINK(\"http://x\"),a@b.com\nAna Lima,@SUM(1)\n");
    expect(rows.every((row) => row.issues.some((issue) => issue.code === "FORMULA_CELL"))).toBe(true);
  });

  it("os modelos publicados passam pelo próprio importador", () => {
    expect(students(TEMPLATES.students.content)[0].issues).toEqual([]);
    expect(teachers(TEMPLATES.teachers.content)[0].issues).toEqual([]);
  });
});

describe("leitura de XLSX", () => {
  const header = `<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row>`;
  const strings = ["nome completo", "email do aluno", "Ana &amp; Lima"];

  it("lê strings compartilhadas e inline, só da primeira aba, com linhas reais e colunas esparsas", () => {
    const sheet = `${header}<row r="5"><c r="B5" t="inlineStr"><is><t>b@c.com</t></is></c><c r="A5" t="s"><v>2</v></c></row><row r="6"><c r="C6"><v>7</v></c></row>`;
    expect(parseXlsx(workbook(sheet, strings))).toEqual([
      { line: 1, cells: ["nome completo", "email do aluno"] },
      { line: 5, cells: ["Ana & Lima", "b@c.com"] },
      { line: 6, cells: ["", "", "7"] },
    ]);
  });

  it("integra ao importador por extensão e cabeçalho", () => {
    const sheet = `<row r="1"><c r="A1" t="inlineStr"><is><t>Nome Completo</t></is></c><c r="B1" t="inlineStr"><is><t>Email</t></is></c></row><row r="2"><c r="A2" t="inlineStr"><is><t>Ana Lima</t></is></c><c r="B2" t="inlineStr"><is><t>a@b.com</t></is></c></row>`;
    const rows = parseImportRows("students", readSpreadsheet({ name: "alunos.XLSX", bytes: workbook(sheet) }));
    expect(rows).toEqual([{ line: 2, fullName: "Ana Lima", email: "a@b.com", issues: [] }]);
  });

  it("não usa o resultado em cache de uma fórmula", () => {
    const sheet = `${header}<row r="2"><c r="A2" t="str"><f>CONCAT("Ana"," Lima")</f><v>Ana Lima</v></c><c r="B2" t="inlineStr"><is><t>a@b.com</t></is></c></row>`;
    const rows = parseImportRows("students", parseXlsx(workbook(sheet, strings)));
    expect(rows[0].issues.map((issue) => issue.code)).toContain("FORMULA_CELL");
    expect(rows[0].fullName).toBe("=");
  });

  it("recusa macros, DOCTYPE, ZIP corrompido e pacote que não é planilha", () => {
    expect(() => parseXlsx(workbook("", [], { "xl/vbaProject.bin": "x" }))).toThrowError(/macros/);
    const doctype = workbook("", [], { "xl/sharedStrings.xml": "<!DOCTYPE x [<!ENTITY a \"b\">]><sst/>" });
    expect(() => parseXlsx(doctype)).toThrowError(/declaração/);
    expect(() => parseXlsx(Buffer.from("PK nada"))).toThrowError(/corrompido/);
    expect(() => parseXlsx(zip({ "outro.txt": "x" }))).toThrowError(/não é uma planilha/);
  });

  it("limita a descompressão de uma bomba ZIP pelo tamanho real", () => {
    const bomb = workbook("", [], { "xl/sharedStrings.xml": "a".repeat(17 * 1024 * 1024) });
    expect(bomb.length).toBeLessThan(MAX_FILE_BYTES);
    expect(() => parseXlsx(bomb)).toThrowError(/grande demais/);
  });

  it("aceita entradas sem compressão", () => {
    const stored = zip({
      "xl/workbook.xml": `<workbook><sheets><sheet r:id="rId1"/></sheets></workbook>`,
      "xl/_rels/workbook.xml.rels": `<Relationships><Relationship Id="rId1" Target="/xl/s.xml"/></Relationships>`,
      "xl/s.xml": `<sheetData><row><c><v>1</v></c></row></sheetData>`,
    }, true);
    expect(parseXlsx(stored)).toEqual([{ line: 1, cells: ["1"] }]);
  });
});
