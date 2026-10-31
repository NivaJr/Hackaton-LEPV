import "server-only";
import type { SessionContext } from "@/contracts";
import { LearningError } from "@/features/learning/server/model";
import type { LearningService } from "@/features/learning/server/service";
import { ContentError } from "../model";
import type { ActivityPublisher, ActivitySnapshot } from "../ports";

type ActivityRegistry = Pick<LearningService, "registerActivity">;

/** Hands the reviewed snapshot to the learning catalogue, where students receive it. */
export class LearningActivityPublisher implements ActivityPublisher {
  readonly delivery = "aprendizagem" as const;

  // Created per call: the learning service reads its scoring policy from the environment.
  constructor(private readonly learning: () => ActivityRegistry) {}

  async registerActivity(actor: SessionContext, classId: string, value: ActivitySnapshot) {
    try {
      return await this.learning().registerActivity(actor, classId, value);
    } catch (error) {
      if (error instanceof LearningError) throw new ContentError(error.code, error.message, error.status, undefined, { cause: error });
      throw error;
    }
  }
}
