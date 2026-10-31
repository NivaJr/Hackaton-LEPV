import "server-only";
import { headers } from "next/headers";
import type { SessionContext } from "@/contracts";
import { createFakeTeacherMetricsGateway } from "../adapters/fake";
import { createLearningTeacherMetricsGateway, type LearningJsonFetch } from "../adapters/learning";
import type { TeacherOverview } from "../domain/model";
import { resolveTeacherMetricsSource, TeacherMetricsUnavailableError, type TeacherMetricsGateway } from "../ports";
import { composeTeacherOverview } from "./compose-overview";
import { createSupabaseClassRosterSource } from "./supabase-roster";

const LEARNING_TIMEOUT_MS = 8_000;

/** Base URL comes from server config, never from the request Host header, because the cookie is forwarded. */
function learningOrigin(): string | null {
  const value = process.env.NEXT_PUBLIC_APP_URL;
  if (!value) return null;
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) ? url.origin : null;
  } catch {
    return null;
  }
}

function createLearningFetch(): LearningJsonFetch {
  return async (path) => {
    const origin = learningOrigin();
    if (!origin) throw new TeacherMetricsUnavailableError("Configure NEXT_PUBLIC_APP_URL para ler as métricas do núcleo.");
    if (!path.startsWith("/api/learning/")) throw new TeacherMetricsUnavailableError("Rota de métricas fora do núcleo.");
    const cookie = (await headers()).get("cookie") ?? "";
    let response: Response;
    try {
      response = await fetch(new URL(path, origin), {
        headers: { accept: "application/json", cookie },
        cache: "no-store",
        redirect: "error",
        signal: AbortSignal.timeout(LEARNING_TIMEOUT_MS),
      });
    } catch {
      throw new TeacherMetricsUnavailableError("O serviço de aprendizagem não respondeu a tempo.");
    }
    const body: unknown = await response.json().catch(() => null);
    return { status: response.status, body };
  };
}

export function getTeacherMetricsGateway(): { gateway: TeacherMetricsGateway; invalidSource: boolean } {
  const { source, invalid } = resolveTeacherMetricsSource(process.env.TEACHER_METRICS_SOURCE);
  const gateway = source === "learning"
    ? createLearningTeacherMetricsGateway({ fetchJson: createLearningFetch(), roster: createSupabaseClassRosterSource() })
    : createFakeTeacherMetricsGateway();
  return { gateway, invalidSource: invalid };
}

/** Pass the result of getSessionContext(); classes and subjects come from its teacher assignments. */
export async function loadTeacherOverview(session: SessionContext, options: { now?: Date } = {}): Promise<TeacherOverview> {
  const { gateway, invalidSource } = getTeacherMetricsGateway();
  return composeTeacherOverview(session, gateway, { now: options.now, invalidSource });
}
