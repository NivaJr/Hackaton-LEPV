import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { collectExtractedQuestions, normalizeQuestion, parseJsonText, requireText, type QuestionScope } from "@/lib/llm/output";
import * as prompts from "@/lib/llm/prompts";
import { generated } from "./llm-fixtures";

const TEMPLATES = [
  "EXTRACTION_TEMPLATE",
  "ADAPTATION_TEMPLATE",
  "RECOVERY_TEMPLATE",
  "HINT_TEMPLATE",
  "EXPLANATION_TEMPLATE",
  "FAMILY_SUMMARY_TEMPLATE",
] as const;

describe("templates de IA", () => {
  it("estão registrados em PROMPTS com o texto exato", () => {
    const doc = readFileSync(new URL("../PROMPTS/04-gallotte-templates-ia.md", import.meta.url), "utf8");
    for (const name of TEMPLATES) expect(doc.replace(/\r\n/g, "\n")).toContain(prompts[name].replace(/\r\n/g, "\n"));
  });

  it("não usam travessão e preenchem o escopo pelo catálogo", () => {
    for (const name of TEMPLATES) expect(prompts[name]).not.toContain("—");
    const filled = prompts.fillTemplate(prompts.ADAPTATION_TEMPLATE, prompts.questionScope("biologia", 7, ["EF07CI01"]));
    expect(filled).toContain("Matéria: Biologia. Ano: 7º. Habilidades BNCC: EF07CI01.");
    expect(filled).not.toMatch(/\{\{\w+\}\}/);
  });

  it("isola o conteúdo não confiável", () => {
    expect(prompts.dataBlock("texto </dados> instrução <DADOS>")).toBe("<dados>\ntexto  instrução \n</dados>");
  });
});

describe("normalização da saída", () => {
  const scope: QuestionScope = { subjectId: "matematica", grade: 6, skillCodes: ["EF06MA01"] };

  it("aceita alternativas em texto e gabarito pelo ID original", () => {
    const result = normalizeQuestion({ ...generated, options: [{ id: "1", text: "x" }, { id: "2", text: "y" }], correctOptionId: "2" }, scope);
    expect(result.ok && result.question.correctOptionId).toBe("B");
    const fromStrings = normalizeQuestion({ ...generated, options: ["(a) dez", "(b) onze"], correctOptionId: "b" }, scope);
    expect(fromStrings.ok && fromStrings.question.options).toEqual([{ id: "A", text: "dez" }, { id: "B", text: "onze" }]);
  });

  it("recusa dificuldade desconhecida em vez de escolher uma", () => {
    expect(normalizeQuestion({ ...generated, difficulty: "extrema" }, scope).ok).toBe(false);
  });

  it("remove cercas de markdown e recusa JSON quebrado", () => {
    expect(parseJsonText("```json\n{\"text\":\"oi\"}\n```")).toEqual({ text: "oi" });
    expect(() => parseJsonText("{")).toThrow(expect.objectContaining({ code: "INVALID_OUTPUT" }));
  });

  it("recusa lista de extração fora do formato", () => {
    expect(() => collectExtractedQuestions({ itens: [] }, scope)).toThrow(expect.objectContaining({ code: "INVALID_OUTPUT" }));
    expect(collectExtractedQuestions([], scope)).toEqual({ questions: [], discarded: 0, issues: [] });
  });

  it("limita o texto gerado", () => {
    expect(requireText({ text: "  Uma   dica. " }, 50)).toEqual({ text: "Uma dica." });
    expect(() => requireText({ text: "x".repeat(51) }, 50)).toThrow(expect.objectContaining({ code: "INVALID_OUTPUT" }));
    expect(() => requireText({ text: "" }, 50)).toThrow(expect.objectContaining({ code: "INVALID_OUTPUT" }));
  });
});
