import type { SupabaseClient } from "@supabase/supabase-js";
import { isRole } from "@/lib/auth/navigation";
import type { Role } from "@/contracts";
import { RosterError, type AccountRecord, type PendingAccessLink } from "../model";
import type { AccountDirectory } from "../ports";

const PAGE_SIZE = 1_000;

function fail(message: string): never {
  throw new RosterError("PROVISIONING_FAILED", message, 502);
}

/** Only the code and status are logged: the email and the link stay out of the logs. */
function reportAuthError(step: string, error: { code?: string; status?: number }) {
  console.error(`Supabase Auth: falha em ${step}`, { code: error.code, status: error.status });
}

/**
 * Privileged adapter. RosterService authorizes the coordinator and school before any call.
 * Emails are found by paging Auth users because profiles has no email column; see the
 * request to Nivaldo in docs/ENTREGA_FABIANO_GESTAO.md.
 *
 * generateLink returns the access link without sending email, so provisioning does not
 * depend on SMTP. The coordinator hands the link over; /convite redeems it on a button click.
 */
export function createSupabaseAccountDirectory(admin: SupabaseClient, appUrl: string | undefined): AccountDirectory {
  async function authIdsByEmail(emails: string[]): Promise<Map<string, string>> {
    const wanted = new Set(emails);
    const found = new Map<string, string>();
    for (let page = 1; found.size < wanted.size; page += 1) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage: PAGE_SIZE });
      if (error) fail("Não foi possível consultar as contas existentes.");
      data.users.forEach((user) => {
        const email = user.email?.toLocaleLowerCase("pt-BR");
        if (email && wanted.has(email)) found.set(email, user.id);
      });
      if (data.users.length < PAGE_SIZE) break;
    }
    return found;
  }

  function accessUrl(tokenHash: string, type: "invite" | "recovery") {
    if (!appUrl) throw new RosterError("PROVISIONING_UNAVAILABLE", "Configure NEXT_PUBLIC_APP_URL para gerar links de cadastro.", 503);
    const url = new URL("/convite", appUrl);
    url.searchParams.set("token_hash", tokenHash);
    url.searchParams.set("type", type);
    return url.toString();
  }

  async function markPending(userId: string) {
    const { error } = await admin.auth.admin.updateUserById(userId, { app_metadata: { access_pending: true } });
    if (error) {
      reportAuthError("marcar conta pendente", error);
      fail("Não foi possível gerar o link de cadastro.");
    }
  }

  /** Null for activated accounts: access_pending is cleared when the password is defined. */
  async function pendingAccess(userId: string): Promise<{ email: string; link: string } | null> {
    const { data, error } = await admin.auth.admin.getUserById(userId);
    if (error || !data.user?.email) {
      if (error) reportAuthError("consultar conta", error);
      fail("Não foi possível consultar a conta.");
    }
    if (data.user.app_metadata.access_pending !== true && data.user.last_sign_in_at) return null;
    await markPending(userId);
    const link = await admin.auth.admin.generateLink({ type: "recovery", email: data.user.email });
    if (link.error) {
      reportAuthError("gerar novo link", link.error);
      fail("Não foi possível gerar o link de cadastro.");
    }
    return { email: data.user.email, link: accessUrl(link.data.properties.hashed_token, "recovery") };
  }

  return {
    async findByEmails(emails) {
      const accounts = new Map<string, AccountRecord>();
      if (!emails.length) return accounts;
      const ids = await authIdsByEmail(emails);
      const userIds = [...ids.values()];
      if (!userIds.length) return accounts;
      const [profiles, roles] = await Promise.all([
        admin.from("profiles").select("id, school_id, full_name").in("id", userIds),
        admin.from("user_roles").select("user_id, role").in("user_id", userIds),
      ]);
      if (profiles.error || roles.error) fail("Não foi possível consultar as contas existentes.");
      const profileRows = (profiles.data ?? []) as { id: string; school_id: string; full_name: string }[];
      const roleRows = (roles.data ?? []) as { user_id: string; role: string }[];
      ids.forEach((userId, email) => {
        const profile = profileRows.find((row) => row.id === userId);
        const userRoles: Role[] = roleRows.filter((row) => row.user_id === userId).map((row) => row.role).filter(isRole);
        accounts.set(email, { userId, schoolId: profile?.school_id ?? null, fullName: profile?.full_name ?? null, roles: userRoles });
      });
      return accounts;
    },

    async ensureAccount({ email, fullName, role, schoolId, userId }) {
      let id = userId;
      let accessLink: string | null = null;
      if (!id) {
        const { data, error } = await admin.auth.admin.generateLink({ type: "invite", email });
        if (error || !data.user) {
          if (error) reportAuthError("gerar link de cadastro", error);
          fail("Não foi possível gerar o link de cadastro.");
        }
        id = data.user.id;
        accessLink = accessUrl(data.properties.hashed_token, "invite");
        await markPending(id);
      }
      const profile = await admin.from("profiles").upsert({ id, school_id: schoolId, full_name: fullName }, { onConflict: "id", ignoreDuplicates: true });
      if (profile.error) fail("Não foi possível criar o perfil.");
      const roleRow = await admin.from("user_roles").upsert({ user_id: id, school_id: schoolId, role }, { onConflict: "user_id,school_id,role", ignoreDuplicates: true });
      if (roleRow.error) fail("Não foi possível atribuir o papel.");
      return { userId: id, accessLink: accessLink ?? (await pendingAccess(id))?.link ?? null };
    },

    async issueAccessLink(userId) {
      const pending = await pendingAccess(userId);
      if (!pending) throw new RosterError("ACCOUNT_ALREADY_ACTIVE", "Esta pessoa já ativou a conta e entra com a própria senha.", 409);
      return pending.link;
    },

    async issuePendingAccessLinks(userIds) {
      const links: PendingAccessLink[] = [];
      for (const userId of userIds) {
        const pending = await pendingAccess(userId);
        if (pending) links.push({ userId, email: pending.email, accessLink: pending.link });
      }
      return links;
    },
  };
}
