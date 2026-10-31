export type AccessibilityNeed = "reading" | "focus" | "predictability";
export type StudentInterfaceMode = "accessible" | "standard";

export interface StudentAccessibilityPreferences {
  version: 1;
  needs: Record<AccessibilityNeed, boolean>;
  interfaceMode: StudentInterfaceMode;
}

export const DEFAULT_ACCESSIBILITY_PREFERENCES: StudentAccessibilityPreferences = {
  version: 1,
  needs: { reading: false, focus: false, predictability: false },
  interfaceMode: "standard",
};

const NEEDS: AccessibilityNeed[] = ["reading", "focus", "predictability"];
const STORAGE_PREFIX = "lepv:student-accessibility:v1";

export const ACCESSIBLE_INTERFACE_PRESET: StudentAccessibilityPreferences = {
  version: 1,
  needs: { reading: true, focus: true, predictability: true },
  interfaceMode: "accessible",
};

export function hasAccessibilityNeeds(preferences: StudentAccessibilityPreferences) {
  return NEEDS.some((need) => preferences.needs[need]);
}

export function normalizeAccessibilityPreferences(value: unknown): StudentAccessibilityPreferences {
  if (!value || typeof value !== "object") return structuredClone(DEFAULT_ACCESSIBILITY_PREFERENCES);
  const candidate = value as Partial<StudentAccessibilityPreferences>;
  const rawNeeds = candidate.needs && typeof candidate.needs === "object" ? candidate.needs : {};
  const needs = Object.fromEntries(NEEDS.map((need) => [need, (rawNeeds as Record<string, unknown>)[need] === true])) as Record<AccessibilityNeed, boolean>;
  const hasNeeds = NEEDS.some((need) => needs[need]);
  const interfaceMode = candidate.interfaceMode === "standard" || candidate.interfaceMode === "accessible"
    ? candidate.interfaceMode
    : hasNeeds ? "accessible" : "standard";
  return { version: 1, needs, interfaceMode };
}

export function withAccessibilityNeed(
  preferences: StudentAccessibilityPreferences,
  need: AccessibilityNeed,
  enabled: boolean,
) {
  const needs = { ...preferences.needs, [need]: enabled };
  const hadNoNeeds = !hasAccessibilityNeeds(preferences);
  return {
    ...preferences,
    needs,
    interfaceMode: hadNoNeeds && enabled ? "accessible" as const : preferences.interfaceMode,
  };
}

export function deriveAccessibilityNeedsFromSupport(details: string): AccessibilityNeed[] {
  const normalized = details.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  if (!normalized) return [];
  const needs = new Set<AccessibilityNeed>();
  if (/dislex|leitura|alfabet|texto|fonte/.test(normalized)) needs.add("reading");
  if (/tdah|atenc|foco|concentr|distr/.test(normalized)) needs.add("focus");
  if (/(^|\W)tea(\W|$)|autis|sensor|previs|rotina/.test(normalized)) needs.add("predictability");
  return needs.size ? [...needs] : [...NEEDS];
}

function preferencesFromRegisteredNeeds(registeredNeeds: AccessibilityNeed[]) {
  const needs = Object.fromEntries(NEEDS.map((need) => [need, registeredNeeds.includes(need)])) as Record<AccessibilityNeed, boolean>;
  return { version: 1 as const, needs, interfaceMode: registeredNeeds.length ? "accessible" as const : "standard" as const };
}

function storageKey(studentId: string) {
  return `${STORAGE_PREFIX}:${studentId}`;
}

export function loadAccessibilityPreferences(studentId: string, registeredNeeds: AccessibilityNeed[] = []): StudentAccessibilityPreferences {
  const registered = preferencesFromRegisteredNeeds(registeredNeeds);
  if (typeof window === "undefined") return registered;
  try {
    const stored = window.localStorage.getItem(storageKey(studentId));
    if (!stored) return registered;
    const saved = normalizeAccessibilityPreferences(JSON.parse(stored));
    const savedHadNeeds = hasAccessibilityNeeds(saved);
    const needs = Object.fromEntries(NEEDS.map((need) => [need, saved.needs[need] || registered.needs[need]])) as Record<AccessibilityNeed, boolean>;
    return { ...saved, needs, interfaceMode: !savedHadNeeds && registeredNeeds.length ? "accessible" : saved.interfaceMode };
  } catch {
    return registered;
  }
}

export function saveAccessibilityPreferences(studentId: string, preferences: StudentAccessibilityPreferences) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(storageKey(studentId), JSON.stringify(normalizeAccessibilityPreferences(preferences)));
}
