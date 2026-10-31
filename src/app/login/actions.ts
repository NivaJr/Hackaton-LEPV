"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
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
  redirect(roleHome(session.roles[0]));
}
