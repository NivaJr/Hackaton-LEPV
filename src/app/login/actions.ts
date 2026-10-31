"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getOptionalSession } from "@/lib/auth/session";
import { roleHome, safeInternalPath } from "@/lib/auth/navigation";

export async function signIn(formData: FormData) {
  const parsed = z.object({ email: z.email(), password: z.string().min(1).max(256) }).safeParse({
    email: formData.get("email"), password: formData.get("password"),
  });
  if (!parsed.success) redirect("/login?error=invalid");
  const supabase = await createSupabaseServerClient();
  if (!supabase) redirect("/login?error=setup");
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) redirect("/login?error=credentials");
  const session = await getOptionalSession();
  if (!session) {
    await supabase.auth.signOut();
    redirect("/login?error=profile");
  }
  const fallback = roleHome(session.roles[0]);
  redirect(safeInternalPath(formData.get("next"), fallback));
}

export async function signOut() {
  const supabase = await createSupabaseServerClient();
  if (supabase) await supabase.auth.signOut();
  redirect("/login");
}

/** Redeemed here, on a click, because link previews would spend a one-time token opened by GET. */
export async function acceptInvite(formData: FormData) {
  const parsed = z.object({ tokenHash: z.string().min(20).max(200), type: z.enum(["invite", "recovery"]) }).safeParse({
    tokenHash: formData.get("tokenHash"), type: formData.get("type"),
  });
  if (!parsed.success) redirect("/login?error=invite");
  const supabase = await createSupabaseServerClient();
  if (!supabase) redirect("/login?error=setup");
  const { error } = await supabase.auth.verifyOtp({ token_hash: parsed.data.tokenHash, type: parsed.data.type });
  if (error) redirect("/login?error=invite");
  redirect("/primeiro-acesso");
}

export async function defineFirstPassword(formData: FormData) {
  const session = await getOptionalSession();
  if (!session) redirect("/primeiro-acesso?error=invite");
  const parsed = z.object({ password: z.string().min(12).max(128), confirmation: z.string() })
    .refine((data) => data.password === data.confirmation).safeParse({
      password: formData.get("password"), confirmation: formData.get("confirmation"),
    });
  if (!parsed.success) redirect("/primeiro-acesso?error=password");
  const supabase = await createSupabaseServerClient();
  if (!supabase) redirect("/primeiro-acesso?error=setup");
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) redirect("/primeiro-acesso?error=update");
  // From here on the coordinator can no longer issue a new link for this account.
  const completed = await createSupabaseAdminClient()?.auth.admin.updateUserById(session.userId, { app_metadata: { access_pending: false } });
  if (completed?.error) console.error("Supabase Auth: falha ao concluir o primeiro acesso", { code: completed.error.code, status: completed.error.status });
  if (formData.get("after") === "ficha" && session.roles.includes("aluno")) redirect("/aluno#perfil");
  redirect(roleHome(session.roles[0]));
}
