import "server-only";
import { getOptionalSession, getSessionContext } from "@/lib/auth/session";
import { createRecognitionHttpHandler } from "../http";
import { createRecognitionService } from "./runtime";

export const handleRecognitionRequest = createRecognitionHttpHandler({
  getSessionContext,
  getActorName: async () => (await getOptionalSession())?.fullName ?? "",
  createService: createRecognitionService,
});
