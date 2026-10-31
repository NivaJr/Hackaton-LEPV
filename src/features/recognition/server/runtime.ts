import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { RecognitionError } from "../model";
import { MemoryRecognitionStore } from "../memory-repository";
import { RecognitionService } from "../service";
import { SupabaseRecognitionStore, SupabaseRosterReader } from "./supabase-repository";

const globalStore = globalThis as typeof globalThis & { __recognitionMemoryStore?: MemoryRecognitionStore };

export function getRecognitionStoreMode(): "memory" | "supabase" {
  const value = process.env.RECOGNITION_STORE ?? "supabase";
  if (value === "memory" || value === "supabase") return value;
  throw new RecognitionError("NOT_CONFIGURED", "RECOGNITION_STORE deve ser memory ou supabase.", 503);
}

export function createRecognitionService(): RecognitionService {
  const mode = getRecognitionStoreMode();
  const admin = createSupabaseAdminClient();
  if (!admin) {
    throw new RecognitionError("NOT_CONFIGURED", "Configure o Supabase no servidor para usar os elogios.", 503);
  }
  if (mode === "memory" && process.env.NODE_ENV === "production") {
    throw new RecognitionError("NOT_CONFIGURED", "O modo em memória não guarda elogios em produção. Use RECOGNITION_STORE=supabase.", 503);
  }
  const roster = new SupabaseRosterReader(admin);
  if (mode === "memory") {
    globalStore.__recognitionMemoryStore ??= new MemoryRecognitionStore();
    const store = globalStore.__recognitionMemoryStore;
    return new RecognitionService({ recognitions: store, notifications: store, roster });
  }
  const store = new SupabaseRecognitionStore(admin);
  return new RecognitionService({ recognitions: store, notifications: store, roster });
}
