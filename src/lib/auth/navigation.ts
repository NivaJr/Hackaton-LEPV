import type { Role } from "@/contracts";

export const ROLE_LABELS: Record<Role, string> = {
  aluno: "Aluno",
  coordenador: "Coordenador",
  professor: "Professor",
  responsavel: "Responsável",
};

export const ROLES: Role[] = ["aluno", "coordenador", "professor", "responsavel"];

export function isRole(value: string): value is Role {
  return ROLES.includes(value as Role);
}

export function roleHome(role: Role): string {
  return `/${role}`;
}

export function safeInternalPath(value: unknown, fallback = "/") {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return fallback;
  const path = value.split(/[?#]/, 1)[0];
  const allowed = ["/", "/primeiro-acesso", ...ROLES.map(roleHome)];
  return allowed.some((prefix) => path === prefix || (prefix !== "/" && path.startsWith(`${prefix}/`))) ? value : fallback;
}
