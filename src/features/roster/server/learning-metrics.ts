import type { RosterMetricsGateway } from "../ports";
import type { LearningService } from "@/features/learning/server/service";

/** One aggregate RPC for all classes, authorized by the learning core with the same session. */
export function createLearningRosterMetrics(createService: () => LearningService, now = () => new Date()): RosterMetricsGateway {
  return { async classMetrics(actor, classIds) {
    const to = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(now());
    const from = new Date(Date.parse(`${to}T12:00:00Z`) - 29 * 86_400_000).toISOString().slice(0, 10);
    const classes = await createService().classMetrics(actor, classIds, from, to);
    return { source: "real", classes, from, to };
  } };
}
