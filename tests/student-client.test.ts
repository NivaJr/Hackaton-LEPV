import { afterEach, describe, expect, it, vi } from "vitest";
import { createFakeStudentLearningClient, createHttpStudentLearningClient } from "@/features/learning/client";
import { demoActivities, demoPreferences, demoRanking, demoSummary } from "@/features/learning/fixtures/student-demo";

afterEach(() => vi.unstubAllGlobals());

describe("StudentLearningClient fake", () => {
  it("mantém a série da turma e oferece somente a escolha da matéria", async () => {
    const client = createFakeStudentLearningClient();
    const snapshot = await client.loadSnapshot();

    expect(snapshot.activities.grade).toBe(7);
    expect(new Set(snapshot.activities.activities.map((item) => item.grade))).toEqual(new Set([7]));
    expect(new Set(snapshot.activities.activities.map((item) => item.subjectId)).size).toBe(6);
  });

  it("salva interesses e contexto sem aceitar campos de identidade", async () => {
    const client = createFakeStudentLearningClient();
    const saved = await client.savePreferences({ interests: ["xadrez", "música"], context: "Prefiro desafios curtos." });

    expect(saved.interests).toEqual(["xadrez", "música"]);
    expect(saved.context).toBe("Prefiro desafios curtos.");
    expect(saved.version).toBe(2);
  });

  it("reutiliza o resultado da instância e não duplica crédito", async () => {
    const client = createFakeStudentLearningClient();
    const opened = await client.openActivity("math-root-01");
    const submission = { questionInstanceId: opened.question.questionInstanceId, selectedOptionId: "b", idempotencyKey: "stable-key-123" };

    const first = await client.submitAttempt(submission);
    const replay = await client.submitAttempt(submission);

    expect(replay.result.attemptId).toBe(first.result.attemptId);
    expect(replay.result.xpAwarded).toBe(first.result.xpAwarded);
    expect((await client.loadSnapshot()).summary.xp).toBe(demoSummary.xp + first.result.xpAwarded);
    await expect(client.submitAttempt({ ...submission, selectedOptionId: "a", idempotencyKey: "another-key-123" })).rejects.toMatchObject({ code: "ALREADY_ANSWERED" });
  });

  it("percorre erro, próxima questão, dica e interrupção", async () => {
    const client = createFakeStudentLearningClient();
    const opened = await client.openActivity("math-root-01");
    const failed = await client.submitAttempt({ questionInstanceId: opened.question.questionInstanceId, selectedOptionId: "a", idempotencyKey: "wrong-key-123" });

    expect(failed.result.isCorrect).toBe(false);
    expect(failed.result.recoveryStatus).toBe("in_progress");
    expect(failed.recoveryId).not.toBeNull();

    const next = await client.getNextRecoveryQuestion(failed.recoveryId!);
    const hint = await client.getHint(next.question.questionInstanceId);
    const interrupted = await client.interruptRecovery(failed.recoveryId!);

    expect(next.question.sourceType).toBe("recuperacao");
    expect(hint.text.length).toBeGreaterThan(10);
    expect(interrupted.state.status).toBe("interrupted");
  });

  it("monta o snapshot HTTP com período anual exigido pela API", async () => {
    const urls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      urls.push(url);
      if (url.endsWith("/preferences")) return Response.json({ preferences: demoPreferences, saved: true });
      if (url.endsWith("/activities")) {
        const { className: _className, ...activitiesWithoutName } = demoActivities;
        return Response.json(activitiesWithoutName);
      }
      if (url.includes("/summary?")) return Response.json({ summary: demoSummary });
      if (url.includes("/ranking?")) return Response.json(demoRanking);
      return Response.json({ error: { message: "Rota inesperada" } }, { status: 404 });
    }));

    const snapshot = await createHttpStudentLearningClient().loadSnapshot();

    expect(snapshot.activities.className).toBe("7º ano");
    expect(urls.some((url) => url.includes("summary?from=2026-01-01&to="))).toBe(true);
    expect(urls.some((url) => url.includes("ranking?classId=class-7a-demo"))).toBe(true);
  });
});
