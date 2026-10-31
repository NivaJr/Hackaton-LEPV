import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { LearningService } from "@/features/learning/server/service";
import { createLearningAiGateway } from "@/lib/llm/gateway";
import { MemoryLearningRepository, actor, fixtureIds, testNow, testPolicy } from "./helpers/learning-memory";
import { geminiEnv, geminiResponse, generated, mockFetch, requestBody } from "./llm-fixtures";

describe("recuperação integrada ao gateway Gemini", () => {
  it("usa a ficha persistida e encerra após duas variantes corretas sem enviar identidade ao provedor", async () => {
    const repository = new MemoryLearningRepository();
    const fetchMock = mockFetch(
      geminiResponse({ ...generated, statement: "No campeonato, o time A fez 1.340 passes e o B fez 1.304. Qual fez mais?" }),
      geminiResponse({ ...generated, statement: "Na rodada seguinte, o time A fez 1.450 passes e o B fez 1.405. Qual fez mais?" }),
    );
    const gateway = createLearningAiGateway(geminiEnv, { fetch: fetchMock });
    const service = new LearningService(repository, gateway, { ...testPolicy, recoveryReference: "previous" }, testNow);
    const saved = await service.savePreferences(actor(), { interests: ["futebol"], context: "Campeonatos" });
    expect(saved).toMatchObject({ studentId: fixtureIds.student, updatedAt: testNow().toISOString() });
    const original = await service.openActivity(actor(), "root-01");
    const incorrect = await service.submitAttempt(actor(), {
      questionInstanceId: original.question.questionInstanceId, selectedOptionId: "b", idempotencyKey: "gemini-original-error",
    });

    for (const [index, points] of [35, 35].entries()) {
      const next = await service.nextRecovery(actor(), incorrect.recoveryId!);
      expect(next!.question).toMatchObject({ sourceType: "recuperacao", skillCodes: ["EF06MA01"] });
      expect(next!.question).not.toHaveProperty("correctOptionId");
      const result = await service.submitAttempt(actor(), {
        questionInstanceId: next!.question.questionInstanceId, selectedOptionId: "A", idempotencyKey: `gemini-recovery-${index}`,
      });
      expect(result.result).toMatchObject({ isCorrect: true, consecutiveCorrect: index + 1, rankPointsAwarded: points, xpAwarded: 0 });
      if (index === 1) expect(result.result.recoveryStatus).toBe("recovered");
      const sent = JSON.stringify(requestBody(fetchMock, index));
      expect(sent).toContain("futebol");
      expect(sent).not.toContain(fixtureIds.student);
      expect(sent).not.toContain("studentId");
      expect(sent).not.toContain("updatedAt");
    }
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await expect(service.nextRecovery(actor(), incorrect.recoveryId!)).rejects.toMatchObject({ code: "RECOVERY_CLOSED" });
  });
});
