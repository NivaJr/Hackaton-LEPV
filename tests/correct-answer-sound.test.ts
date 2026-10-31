import { afterEach, describe, expect, it, vi } from "vitest";
import { playCorrectAnswerSound, prepareCorrectAnswerSound } from "@/features/learning/ui/correct-answer-sound";

afterEach(() => vi.unstubAllGlobals());

describe("correct answer sound", () => {
  it("não prepara áudio quando o retorno sonoro está desativado", () => {
    expect(prepareCorrectAnswerSound(false)).toBeNull();
  });

  it("não falha durante renderização sem navegador", () => {
    expect(prepareCorrectAnswerSound(true)).toBeNull();
  });

  it("não bloqueia uma resposta quando o navegador recusa criar áudio", () => {
    vi.stubGlobal("window", { AudioContext: class { constructor() { throw new Error("Audio unavailable"); } } });
    expect(prepareCorrectAnswerSound(true)).toBeNull();
  });

  it("não deixa uma falha do dispositivo de áudio invalidar a confirmação visual", () => {
    const context = { state: "running", createGain() { throw new Error("Output unavailable"); } } as unknown as AudioContext;
    expect(() => playCorrectAnswerSound(context)).not.toThrow();
  });
});
