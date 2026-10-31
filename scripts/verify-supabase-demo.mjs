/** Explicitly invoked setup/verification for synthetic demonstration data. Never runs in npm test. */
import { randomBytes, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";

const args = process.argv.slice(2);
const target = args[args.indexOf("--project-ref") + 1];
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publicKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const secret = process.env.SUPABASE_SECRET_KEY;
assert(args.includes("--project-ref") && /^[a-z]{20}$/.test(target), "Informe --project-ref explicitamente.");
assert(url === `https://${target}.supabase.co` && process.env.SUPABASE_PROJECT_REF === target, "O ambiente e o projeto-alvo precisam coincidir.");
assert(publicKey && secret, "Configure as chaves no ambiente privado.");
assert(args.includes("--provision") !== args.includes("--verify"), "Escolha --provision ou --verify.");

const credentialsPath = resolve("supabase/.temp/lepv-demo-credentials.json");
execFileSync("git", ["check-ignore", "--quiet", "--", "supabase/.temp/lepv-demo-credentials.json"]);
const admin = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
const school = "11111111-1111-4111-8111-111111111111";
const otherSchool = "44444444-4444-4444-8444-444444444444";
const classId = "22222222-2222-4222-8222-222222222222";
const otherClass = "55555555-5555-4555-8555-555555555555";
const mathHistory = "88000000-0000-4000-8000-000000000001";
const portugueseHistory = "88000000-0000-4000-8000-000000000002";
const subjects = ["matematica", "portugues", "ingles", "historia", "geografia", "biologia"];

function value(result, context) {
  if (result.error) throw new Error(`${context}: ${result.error.code ?? result.error.name ?? "REQUEST_FAILED"}`);
  return result.data;
}
async function savePrivate(data) {
  await mkdir(dirname(credentialsPath), { recursive: true });
  await writeFile(credentialsPath, JSON.stringify(data, null, 2), { encoding: "utf8", mode: 0o600 });
}
function root(index) {
  return {
    rootQuestionId: `__verification_math_${String(index).padStart(2,"0")}`,
    body: {
      subjectId: "matematica", grade: 6, skillCodes: ["EF06MA01"],
      statement: `VALIDAÇÃO SINTÉTICA LEPV ${index}: quanto é ${index} + 2?`,
      options: [{ id: "a", text: String(index + 2) }, { id: "b", text: String(index + 3) }],
      correctOptionId: "a", explanation: `${index} mais duas unidades resulta em ${index + 2}.`,
      hint: "Some duas unidades ao primeiro número.", difficulty: "facil",
    },
    contentVersion: 1, reviewed: true, active: false, activatedAt: null,
  };
}

async function provision() {
  let credentials;
  try { credentials = JSON.parse(await readFile(credentialsPath,"utf8")); }
  catch (error) { if (error.code !== "ENOENT") throw error; }
  if (!credentials) {
    credentials = {
      projectRef: target,
      purpose: "Contas fictícias e dados sintéticos; nenhuma mensagem de convite é enviada.",
      users: [
        ["coordinator","coordenador","Coordenador — Validação LEPV"],
        ["teacher","professor","Professor — Validação LEPV"],
        ["student","aluno","Aluno — Validação LEPV"],
        ["guardian","responsavel","Responsável — Validação LEPV"],
        ["outsider","aluno","Aluno de outra escola — Validação LEPV"],
      ].map(([key,role,name]) => ({ key,role,name,email: `${key}@demo.lepv.test`,password: randomBytes(24).toString("base64url") })),
    };
    await savePrivate(credentials);
  }
  assert.equal(credentials.projectRef,target,"Arquivo de credenciais pertence a outro projeto.");
  const listed = value(await admin.auth.admin.listUsers({ page: 1, perPage: 100 }),"listar contas").users;
  for (const account of credentials.users) {
    const existing = listed.find((user) => user.email === account.email);
    if (existing) {
      assert(existing.user_metadata?.lepv_synthetic === true,"Não assumir uma conta não criada por esta rotina.");
      account.id = existing.id;
    } else {
      const data = value(await admin.auth.admin.createUser({
        email: account.email, password: account.password, email_confirm: true,
        user_metadata: { full_name: account.name, lepv_synthetic: true },
      }),"criar conta fictícia");
      account.id = data.user.id;
    }
    await savePrivate(credentials);
  }
  value(await admin.from("schools").upsert({ id: otherSchool,name: "Escola isolada — Validação sintética LEPV" },{ onConflict: "id",ignoreDuplicates: true }),"escola isolada");
  for (const account of credentials.users) {
    const schoolId = account.key === "outsider" ? otherSchool : school;
    const existing = value(await admin.from("profiles").select("school_id").eq("id",account.id).maybeSingle(),"consultar perfil");
    assert(!existing || existing.school_id === schoolId,"Não mover automaticamente um perfil entre escolas.");
    value(await admin.from("profiles").upsert({ id: account.id,school_id: schoolId,full_name: account.name },{ onConflict: "id",ignoreDuplicates: true }),"perfil fictício");
    value(await admin.from("user_roles").upsert({ user_id: account.id,school_id: schoolId,role: account.role },{ onConflict: "user_id,school_id,role",ignoreDuplicates: true }),"papel fictício");
  }
  for (const [id,schoolId,name] of [[classId,school,"6º A — Validação sintética LEPV"],[otherClass,otherSchool,"6º A — Escola isolada de validação"]]) {
    value(await admin.from("classrooms").upsert({ id,school_id: schoolId,name,grade: 6,school_year: 2026 },{ onConflict: "id",ignoreDuplicates: true }),"turma fictícia");
  }
  const accounts = Object.fromEntries(credentials.users.map((account) => [account.key,account]));
  for (const [account,targetClass,targetSchool] of [[accounts.student,classId,school],[accounts.outsider,otherClass,otherSchool]]) {
    const existing = value(await admin.from("enrollments").select("classroom_id").eq("student_id",account.id).eq("status","active").maybeSingle(),"consultar matrícula");
    assert(!existing || existing.classroom_id === targetClass,"Não transferir uma matrícula existente.");
    if (!existing) value(await admin.from("enrollments").insert({ school_id: targetSchool,classroom_id: targetClass,student_id: account.id }),"matrícula fictícia");
  }
  value(await admin.from("teacher_assignments").upsert({ school_id: school,classroom_id: classId,teacher_id: accounts.teacher.id,subject_id: "matematica" },{ onConflict: "classroom_id,teacher_id,subject_id",ignoreDuplicates: true }),"atribuição docente");
  value(await admin.from("guardian_links").upsert({ school_id: school,guardian_id: accounts.guardian.id,student_id: accounts.student.id,status: "confirmed" },{ onConflict: "guardian_id,student_id",ignoreDuplicates: true }),"vínculo fictício confirmado");
  value(await admin.from("academic_history").upsert([
    { id: mathHistory,school_id: school,student_id: accounts.student.id,subject_id: "matematica",school_year: 2026,period: "Validação sintética",grade: 7 },
    { id: portugueseHistory,school_id: school,student_id: accounts.student.id,subject_id: "portugues",school_year: 2026,period: "Validação sintética",grade: 7 },
  ],{ onConflict: "id",ignoreDuplicates: true }),"históricos fictícios");
  for (const table of ["student_health","student_support"]) value(await admin.from(table).upsert({ school_id: school,student_id: accounts.student.id,details: "Registro fictício para validar permissões; sem dados pessoais reais." },{ onConflict: "student_id",ignoreDuplicates: true }),"registro sensível fictício");
  for (let retry = 0; retry < 5; retry++) {
    const loaded = value(await admin.rpc("learning_read_catalog",{ p_school: school,p_class: classId }),"ler catálogo de validação");
    for (let i = 1; i <= 12; i++) {
      const fixture = root(i);
      const existing = loaded.catalog.activities.find((item) => item.rootQuestionId === fixture.rootQuestionId);
      if (existing) assert.deepEqual(existing.body,fixture.body,"Não alterar conteúdo de um snapshot existente.");
      else loaded.catalog.activities.push(fixture);
    }
    const saved = value(await admin.rpc("learning_commit_catalog",{ p_school: school,p_class: classId,p_expected_version: loaded.version,p_catalog: loaded.catalog }),"persistir catálogo sintético");
    if (saved) return { phase: "provision",projectRef: target,accounts: credentials.users.length,syntheticRoots: 12,credentialsFile: "supabase/.temp/lepv-demo-credentials.json",invitationsSent: 0 };
  }
  throw new Error("Concorrência ao preparar o catálogo; repita a rotina.");
}

async function verify() {
  const credentials = JSON.parse(await readFile(credentialsPath,"utf8"));
  assert.equal(credentials.projectRef,target);
  assert.equal(process.env.LEPV_ORIGINAL_POINTS,"100");
  assert.equal(process.env.LEPV_RECOVERY_REFERENCE,"previous");
  assert.equal(process.env.LEPV_ADAPTIVE_XP_FOLLOWS_ROOT,"true");
  const base = args[args.indexOf("--base-url") + 1];
  assert(args.includes("--base-url") && /^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(base),"Use um servidor local explícito para a verificação.");
  const clients = {};
  const checks = [];
  for (const account of credentials.users) {
    const jar = new Map();
    const client = createServerClient(url,publicKey,{ cookies: {
      getAll: () => [...jar].map(([name,value]) => ({ name,value })),
      setAll: (items) => items.forEach(({ name,value }) => jar.set(name,value)),
    } });
    value(await client.auth.signInWithPassword({ email: account.email,password: account.password }),`login ${account.key}`);
    clients[account.key] = { account,client,cookie: () => [...jar].map(([name,value]) => `${name}=${value}`).join("; ") };
  }
  checks.push("login real dos quatro perfis e aluno de outra escola");
  async function api(key,method,path,body,expected = 200) {
    const response = await fetch(`${base}${path}`,{ method,headers: { Cookie: clients[key].cookie(),...(body === undefined ? {} : { "Content-Type": "application/json" }) },...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const payload = await response.json();
    assert.equal(response.status,expected,`${method} ${path}: ${payload.error?.code ?? "unexpected_status"}`);
    return payload;
  }
  const student = clients.student.account.id;
  const outsider = clients.outsider.account.id;
  assert.deepEqual(value(await clients.student.client.from("subjects").select("id").order("display_order"),"catálogo autenticado").map((row) => row.id),subjects);
  const escalation = await clients.student.client.from("user_roles").insert({ user_id: student,school_id: school,role: "coordenador" });
  assert(escalation.error,"Aluno não pode elevar o próprio papel.");
  const denied = (result,context) => assert(result.error || result.data?.length === 0,context);
  denied(await clients.student.client.from("profiles").select("id").eq("id",outsider),"Isolamento entre escolas.");
  const own = value(await clients.teacher.client.from("academic_history").update({ grade: 8.25 }).eq("id",mathHistory).select("id,updated_by"),"histórico docente autorizado");
  assert.equal(own[0]?.updated_by,clients.teacher.account.id);
  denied(await clients.teacher.client.from("academic_history").update({ grade: 9 }).eq("id",portugueseHistory).select("id"),"Docente não edita outra matéria.");
  for (const table of ["student_health","student_support"]) {
    const changed = value(await clients.guardian.client.from(table).update({ details: "Atualização fictícia para validar vínculo e auditoria." }).eq("student_id",student).select("student_id,updated_by"),"edição autorizada do responsável");
    assert.equal(changed[0]?.updated_by,clients.guardian.account.id);
    denied(await clients.coordinator.client.from(table).update({ details: "Não deve persistir." }).eq("student_id",student).select("student_id"),"Coordenador não edita saúde/apoio.");
    denied(await clients.student.client.from(table).update({ details: "Não deve persistir." }).eq("student_id",student).select("student_id"),"Aluno não edita saúde/apoio.");
  }
  for (const status of ["pending","revoked"]) {
    value(await admin.from("guardian_links").update({ status }).eq("guardian_id",clients.guardian.account.id).eq("student_id",student),"alterar vínculo de teste");
    try { denied(await clients.guardian.client.from("student_health").select("student_id").eq("student_id",student),"Vínculo não confirmado não autoriza leitura."); }
    finally { value(await admin.from("guardian_links").update({ status: "confirmed" }).eq("guardian_id",clients.guardian.account.id).eq("student_id",student),"restaurar vínculo fictício"); }
  }
  assert((await clients.student.client.rpc("learning_read_student",{ p_school: school,p_student: student })).error,"RPC privilegiada indisponível ao aluno.");
  assert((await clients.student.client.schema("app_private").from("learning_student_states").select("student_id")).error,"Snapshot privado indisponível ao navegador.");
  const anonymous = createClient(url,publicKey,{ auth: { persistSession: false } });
  denied(await anonymous.from("profiles").select("id"),"Anônimo sem dados.");
  checks.push("RLS real: papéis, escola, matéria, saúde/apoio, vínculo revogado, RPCs e gabaritos privados");

  const catalog = value(await admin.rpc("learning_read_catalog",{ p_school: school,p_class: classId }),"catálogo de validação");
  if (!catalog.catalog.activities.some((item) => item.active)) await api("coordinator","POST","/api/learning/activation",{ classId,subjectId: "matematica",rootQuestionIds: Array.from({ length: 10 },(_,i) => root(i + 1).rootQuestionId) });
  await api("student","PUT","/api/learning/preferences",{ interests: ["validação sintética"],context: "Dados fictícios usados exclusivamente para verificar a integração." });
  const activities = await api("student","GET","/api/learning/activities");
  assert.equal(activities.classId,classId);
  assert.equal(activities.activities.length,10);
  const available = activities.activities.filter((item) => item.status !== "answered");
  assert(available.length >= 3,"A verificação exige três raízes ainda não respondidas; não reabrir tentativas antigas.");
  const open = async (rootId) => (await api("student","POST",`/api/learning/activities/${encodeURIComponent(rootId)}/open`,{})).question;
  const answer = async (instanceId,selected,key) => api("student","POST","/api/learning/attempts",{ questionInstanceId: instanceId,selectedOptionId: selected,idempotencyKey: key });
  const original = await open(available[0].rootQuestionId);
  assert(!/correctOptionId|answerKey|explanation|hint/.test(JSON.stringify(original)),"Projeção pública sem gabarito.");
  const wrongKey = randomUUID();
  const incorrect = await answer(original.questionInstanceId,"b",wrongKey);
  const failure = await api("student","POST",`/api/learning/recoveries/${incorrect.recoveryId}/next`,{},503);
  assert.equal(failure.error.code,"AI_UNAVAILABLE");
  assert.equal((await api("student","GET",`/api/learning/instances/${original.questionInstanceId}`)).status,"answered");

  // Inject explicitly synthetic, verified arithmetic snapshots, without pretending to call an AI provider.
  async function seedRecovery(recoveryId,nominalPoints,label) {
    for (let retry = 0; retry < 5; retry++) {
      const loaded = value(await admin.rpc("learning_read_student",{ p_school: school,p_student: student }),"ler estado para fixture privada");
      const recovery = loaded.state.recoveries.find((item) => item.id === recoveryId);
      assert.equal(recovery?.state.status,"in_progress");
      assert.equal(recovery.leaseToken,null);
      const prior = loaded.state.instances.find((item) => item.question.rootQuestionId === recovery.rootQuestionId && item.recoveryId === null);
      const questionId = randomUUID();
      const instance = {
        classId,contentVersion: 1,rootContentVersion: prior.rootContentVersion,recoveryId,
        scoring: prior.scoring,nominalPoints,issuedAt: new Date().toISOString(),
        question: { ...prior.question,questionInstanceId: randomUUID(),questionId,sourceType: "recuperacao",preferencesVersion: loaded.preferences.version,statement: `VARIANTE SINTÉTICA DE VALIDAÇÃO ${label}: quanto é 2 + 2?`,options: [{ id: "a",text: "4" },{ id: "b",text: "5" }] },
        answerKey: { questionId,correctOptionId: "a",explanation: "Dois pares somam quatro.",hint: "Conte dois pares." },
      };
      loaded.state.instances.push(instance);
      const saved = value(await admin.rpc("learning_commit_student",{ p_school: school,p_student: student,p_expected_version: loaded.stateVersion,p_catalog_version: loaded.catalogVersion,p_state: loaded.state }),"persistir variante sintética");
      if (saved) return instance.question.questionInstanceId;
    }
    throw new Error("Concorrência ao preparar variante sintética.");
  }
  const firstRecovery = await seedRecovery(incorrect.recoveryId,70,randomUUID());
  const hint = await api("student","POST",`/api/learning/instances/${firstRecovery}/hint`,{});
  assert.equal(hint.text,"Conte dois pares.");
  const recoveryKey = randomUUID();
  const replays = await Promise.all(Array.from({ length: 8 },() => answer(firstRecovery,"a",recoveryKey)));
  assert.equal(new Set(replays.map((item) => item.result.attemptId)).size,1);
  assert.equal(replays[0].result.xpAwarded,70);
  const secondRecovery = await seedRecovery(incorrect.recoveryId,49,randomUUID());
  const recovered = await answer(secondRecovery,"a",randomUUID());
  assert.equal(recovered.result.xpAwarded,49);
  assert.equal(recovered.result.recoveryStatus,"recovered");
  assert.equal(recovered.result.consecutiveCorrect,2);
  const correctOriginal = await open(available[1].rootQuestionId);
  const correctKey = randomUUID();
  const correct = await answer(correctOriginal.questionInstanceId,"a",correctKey);
  assert.equal(correct.result.xpAwarded,100);
  const repeated = await answer(correctOriginal.questionInstanceId,"a",correctKey);
  assert.equal(repeated.result.attemptId,correct.result.attemptId);
  await api("student","POST","/api/learning/attempts",{ questionInstanceId: correctOriginal.questionInstanceId,selectedOptionId: "b",idempotencyKey: randomUUID() },409);
  await api("outsider","GET",`/api/learning/instances/${original.questionInstanceId}`,undefined,404);
  await api("outsider","GET",`/api/learning/ranking?classId=${classId}`,undefined,404);
  const third = await open(available[2].rootQuestionId);
  const toInterrupt = await answer(third.questionInstanceId,"b",randomUUID());
  const pending = await seedRecovery(toInterrupt.recoveryId,70,randomUUID());
  assert.equal((await api("student","POST",`/api/learning/recoveries/${toInterrupt.recoveryId}/interrupt`,{})).state.status,"interrupted");
  await api("student","POST","/api/learning/attempts",{ questionInstanceId: pending,selectedOptionId: "a",idempotencyKey: randomUUID() },409);
  await api("student","POST","/api/learning/access",{});
  await api("student","POST","/api/learning/access",{});
  checks.push("HTTP com cookie real: ficha, questões sem gabarito, resposta, 8 reenvios concorrentes, dica, dois acertos, interrupção e acesso");
  checks.push("IA desabilitada retorna 503 e preserva a tentativa; variantes desta verificação foram fixtures sintéticas privadas");

  const period = "from=2026-01-01&to=2026-12-31";
  const beforeRotation = await api("student","GET",`/api/learning/summary?${period}`);
  const freshCatalog = value(await admin.rpc("learning_read_catalog",{ p_school: school,p_class: classId }),"ler rotação");
  const day = new Intl.DateTimeFormat("en-CA",{ timeZone: "America/Sao_Paulo",year: "numeric",month: "2-digit",day: "2-digit" }).format(new Date());
  const monday = new Date(`${day}T12:00:00Z`);
  monday.setUTCDate(monday.getUTCDate() - (monday.getUTCDay() + 6) % 7);
  const weekStart = monday.toISOString().slice(0,10);
  const previousRotation = freshCatalog.catalog.rotations.find((item) => item.weekStart === weekStart && item.subjectId === "matematica");
  const rotationInput = { classId,subjectId: "matematica",weekStart,incomingRootIds: previousRotation?.incomingRootIds ?? [root(11).rootQuestionId,root(12).rootQuestionId] };
  const rotation = await api("coordinator","POST","/api/learning/rotation",rotationInput);
  assert.deepEqual(await api("coordinator","POST","/api/learning/rotation",rotationInput),rotation);
  const afterRotation = await api("student","GET",`/api/learning/summary?${period}`);
  assert.equal(afterRotation.summary.rankPoints,beforeRotation.summary.rankPoints);
  assert(afterRotation.summary.xp <= beforeRotation.summary.xp);
  if (!previousRotation) assert.equal(beforeRotation.summary.xp - afterRotation.summary.xp,219);
  const ranking = await api("student","GET",`/api/learning/ranking?classId=${classId}`);
  assert(ranking.top10.length <= 10);
  assert.equal(ranking.top10.find((row) => row.studentId === student)?.rankPoints,afterRotation.summary.rankPoints);
  await api("guardian","GET",`/api/learning/summary?${period}&studentId=${student}`);
  await api("outsider","GET",`/api/learning/summary?${period}&studentId=${student}`,undefined,404);
  const ownAttempts = value(await clients.student.client.from("learning_attempts").select("id"),"tentativas próprias");
  const ownCredits = value(await clients.student.client.from("learning_point_ledger").select("id"),"créditos próprios");
  assert.equal(ownCredits.length,ownAttempts.length * 2);
  denied(await clients.outsider.client.from("learning_attempts").select("id").eq("student_id",student),"Outro aluno não acessa tentativas.");
  checks.push("rotação real idempotente: XP retirado, pontos anuais preservados; ranking e resumos autorizados");
  const report = { phase: "verify",projectRef: target,verifiedAt: new Date().toISOString(),checks,attempts: ownAttempts.length,creditEntries: ownCredits.length,xpBeforeRotation: beforeRotation.summary.xp,xpAfterRotation: afterRotation.summary.xp,annualPoints: afterRotation.summary.rankPoints,liveAiVerified: false };
  await writeFile(resolve("supabase/.temp/lepv-verification-report.json"),JSON.stringify(report,null,2),"utf8");
  return report;
}

try { console.log(JSON.stringify({ ok: true,...await (args.includes("--provision") ? provision() : verify()) },null,2)); }
catch (error) { console.error(JSON.stringify({ ok: false,message: String(error.message).replace(/sb_secret_[A-Za-z0-9_-]+/g,"[REDACTED]").replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,"[REDACTED]") })); process.exitCode = 1; }
