import mammoth from "mammoth";
import { ContentError, MAX_PASTED_TEXT_LENGTH } from "./model";

export type DocxTextReader = (bytes: Uint8Array) => Promise<string>;

/** Server only. The extracted text follows the same path as pasted text. */
export const readDocxText: DocxTextReader = async (bytes) => {
  let text: string;
  try {
    ({ value: text } = await mammoth.extractRawText({ buffer: Buffer.from(bytes) }));
  } catch {
    throw new ContentError("DOCX_UNREADABLE", "Não deu para abrir este Word. Salve de novo como .docx ou exporte em PDF.", 422);
  }
  const trimmed = text.replace(/\n{3,}/g, "\n\n").trim();
  if (!trimmed) throw new ContentError("DOCX_EMPTY", "O Word não tem texto. Se as questões estão em imagem, cole o texto ou envie um PDF.", 422);
  if (trimmed.length > MAX_PASTED_TEXT_LENGTH) {
    throw new ContentError("DOCX_TOO_LONG", "O Word tem texto demais para uma importação. Divida a lista em partes menores.", 413);
  }
  return trimmed;
};
