import { describe, expect, it } from "vitest";
import {
  DEFAULT_ACCESSIBILITY_PREFERENCES,
  deriveAccessibilityNeedsFromSupport,
  hasAccessibilityNeeds,
  normalizeAccessibilityPreferences,
  withAccessibilityNeed,
} from "@/features/learning/ui/accessibility-preferences";

describe("preferências de acessibilidade do aluno", () => {
  it("mantém a interface normal quando nenhum apoio foi configurado", () => {
    expect(hasAccessibilityNeeds(DEFAULT_ACCESSIBILITY_PREFERENCES)).toBe(false);
    expect(DEFAULT_ACCESSIBILITY_PREFERENCES.interfaceMode).toBe("standard");
  });

  it("ativa a interface acessível ao registrar a primeira necessidade", () => {
    const configured = withAccessibilityNeed(DEFAULT_ACCESSIBILITY_PREFERENCES, "reading", true);
    expect(configured.needs.reading).toBe(true);
    expect(configured.interfaceMode).toBe("accessible");
  });

  it("preserva a escolha explícita de usar a interface normal", () => {
    const normal = { ...withAccessibilityNeed(DEFAULT_ACCESSIBILITY_PREFERENCES, "focus", true), interfaceMode: "standard" as const };
    const configured = withAccessibilityNeed(normal, "predictability", true);
    expect(configured.interfaceMode).toBe("standard");
    expect(configured.needs).toEqual({ reading: false, focus: true, predictability: true });
  });

  it("descarta campos desconhecidos e valores inválidos do armazenamento", () => {
    expect(normalizeAccessibilityPreferences({
      version: 999,
      needs: { reading: true, focus: "sim", predictability: false, diagnosis: "não deve persistir" },
      interfaceMode: "automático",
      studentName: "não deve persistir",
    })).toEqual({
      version: 1,
      needs: { reading: true, focus: false, predictability: false },
      interfaceMode: "accessible",
    });
  });

  it("converte o apoio da ficha em necessidades funcionais sem expor o texto", () => {
    expect(deriveAccessibilityNeedsFromSupport("Estudante com TEA e dislexia; precisa de apoio de foco por TDAH."))
      .toEqual(["reading", "focus", "predictability"]);
  });

  it("usa o perfil acessível completo para um apoio não categorizado", () => {
    expect(deriveAccessibilityNeedsFromSupport("Necessita de acompanhamento individual."))
      .toEqual(["reading", "focus", "predictability"]);
    expect(deriveAccessibilityNeedsFromSupport("  ")).toEqual([]);
  });
});
