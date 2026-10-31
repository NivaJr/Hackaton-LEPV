import { describe, expect, it } from "vitest";
import { readDocxText } from "@/features/content/docx";
import { ContentError, MAX_PASTED_TEXT_LENGTH } from "@/features/content/model";
import { docx } from "./helpers/docx";
import { zip } from "./helpers/xlsx";

async function failure(bytes: Uint8Array) {
  const error = await readDocxText(bytes).then(() => null, (reason: unknown) => reason);
  expect(error).toBeInstanceOf(ContentError);
  return error as ContentError;
}

describe("readDocxText", () => {
  it("extracts the text of a Word list with accents", async () => {
    const text = await readDocxText(docx(["1) Quanto é −3 + 8?", "a) 5", "b) −11", "Gabarito: a"]));
    expect(text).toContain("1) Quanto é −3 + 8?");
    expect(text).toContain("Gabarito: a");
  });

  it("answers 422 for a ZIP that is not Word and for a document without text", async () => {
    const notWord = await failure(new Uint8Array(zip({ "foto.txt": "oi" })));
    expect([notWord.code, notWord.status]).toEqual(["DOCX_UNREADABLE", 422]);
    const empty = await failure(docx(["   "]));
    expect([empty.code, empty.status]).toEqual(["DOCX_EMPTY", 422]);
  });

  it("answers 413 when the text is longer than a pasted list", async () => {
    const error = await failure(docx(["x".repeat(MAX_PASTED_TEXT_LENGTH + 1)]));
    expect([error.code, error.status]).toEqual(["DOCX_TOO_LONG", 413]);
  });
});
