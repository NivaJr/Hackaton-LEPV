import { describe, expect, it } from "vitest";
import { ContentError } from "@/features/content/model";
import { bytesToBase64, inspectUpload, MAX_UPLOAD_BYTES } from "@/features/content/upload";

const pdf = new TextEncoder().encode("%PDF-1.7\n1 0 obj\n");
const zip = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00]);
const ole = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0x00]);

function failure(input: Parameters<typeof inspectUpload>[0]) {
  try {
    inspectUpload(input);
  } catch (error) {
    expect(error).toBeInstanceOf(ContentError);
    return error as ContentError;
  }
  throw new Error("expected inspectUpload to fail");
}

describe("inspectUpload", () => {
  it("accepts a PDF by its magic bytes", () => {
    expect(inspectUpload({ fileName: "lista.pdf", mimeType: "application/pdf", bytes: pdf })).toEqual({ kind: "pdf", fileName: "lista.pdf", size: pdf.length });
    expect(inspectUpload({ fileName: "sem-extensao", mimeType: "", bytes: pdf }).kind).toBe("pdf");
  });

  it("rejects a renamed file that is not a PDF", () => {
    const error = failure({ fileName: "lista.pdf", mimeType: "application/pdf", bytes: new TextEncoder().encode("<html>oi</html>") });
    expect([error.code, error.status]).toEqual(["INVALID_PDF", 415]);
  });

  it("accepts .docx by ZIP signature plus name or MIME", () => {
    expect(inspectUpload({ fileName: "lista.docx", mimeType: "", bytes: zip })).toEqual({ kind: "docx", fileName: "lista.docx", size: zip.length });
    expect(inspectUpload({ fileName: "lista", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", bytes: zip }).kind).toBe("docx");
    expect(failure({ fileName: "fotos.zip", mimeType: "application/zip", bytes: zip }).code).toBe("UNSUPPORTED_FILE");
  });

  it("asks to save old .doc files again as .docx", () => {
    const doc = failure({ fileName: "antiga.doc", mimeType: "application/msword", bytes: ole });
    const disguised = failure({ fileName: "lista.bin", mimeType: "", bytes: ole });
    for (const error of [doc, disguised]) {
      expect(error.status).toBe(415);
      expect(error.code).toBe("WORD_NOT_SUPPORTED");
      expect(error.message).toMatch(/\.docx/);
    }
  });

  it("rejects files above 10 MB with 413 and empty files with 422", () => {
    const big = new Uint8Array(MAX_UPLOAD_BYTES + 1);
    big.set(pdf);
    expect(failure({ fileName: "grande.pdf", mimeType: "application/pdf", bytes: big }).status).toBe(413);
    expect(failure({ fileName: "vazio.pdf", mimeType: "application/pdf", bytes: new Uint8Array() }).status).toBe(422);
  });

  it("rejects other types", () => {
    const error = failure({ fileName: "foto.png", mimeType: "image/png", bytes: new Uint8Array([0x89, 0x50, 0x4e, 0x47]) });
    expect([error.code, error.status]).toEqual(["UNSUPPORTED_FILE", 415]);
  });

  it("encodes base64", () => {
    expect(bytesToBase64(new TextEncoder().encode("%PDF-"))).toBe("JVBERi0=");
  });
});
