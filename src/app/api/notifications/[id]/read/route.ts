import { handleRecognitionRequest } from "@/features/recognition/server/handler";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handleRecognitionRequest(request, { kind: "markRead", notificationId: id });
}
