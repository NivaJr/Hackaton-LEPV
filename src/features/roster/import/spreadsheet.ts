import { inflateRawSync } from "node:zlib";
import { RosterError } from "../model";

export interface SheetRow { line: number; cells: string[]; }

export const MAX_FILE_BYTES = 2 * 1024 * 1024;
const MAX_ZIP_ENTRIES = 256;
const MAX_ENTRY_BYTES = 16 * 1024 * 1024;

function invalidFile(message: string) {
  return new RosterError("INVALID_FILE", message, 422);
}

function decodeText(bytes: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    // Excel "CSV" in pt-BR commonly saves Windows-1252 rather than UTF-8.
    return new TextDecoder("windows-1252").decode(bytes);
  }
}

export function parseCsv(content: string): SheetRow[] {
  const source = content.replace(/^﻿/, "");
  const firstLine = source.split(/\r?\n/, 1)[0] ?? "";
  const delimiter = firstLine.split(";").length > firstLine.split(",").length ? ";" : ",";
  const rows: SheetRow[] = [];
  let cells: string[] = [];
  let cell = "";
  let quoted = false;
  let line = 1;
  let rowLine = 1;
  const endRow = () => {
    cells.push(cell);
    if (cells.some((value) => value.trim())) rows.push({ line: rowLine, cells });
    cells = [];
    cell = "";
  };
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (quoted) {
      if (char === "\"" && source[index + 1] === "\"") { cell += "\""; index += 1; }
      else if (char === "\"") quoted = false;
      else { if (char === "\n") line += 1; cell += char; }
    } else if (char === "\"" && !cell) quoted = true;
    else if (char === delimiter) { cells.push(cell); cell = ""; }
    else if (char === "\n") { endRow(); line += 1; rowLine = line; }
    else if (char !== "\r") cell += char;
  }
  if (quoted) throw invalidFile("O arquivo CSV tem aspas sem fechamento.");
  endRow();
  return rows;
}

