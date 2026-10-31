import { ContentError } from "./model";

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const PDF_MIME_TYPE = "application/pdf";

const LEGACY_WORD_MESSAGE = "Arquivos .doc (Word 97-2003) não são lidos. Abra no Word, salve como .docx ou PDF e envie de novo.";
const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const DOC_MIME = "application/msword";

function startsWith(bytes: Uint8Array, signature: number[]) {
  return bytes.length >= signature.length && signature.every((value, index) => bytes[index] === value);
}

const PDF_SIGNATURE = [0x25, 0x50, 0x44, 0x46, 0x2d]; // %PDF-
const ZIP_SIGNATURE = [0x50, 0x4b, 0x03, 0x04];
const OLE_SIGNATURE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];

export type InspectedUpload = { kind: "pdf" | "docx"; fileName: string; size: number };

/** Decides by content. Extension and declared MIME only pick the error message. */
export function inspectUpload(input: { fileName: string; mimeType: string; bytes: Uint8Array }): InspectedUpload {
  const fileName = input.fileName.trim().slice(0, 255) || "arquivo.pdf";
  const lowerName = fileName.toLocaleLowerCase("pt-BR");
  const mimeType = input.mimeType.toLowerCase();
  const { bytes } = input;
  if (bytes.byteLength > MAX_UPLOAD_BYTES) {
    throw new ContentError("FILE_TOO_LARGE", "O arquivo passa de 10 MB. Divida a lista ou cole o texto.", 413);
  }
  if (bytes.byteLength === 0) throw new ContentError("EMPTY_FILE", "O arquivo está vazio.", 422);
  const looksLikeWord = lowerName.endsWith(".docx") || lowerName.endsWith(".doc") || mimeType === DOCX_MIME || mimeType === DOC_MIME;
  if (startsWith(bytes, PDF_SIGNATURE)) {
    if (looksLikeWord) throw new ContentError("FILE_TYPE_MISMATCH", "O nome indica Word, mas o conteúdo é PDF. Renomeie o arquivo para .pdf e envie de novo.", 415);
    return { kind: "pdf", fileName, size: bytes.byteLength };
  }
  // .docx is a ZIP; the name or MIME tells it apart from other ZIPs. mammoth rejects a ZIP that is not Word.
  if (startsWith(bytes, ZIP_SIGNATURE) && (lowerName.endsWith(".docx") || mimeType === DOCX_MIME)) {
    return { kind: "docx", fileName, size: bytes.byteLength };
  }
  if (looksLikeWord || startsWith(bytes, OLE_SIGNATURE)) {
    throw new ContentError("WORD_NOT_SUPPORTED", LEGACY_WORD_MESSAGE, 415);
  }
  if (lowerName.endsWith(".pdf") || mimeType === PDF_MIME_TYPE) {
    throw new ContentError("INVALID_PDF", "O arquivo tem extensão .pdf, mas o conteúdo não é um PDF válido.", 415);
  }
  throw new ContentError("UNSUPPORTED_FILE", "Envie um PDF com texto selecionável, um Word .docx ou cole o texto das questões.", 415);
}

export function bytesToBase64(bytes: Uint8Array): string {
  const NodeBuffer = (globalThis as { Buffer?: { from(data: Uint8Array): { toString(encoding: "base64"): string } } }).Buffer;
  if (NodeBuffer) return NodeBuffer.from(bytes).toString("base64");
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary);
}
