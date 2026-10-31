import { describe, expect, it } from "vitest";
import { safeInternalPath } from "../src/lib/auth/navigation";
import { navItems } from "../src/components/nav-items";
import { RoleSchema } from "../src/contracts";

const ROLES = RoleSchema.options;

describe("authentication redirects", () => {
  it("keeps allowed internal destinations", () => {
    expect(safeInternalPath("/aluno?tab=perfil")).toBe("/aluno?tab=perfil");
    expect(safeInternalPath("/primeiro-acesso")).toBe("/primeiro-acesso");
  });
  it.each(["https://example.com", "//example.com", "/\\example.com", "/auth/callback", "javascript:alert(1)"])("rejects %s", (value) => {
    expect(safeInternalPath(value, "/aluno")).toBe("/aluno");
  });
});

describe("sidebar links", () => {
  it.each(ROLES)("does not send %s to the placeholder page", (role) => {
    const hrefs = navItems(role, "real", `/${role}`).map((item) => item.href);
    expect(hrefs[0]).toBe(`/${role}`);
    expect(hrefs.some((href) => href.startsWith("/tarefas"))).toBe(false);
  });
  it("links the role sections", () => {
    expect(navItems("professor", "real", "/professor").map((item) => item.href)).toEqual(["/professor", "/professor#questoes", "/professor/reconhecer"]);
    expect(navItems("coordenador", "real", "/coordenador").map((item) => item.href)).toContain("/coordenador#ativacao");
    expect(navItems("responsavel", "real", "/responsavel").map((item) => item.href)).toContain("/responsavel#elogios");
  });
});
