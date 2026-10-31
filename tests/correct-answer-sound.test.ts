import { describe, expect, it } from "vitest";
import { prepareCorrectAnswerSound } from "@/features/learning/ui/correct-answer-sound";

describe("correct answer sound", () => {
  it("não prepara áudio quando o retorno sonoro está desativado", () => {
    expect(prepareCorrectAnswerSound(false)).toBeNull();
  });

  it("não falha durante renderização sem navegador", () => {
    expect(prepareCorrectAnswerSound(true)).toBeNull();
  });
});
