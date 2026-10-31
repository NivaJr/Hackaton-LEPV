import { handleRecognitionRequest } from "@/features/recognition/server/handler";

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return handleRecognitionRequest(request, { kind: "notifications" });
}