function readZipEntries(bytes: Uint8Array): Map<string, () => Buffer> {
  const zip = Buffer.from(bytes);
  let end = zip.length - 22;
  while (end >= 0 && zip.readUInt32LE(end) !== 0x06054b50) end -= 1;
  if (end < 0) throw invalidFile("O arquivo XLSX está corrompido.");
  const count = zip.readUInt16LE(end + 10);
  if (count > MAX_ZIP_ENTRIES) throw invalidFile("O arquivo XLSX tem partes internas demais.");
  let cursor = zip.readUInt32LE(end + 16);
  const entries = new Map<string, () => Buffer>();
  for (let index = 0; index < count; index += 1) {
    if (cursor + 46 > zip.length || zip.readUInt32LE(cursor) !== 0x02014b50) throw invalidFile("O arquivo XLSX está corrompido.");
    const method = zip.readUInt16LE(cursor + 10);
    const compressedSize = zip.readUInt32LE(cursor + 20);
    const nameLength = zip.readUInt16LE(cursor + 28);
    const extraLength = zip.readUInt16LE(cursor + 30);
    const commentLength = zip.readUInt16LE(cursor + 32);
    const localHeader = zip.readUInt32LE(cursor + 42);
    const name = zip.toString("utf8", cursor + 46, cursor + 46 + nameLength);
    entries.set(name, () => {
      if (localHeader + 30 > zip.length || zip.readUInt32LE(localHeader) !== 0x04034b50) throw invalidFile("O arquivo XLSX está corrompido.");
      const start = localHeader + 30 + zip.readUInt16LE(localHeader + 26) + zip.readUInt16LE(localHeader + 28);
      const data = zip.subarray(start, start + compressedSize);
      if (method === 0) return data;
      if (method !== 8) throw invalidFile("O arquivo XLSX usa compressão não suportada.");
      try {
        // maxOutputLength bounds decompression bombs regardless of the size declared in the file.
        return inflateRawSync(data, { maxOutputLength: MAX_ENTRY_BYTES });
      } catch {
        throw invalidFile("O arquivo XLSX está corrompido ou é grande demais.");
      }
    });
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

function decodeXml(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (entity, body: string) => {
    if (body[0] !== "#") return ({ amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'" } as Record<string, string>)[body.toLowerCase()] ?? entity;
    const code = body[1].toLowerCase() === "x" ? Number.parseInt(body.slice(2), 16) : Number.parseInt(body.slice(1), 10);
    return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : "";
  });
}

function textRuns(xml: string): string {
  return [...xml.replace(/<rPh\b[\s\S]*?<\/rPh>/g, "").matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((match) => decodeXml(match[1])).join("");
}

function attribute(tag: string, name: string): string | undefined {
  return new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1];
}

function columnIndex(reference: string | undefined, fallback: number): number {
  const letters = reference && /^[A-Z]+/i.exec(reference)?.[0].toUpperCase();
  if (!letters) return fallback;
  return [...letters].reduce((total, letter) => total * 26 + letter.charCodeAt(0) - 64, 0) - 1;
}

/**
 * Reads values from the first worksheet only. Formulas are never evaluated and their cached
 * results are discarded: the cell becomes "=", which row validation reports as a formula.
 */
export function parseXlsx(bytes: Uint8Array): SheetRow[] {
  const entries = readZipEntries(bytes);
  if ([...entries.keys()].some((name) => /vbaproject\.bin$/i.test(name))) {
    throw invalidFile("Arquivos com macros não são aceitos.");
  }
  const read = (name: string) => {
    const xml = entries.get(name)?.().toString("utf8");
    if (xml?.includes("<!DOCTYPE")) throw invalidFile("O arquivo XLSX contém uma declaração não permitida.");
    return xml;
  };
  const workbook = read("xl/workbook.xml");
  const relations = read("xl/_rels/workbook.xml.rels");
  if (!workbook || !relations) throw invalidFile("O arquivo não é uma planilha XLSX válida.");
  const sheetTag = /<sheet\b[^>]*>/.exec(workbook)?.[0];
  const relationId = sheetTag && attribute(sheetTag, "r:id");
  const relation = [...relations.matchAll(/<Relationship\b[^>]*>/g)].map((match) => match[0])
    .find((tag) => attribute(tag, "Id") === relationId);
  const target = relation && attribute(relation, "Target");
  if (!target) throw invalidFile("A planilha não tem uma aba legível.");
  const sheet = read(target.startsWith("/") ? target.slice(1) : `xl/${target.replace(/^\.\//, "")}`);
  if (!sheet) throw invalidFile("A planilha não tem uma aba legível.");
  const shared = [...(read("xl/sharedStrings.xml") ?? "").matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)].map((match) => textRuns(match[1]));
  const rows: SheetRow[] = [];
  let position = 0;
  for (const rowMatch of sheet.matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    position += 1;
    const line = Number(attribute(rowMatch[1], "r")) || position;
    const cells: string[] = [];
    let next = 0;
    for (const cellMatch of (rowMatch[2] ?? "").matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const column = columnIndex(attribute(cellMatch[1], "r"), next);
      next = column + 1;
      if (column >= 64) continue;
      const body = cellMatch[2] ?? "";
      const type = attribute(cellMatch[1], "t");
      const value = decodeXml(/<v\b[^>]*>([\s\S]*?)<\/v>/.exec(body)?.[1] ?? "");
      while (cells.length < column) cells.push("");
      if (/<f\b/.test(body)) cells[column] = "=";
      else if (type === "s") cells[column] = shared[Number(value)] ?? "";
      else if (type === "inlineStr") cells[column] = textRuns(body);
      else cells[column] = value;
    }
    if (cells.some((value) => value.trim())) rows.push({ line, cells });
  }
  return rows;
}

export function readSpreadsheet(file: { name: string; bytes: Uint8Array }): SheetRow[] {
  if (file.bytes.length === 0) throw invalidFile("O arquivo está vazio.");
  if (file.bytes.length > MAX_FILE_BYTES) throw new RosterError("FILE_TOO_LARGE", "O arquivo excede o limite de 2 MB.", 413);
  const extension = /\.([^.]+)$/.exec(file.name)?.[1]?.toLowerCase();
  const isZip = file.bytes[0] === 0x50 && file.bytes[1] === 0x4b;
  if (extension === "xlsx" && isZip) return parseXlsx(file.bytes);
  if (extension === "csv" && !isZip) return parseCsv(decodeText(file.bytes));
  throw invalidFile("Envie um arquivo .csv ou .xlsx.");
}
