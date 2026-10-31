import type { SupabaseClient } from "@supabase/supabase-js";
import { isRole } from "@/lib/auth/navigation";
import type { Role } from "@/contracts";
import { RosterError, type AccountRecord } from "../model";
import type { AccountDirectory } from "../ports";

const PAGE_SIZE = 1_000;

function fail(message: string): never {
  throw new RosterError("PROVISIONING_FAILED", message, 502);
}

/**
 * Privileged adapter. RosterService authorizes the coordinator and school before any call.
 * Emails are found by paging Auth users because profiles has no email column; see the
 * request to Nivaldo in docs/ENTREGA_FABIANO_GESTAO.md.
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
      if (!id) {
        // The invitation leads to /primeiro-acesso; knowing an email never lets someone set a password.
        const redirectTo = appUrl ? new URL("/auth/callback?next=/primeiro-acesso", appUrl).toString() : undefined;
        const { data, error } = await admin.auth.admin.inviteUserByEmail(email, redirectTo ? { redirectTo } : undefined);
        if (error || !data.user) fail("Não foi possível enviar o convite.");
        id = data.user.id;
      }
      const profile = await admin.from("profiles").upsert({ id, school_id: schoolId, full_name: fullName }, { onConflict: "id", ignoreDuplicates: true });
      if (profile.error) fail("Não foi possível criar o perfil.");
      const roleRow = await admin.from("user_roles").upsert({ user_id: id, school_id: schoolId, role }, { onConflict: "user_id,school_id,role", ignoreDuplicates: true });
      if (roleRow.error) fail("Não foi possível atribuir o papel.");
      return id;
    },
  };
}
