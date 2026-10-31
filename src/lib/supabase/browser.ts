"use client";

import { createBrowserClient } from "@supabase/ssr";
import { getPublicSupabaseConfig } from "./config";

export function createSupabaseBrowserClient() {
  const config = getPublicSupabaseConfig();
  if (!config) throw new Error("Configure a URL e a chave pública do Supabase.");
  return createBrowserClient(config.url, config.publishableKey);
}
