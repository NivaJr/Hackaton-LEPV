import "server-only";
import { createClient } from "@supabase/supabase-js";
import { getPublicSupabaseConfig } from "./config";

export function createSupabaseAdminClient() {
  const config = getPublicSupabaseConfig();
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!config || !secret) return null;
  return createClient(config.url, secret, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
