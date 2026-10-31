import { describe, expect, it } from "vitest";
import { safeInternalPath } from "../src/lib/auth/navigation";

describe("authentication redirects", () => {
  it("keeps allowed internal destinations", () => {
    expect(safeInternalPath("/aluno?tab=perfil")).toBe("/aluno?tab=perfil");
    expect(safeInternalPath("/primeiro-acesso")).toBe("/primeiro-acesso");
  });
  it.each(["https://example.com", "//example.com", "/\\example.com", "/auth/callback", "javascript:alert(1)"])("rejects %s", (value) => {
    expect(safeInternalPath(value, "/aluno")).toBe("/aluno");
  });
});
