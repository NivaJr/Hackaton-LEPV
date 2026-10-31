import { RecoveryStateSchema, type RecoveryState } from "@/contracts/schemas";

export function createRecoveryState(): RecoveryState {
  return { status: "in_progress", consecutiveCorrect: 0, answeredCount: 0 };
}

/** Call only for a newly persisted answer, after idempotency checks. */
export function advanceRecovery(state: RecoveryState, isCorrect: boolean): RecoveryState {
  const validState = RecoveryStateSchema.parse(state);
  if (validState.status !== "in_progress") return { ...validState };
  const consecutiveCorrect = isCorrect ? validState.consecutiveCorrect + 1 : 0;
  return {
    status: consecutiveCorrect >= 2 ? "recovered" : "in_progress",
    consecutiveCorrect,
    answeredCount: validState.answeredCount + 1,
  };
}

export function interruptRecovery(state: RecoveryState): RecoveryState {
  const validState = RecoveryStateSchema.parse(state);
  if (validState.status !== "in_progress") return { ...validState };
  return { ...validState, status: "interrupted" };
}
