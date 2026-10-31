import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseAccountDirectory } from "@/features/roster/server/supabase-directory";

const USER = "11111111-1111-4111-8111-111111111111";
const APP = "https://escola.example";

let authUser: { id: string; email: string; app_metadata: Record<string, unknown>; last_sign_in_at?: string };
const generateLink = vi.fn();
const updateUserById = vi.fn();
const inviteUserByEmail = vi.fn();
const getUserById = vi.fn();

function directory(appUrl: string | undefined = APP) {
  const admin = {
    auth: { admin: { generateLink, updateUserById, inviteUserByEmail, getUserById } },
    from: () => ({ upsert: async () => ({ error: null }) }),
  };
  return createSupabaseAccountDirectory(admin as unknown as SupabaseClient, appUrl);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  authUser = { id: USER, email: "pessoa@b.com", app_metadata: { access_pending: true } };
  updateUserById.mockResolvedValue({ error: null });
  getUserById.mockImplementation(async () => ({ data: { user: authUser }, error: null }));
  generateLink.mockResolvedValue({ data: { user: authUser, properties: { hashed_token: "abc123" } }, error: null });
});

describe("provisionamento por link", () => {
  it("busca somente os emails pedidos pela RPC sem paginar todas as contas Auth", async () => {
    const rpc = vi.fn(async () => ({ data: [{ email: "pessoa@b.com", userId: USER }], error: null }));
    const listUsers = vi.fn(() => { throw new Error("Não enumerar Auth"); });
    const admin = {
      rpc, auth: { admin: { listUsers } },
      from: (table: string) => ({ select: () => ({ in: async () => ({ data: table === "profiles"
        ? [{ id: USER, school_id: "school", full_name: "Pessoa Teste" }]
        : [{ user_id: USER, role: "aluno" }], error: null }) }) }),
    };
    const accounts = await createSupabaseAccountDirectory(admin as unknown as SupabaseClient, APP).findByEmails([" PESSOA@B.COM ", "missing@b.com"]);
    expect(accounts.get("pessoa@b.com")).toMatchObject({ userId: USER, schoolId: "school", roles: ["aluno"] });
    expect(accounts.has("missing@b.com")).toBe(false);
    expect(listUsers).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledWith("accounts_by_emails", { p_emails: ["pessoa@b.com", "missing@b.com"] });
  });

  it("cria a conta sem enviar email e aponta para a página de confirmação", async () => {
    const result = await directory().ensureAccount({ email: "pessoa@b.com", fullName: "Pessoa Teste", role: "aluno", schoolId: "escola" });
    expect(result).toEqual({ userId: USER, accessLink: `${APP}/convite?token_hash=abc123&type=invite` });
    expect(generateLink).toHaveBeenCalledWith({ type: "invite", email: "pessoa@b.com" });
    expect(inviteUserByEmail).not.toHaveBeenCalled();
    expect(updateUserById).toHaveBeenCalledWith(USER, { app_metadata: { access_pending: true } });
  });

  it("gera novo link para conta pendente, mesmo depois de abrir o primeiro", async () => {
    authUser.last_sign_in_at = "2026-10-31T10:00:00Z";
    expect(await directory().issueAccessLink(USER)).toBe(`${APP}/convite?token_hash=abc123&type=recovery`);
  });

  it("gera novo link para conta que nunca entrou", async () => {
    authUser.app_metadata = {};
    expect(await directory().issueAccessLink(USER)).toContain("type=recovery");
  });

  it("nunca gera link para conta ativada", async () => {
    authUser.app_metadata = { access_pending: false };
    authUser.last_sign_in_at = "2026-10-31T10:00:00Z";
    await expect(directory().issueAccessLink(USER)).rejects.toMatchObject({ code: "ACCOUNT_ALREADY_ACTIVE", status: 409 });
    expect(generateLink).not.toHaveBeenCalled();
  });

  it("pula contas ativadas no lote da turma", async () => {
    const active = { ...authUser, id: "ativo", app_metadata: { access_pending: false }, last_sign_in_at: "2026-10-31T10:00:00Z" };
    getUserById.mockImplementation(async (id: string) => ({ data: { user: id === "ativo" ? active : authUser }, error: null }));
    expect(await directory().issuePendingAccessLinks([USER, "ativo"])).toEqual([
      { userId: USER, email: "pessoa@b.com", accessLink: `${APP}/convite?token_hash=abc123&type=recovery` },
    ]);
  });

  it("explica a falta do endereço da aplicação", async () => {
    await expect(directory("").issueAccessLink(USER)).rejects.toMatchObject({ code: "PROVISIONING_UNAVAILABLE" });
  });

  it("não registra email nem link quando o Supabase falha", async () => {
    generateLink.mockResolvedValue({ data: { user: null, properties: null }, error: { code: "unexpected_failure", status: 500 } });
    await expect(directory().ensureAccount({ email: "pessoa@b.com", fullName: "Pessoa Teste", role: "aluno", schoolId: "escola" })).rejects.toMatchObject({ code: "PROVISIONING_FAILED" });
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain("pessoa@b.com");
  });
});
