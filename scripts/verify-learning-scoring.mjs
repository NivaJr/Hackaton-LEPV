/** Explicit smoke test using a fictitious demo account and the deployed learning APIs. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";

const args = process.argv.slice(2);
const option = (name) => { const index = args.indexOf(name); return index === -1 ? undefined : args[index + 1]; };
let phase = "configuration";
const value = (result, label) => {
  if (result.error) throw new Error(`${label}: ${result.error.code ?? result.error.status ?? "REQUEST_FAILED"}`);
  return result.data;
};

async function verify() {
  const target = option("--project-ref");
  const base = option("--base-url");
  assert(/^[a-z]{20}$/.test(target ?? ""), "Use --project-ref explicitly.");
  assert(base === "https://eai-lepv.vercel.app" || /^http:\/\/127\.0\.0\.1:\d+$/.test(base ?? ""), "Use the production URL or an explicit local server.");
  assert.equal(process.env.NEXT_PUBLIC_SUPABASE_URL, `https://${target}.supabase.co`, "The environment must match the target project.");
  assert(option("--credentials"), "Provide the ignored credentials file for the fictitious account.");
  const credentials = JSON.parse(await readFile(option("--credentials"), "utf8"));
  assert.equal(credentials.projectRef, target);
  const account = credentials.users.find(({ key }) => key === "student");
  assert(account?.email?.endsWith("@demo.lepv.test"), "This routine only uses a fictitious demo account.");
  const jar = new Map();
  const client = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    cookies: { getAll: () => [...jar].map(([name, value]) => ({ name, value })), setAll: (items) => items.forEach(({ name, value }) => jar.set(name, value)) },
  });
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  phase = "login";
  const login = value(await client.auth.signInWithPassword({ email: account.email, password: account.password }), "demo login");
  assert.equal(login.user.id, account.id);
  async function api(method, path, body) {
    const response = await fetch(`${base}${path}`, {
      method, redirect: "error", signal: AbortSignal.timeout(180_000),
      headers: { Cookie: [...jar].map(([name, value]) => `${name}=${value}`).join("; "), ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const result = await response.json();
    assert.equal(response.status, 200, `${phase}: ${method} ${path}: ${result.error?.code ?? "UNEXPECTED_STATUS"}`);
    return result;
  }
  phase = "session";
  const { data: session } = await api("GET", "/api/me");
  assert.equal(session.userId, account.id);
  assert.equal(session.studentId, account.id);
  async function state() {
    return value(await admin.rpc("learning_read_student", { p_school: session.institutionId, p_student: session.studentId }), "read demo state").state;
  }
  async function answerKey(instanceId) {
    const instance = (await state()).instances.find(({ question }) => question.questionInstanceId === instanceId);
    assert(instance, "The demo question must exist in this student's private snapshot.");
    return instance.answerKey.correctOptionId;
  }
  const activities = await api("GET", "/api/learning/activities");
  const current = await state();
  const pending = current.instances.find((instance) => instance.recoveryId !== null
    && current.recoveries.some((recovery) => recovery.id === instance.recoveryId && recovery.state.status === "in_progress")
    && activities.activities.some((activity) => activity.rootQuestionId === instance.question.rootQuestionId)
    && !current.attempts.some((attempt) => attempt.result.questionInstanceId === instance.question.questionInstanceId));
  if (args.includes("--check-only")) return { mode: "check-only", projectRef: target, baseUrl: base,
    availableOriginals: activities.activities.filter(({ status }) => status === "not_started").length, pendingRecoveryAvailable: Boolean(pending) };
  const year = new Date().getUTCFullYear();
  const period = `from=${year}-01-01&to=${year}-12-31`;
  const before = (await api("GET", `/api/learning/summary?${period}`)).summary;
  let recoveryId;
  if (args.includes("--resume")) {
    assert(pending, "No active pending recovery is available for this demo account.");
    recoveryId = pending.recoveryId;
  } else {
    phase = "open original";
    const activity = activities.activities.find(({ status }) => status === "not_started");
    assert(activity, "No unanswered active original is available; do not reopen old attempts.");
    const { question } = await api("POST", `/api/learning/activities/${encodeURIComponent(activity.rootQuestionId)}/open`, {});
    assert(!/correctOptionId|answerKey/.test(JSON.stringify(question)), "The public question must not expose the answer key.");
    const correct = await answerKey(question.questionInstanceId);
    const wrong = question.options.find(({ id }) => id !== correct);
    assert(wrong);
    phase = "wrong original";
    const result = await api("POST", "/api/learning/attempts", { questionInstanceId: question.questionInstanceId, selectedOptionId: wrong.id, idempotencyKey: randomUUID() });
    assert.equal(result.result.isCorrect, false);
    assert.equal(result.result.rankPointsAwarded, 0);
    assert.equal(result.result.xpAwarded, 0);
    recoveryId = result.recoveryId;
    assert(recoveryId);
  }
  phase = "open recovery";
  const { question } = await api("POST", `/api/learning/recoveries/${recoveryId}/next`, {});
  assert(!/correctOptionId|answerKey/.test(JSON.stringify(question)), "The recovery projection must not expose the answer key.");
  const correct = await answerKey(question.questionInstanceId);
  phase = "correct recovery";
  const input = { questionInstanceId: question.questionInstanceId, selectedOptionId: correct, idempotencyKey: randomUUID() };
  const answer = await api("POST", "/api/learning/attempts", input);
  assert.equal(answer.result.isCorrect, true);
  assert.equal(answer.result.rankPointsAwarded, 35);
  assert.equal(answer.result.xpAwarded, 0);
  assert.deepEqual(await api("POST", "/api/learning/attempts", input), answer);
  phase = "check persisted points";
  const after = (await api("GET", `/api/learning/summary?${period}`)).summary;
  assert.equal(after.rankPoints - before.rankPoints, 35);
  assert.equal(after.xp - before.xp, 0);
  if (answer.result.recoveryStatus === "in_progress") await api("POST", `/api/learning/recoveries/${recoveryId}/interrupt`, {});
  const report = { verifiedAt: new Date().toISOString(), projectRef: target, baseUrl: base,
    mode: args.includes("--resume") ? "resume-existing-recovery" : "wrong-original-then-correct-recovery",
    recoveryRankPointsAwarded: answer.result.rankPointsAwarded, recoveryXpAwarded: answer.result.xpAwarded,
    rankPointsDelta: after.rankPoints - before.rankPoints, xpDelta: after.xp - before.xp, idempotentReplay: true };
  const reportPath = option("--report");
  if (reportPath) {
    execFileSync("git", ["check-ignore", "--quiet", "--", reportPath]);
    await mkdir(dirname(resolve(reportPath)), { recursive: true });
    await writeFile(resolve(reportPath), JSON.stringify(report, null, 2), "utf8");
  }
  return report;
}

try { console.log(JSON.stringify({ ok: true, ...await verify() }, null, 2)); }
catch (error) {
  const message = String(error.message).replace(/sb_(?:secret|publishable)_[A-Za-z0-9_-]+/g, "[REDACTED]").replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, "[REDACTED]");
  console.error(JSON.stringify({ ok: false, phase, message }));
  process.exitCode = 1;
}
