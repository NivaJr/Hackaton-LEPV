import { randomUUID } from "node:crypto";
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ContentQuestionSchema } from "@/features/content/model";
import { SupabaseContentRepository, SupabaseImportQuota } from "@/features/content/server/supabase-repository";
import { LearningService } from "@/features/learning/server/service";
import { SupabaseLearningRepository } from "@/features/learning/server/supabase-repository";
import { actor, coordinator, fixtureIds as ids, question, teacher, testNow, testPolicy } from "./helpers/learning-memory";
import { createLearningDatabase, postgresRpcClient, queryAs, resetLearningDatabase } from "./helpers/learning-postgres";

const otherAdmin = "00000000-0000-4000-8000-000000000106";
const otherStudent = "00000000-0000-4000-8000-000000000107";
const portugueseTeacher = "00000000-0000-4000-8000-000000000108";
const pendingGuardian = "00000000-0000-4000-8000-000000000109";
const otherClass = "10000000-0000-4000-8000-000000000003";
let db: PGlite;
let service: LearningService;

beforeAll(async () => {
  db = await createLearningDatabase();
  await db.exec(`
    insert into public.schools(id,name) values('${ids.otherSchool}','Outra escola fictícia');
    insert into auth.users(id,email) values
      ('${otherAdmin}','other-admin@fixture.test'),('${otherStudent}','other-student@fixture.test'),
      ('${portugueseTeacher}','portuguese@fixture.test'),('${pendingGuardian}','pending@fixture.test');
    insert into public.profiles(id,school_id,full_name) values
      ('${otherAdmin}','${ids.otherSchool}','Outro coordenador'),('${otherStudent}','${ids.otherSchool}','Outro aluno'),
      ('${portugueseTeacher}','${ids.school}','Professor de Português'),('${pendingGuardian}','${ids.school}','Responsável pendente');
    insert into public.user_roles(user_id,school_id,role) values
      ('${otherAdmin}','${ids.otherSchool}','coordenador'),('${otherStudent}','${ids.otherSchool}','aluno'),
      ('${portugueseTeacher}','${ids.school}','professor'),('${pendingGuardian}','${ids.school}','responsavel');
    insert into public.classrooms(id,school_id,name,grade,school_year) values ('${otherClass}','${ids.otherSchool}','Outra turma',6,2026);
    insert into public.teacher_assignments(school_id,classroom_id,teacher_id,subject_id)
      values('${ids.school}','${ids.classId}','${portugueseTeacher}','portugues');
    insert into public.guardian_links(school_id,guardian_id,student_id,status)
      values('${ids.school}','${pendingGuardian}','${ids.student}','pending');
    update auth.users set email='student@fixture.test' where id='${ids.student}';
  `);
}, 60_000);
afterAll(async () => { if (db) await db.close(); }, 60_000);
beforeEach(async () => {
  await db.exec(`truncate public.notifications,public.teacher_recognitions,public.learning_point_ledger,
    public.roster_import_audits,app_private.content_questions,app_private.content_import_usage;
    delete from public.enrollments;
    insert into public.enrollments(school_id,classroom_id,student_id,started_at) values
      ('${ids.school}','${ids.classId}','${ids.student}','2026-10-01T12:00:00Z'),
      ('${ids.school}','${ids.otherClass}','00000000-0000-4000-8000-000000000005','2026-10-01T12:00:00Z');
    update public.guardian_links set status='confirmed' where guardian_id='${ids.guardian}';
  `);
  await resetLearningDatabase(db);
  service = new LearningService(new SupabaseLearningRepository(postgresRpcClient(db)), { generateRecoveryQuestion: async () => question(999) }, testPolicy, testNow);
});

const recognitionSql = `select public.recognition_grant($1::uuid,$2::uuid,$3::uuid,$4::text,$5::uuid,$6::text,$7::uuid,
  $8::text,$9::text,$10::numeric,$11::integer,$12::date,$13::text,$14::timestamptz,$15::integer,$16::uuid[],
  $17::text,$18::text,$19::text,$20::text) as data`;
async function recognize(options: { key?: string; school?: string; student?: string; points?: number; reason?: string; note?: string | null; role?: "service_role" | "authenticated" | "anon" } = {}) {
  const values = [randomUUID(),options.school ?? ids.school,ids.teacher,"Nome enviado pelo chamador",ids.classId,"matematica",options.student ?? ids.student,
    options.reason ?? "ajudou_turma",options.note ?? null,options.points ?? 20,2026,"2026-10-30",options.key ?? randomUUID(),testNow().toISOString(),3,
    [pendingGuardian],"Elogio recebido","Você ajudou a turma.","Elogio para o aluno","O aluno ajudou a turma."];
  const result = await queryAs<{ data: { status: string; recognition?: { id: string; teacher_name: string } } }>(db, options.role ?? "service_role", options.role === "authenticated" ? ids.teacher : null, recognitionSql, values);
  return result.rows[0].data;
}

describe.sequential("handoff sobre todas as migrações reais (Auth emulado)", () => {
  it("grava elogio, notificações e patente uma única vez, respeita o limite e mantém elogios fora do TOP 10", async () => {
    const first = await recognize({ key: "recognition-replay" });
    expect(first.status).toBe("created");
    expect(first.recognition?.teacher_name).toBe("Professor fictício");
    const replay = await Promise.all(Array.from({ length: 6 }, () => recognize({ key: "recognition-replay" })));
    expect(replay.every((item) => item.status === "duplicate" && item.recognition?.id === first.recognition?.id)).toBe(true);
    expect((await recognize()).status).toBe("created");
    expect((await recognize()).status).toBe("created");
    expect((await recognize()).status).toBe("limit");
    const notifications = await db.query<{ user_id: string }>("select user_id from public.notifications");
    expect(notifications.rows).toHaveLength(6);
    expect(new Set(notifications.rows.map((row) => row.user_id))).toEqual(new Set([ids.student,ids.guardian]));
    const opened = await service.openActivity(actor(),"root-01");
    await service.submitAttempt(actor(),{ questionInstanceId: opened.question.questionInstanceId,selectedOptionId:"a",idempotencyKey:"after-recognition" });
    expect((await service.summary(actor(),ids.student,"2026-10-01","2026-10-31")).summary).toMatchObject({ xp:100,rankPoints:160 });
    expect((await service.ranking(actor(),ids.classId)).top10[0]).toMatchObject({ xp:100,rankPoints:100 });
    const ledger = await db.query<{ kind: string; points: string }>("select kind,points from public.learning_point_ledger where source='recognition'");
    expect(ledger.rows).toHaveLength(3);
    expect(ledger.rows.every((row) => row.kind === "annual" && Number(row.points) === 20)).toBe(true);
  });

  it("revalida atribuição e matrícula na RPC, bloqueia pontos forjados e limita leitura por papel, matéria e vínculo", async () => {
    await expect(recognize({ role:"authenticated" })).rejects.toMatchObject({ code:"42501" });
    await expect(recognize({ role:"anon" })).rejects.toMatchObject({ code:"42501" });
    await expect(recognize({ points:999 })).rejects.toThrow("RECOGNITION_INVALID_POLICY");
    await expect(recognize({ school:ids.otherSchool })).rejects.toThrow("RECOGNITION_FORBIDDEN");
    await expect(recognize({ reason:"outro",note:null })).rejects.toMatchObject({ code:"23514" });
    expect((await recognize({ student:"00000000-0000-4000-8000-000000000005" })).status).toBe("not_enrolled");
    await recognize();
    expect((await queryAs(db,"authenticated",ids.student,"select id from public.teacher_recognitions")).rows).toHaveLength(1);
    expect((await queryAs(db,"authenticated",ids.guardian,"select id from public.teacher_recognitions")).rows).toHaveLength(1);
    expect((await queryAs(db,"authenticated",portugueseTeacher,"select id from public.teacher_recognitions")).rows).toHaveLength(0);
    expect((await queryAs(db,"authenticated",otherStudent,"select id from public.teacher_recognitions")).rows).toHaveLength(0);
    expect((await queryAs(db,"authenticated",pendingGuardian,"select id from public.notifications")).rows).toHaveLength(0);
    await db.query("update public.guardian_links set status='revoked' where guardian_id=$1",[ids.guardian]);
    expect((await queryAs(db,"authenticated",ids.guardian,"select id from public.notifications")).rows).toHaveLength(0);
    await expect(queryAs(db,"authenticated",ids.student,"update public.notifications set title='forged'")).rejects.toMatchObject({ code:"42501" });
  });

  it("mantém rascunhos entre instâncias, rejeita salvamento obsoleto e impede acesso ao gabarito e alterações após publicação", async () => {
    const first = new SupabaseContentRepository(postgresRpcClient(db));
    const id=randomUUID();
    const draft=ContentQuestionSchema.parse({ id,institutionId:ids.school,classId:ids.classId,status:"rascunho",sourceType:"original",
      rootQuestionId:id,origin:{ kind:"texto" },body:question(901),answerKeySource:"ia",reviewed:false,version:1,
      createdBy:ids.teacher,createdAt:testNow().toISOString(),updatedAt:testNow().toISOString(),publishedAt:null });
    await first.insert([draft]);
    const restarted=new SupabaseContentRepository(postgresRpcClient(db));
    expect(await restarted.get(ids.school,id)).toEqual(draft);
    expect(await restarted.get(ids.otherSchool,id)).toBeNull();
    const reviewed={ ...draft,version:2,reviewed:true,answerKeySource:"professor" as const };
    expect(await restarted.replace(reviewed,1)).toBe(true);
    expect(await first.replace({ ...draft,version:2 },1)).toBe(false);
    const published={ ...reviewed,status:"publicada" as const,publishedAt:testNow().toISOString() };
    expect(await restarted.replace(published,2)).toBe(true);
    expect(await first.remove(ids.school,id,2)).toBe(false);
    expect(await first.replace({ ...published,version:3 },2)).toBe(false);
    const newId=randomUUID();
    await expect(first.insert([draft,{ ...draft,id:newId,rootQuestionId:newId }])).rejects.toMatchObject({ code:"DUPLICATE_ID" });
    expect(await restarted.get(ids.school,newId)).toBeNull();
    for (const role of ["anon","authenticated"] as const) {
      await expect(queryAs(db,role,role === "authenticated" ? ids.student : null,"select public.content_get_question($1,$2)",[ids.school,id])).rejects.toMatchObject({ code:"42501" });
      await expect(queryAs(db,role,role === "authenticated" ? ids.student : null,"select payload from app_private.content_questions")).rejects.toMatchObject({ code:"42501" });
    }
  });

  it("compartilha limite de importação entre instâncias e usa leases em vez de memória do processo", async () => {
    const key={ institutionId:ids.school,userId:ids.teacher };
    const first=new SupabaseImportQuota(postgresRpcClient(db));
    const second=new SupabaseImportQuota(postgresRpcClient(db));
    const held=await first.acquire(key,testNow());
    expect(held.ok).toBe(true);
    expect(await second.acquire(key,testNow())).toEqual({ ok:false,reason:"busy",limit:20 });
    if (held.ok) await held.release();
    for (let i=1;i<20;i++) {
      const next=await second.acquire(key,testNow());
      expect(next.ok).toBe(true);
      if (next.ok) await next.release();
    }
    expect(await first.acquire(key,testNow())).toEqual({ ok:false,reason:"daily",limit:20 });
  });

  it("transfere atomicamente, preserva matrícula em falha e recusa papéis, escola e prévia obsoleta", async () => {
    const enrollment=(await db.query<{ id:string }>("select id from public.enrollments where student_id=$1 and status='active'",[ids.student])).rows[0].id;
    const move=(user:string,destination=ids.otherClass) => queryAs<{ data:{ id:string; classroomId:string } }>(db,"authenticated",user,
      "select public.transfer_student($1,$2) as data",[enrollment,destination]);
    await expect(move(ids.student)).rejects.toMatchObject({ code:"42501" });
    await expect(move(ids.teacher)).rejects.toMatchObject({ code:"42501" });
    await expect(move(otherAdmin)).rejects.toThrow("ROSTER_STALE_PREVIEW");
    await expect(move(ids.coordinator,otherClass)).rejects.toThrow("ROSTER_DESTINATION_NOT_FOUND");
    await db.exec(`create function app_private.reject_test_transfer() returns trigger language plpgsql as $$ begin
      if new.classroom_id='${ids.otherClass}' then raise exception 'injected failure'; end if; return new; end $$;
      create trigger reject_test_transfer before insert on public.enrollments for each row execute function app_private.reject_test_transfer();`);
    try { await expect(move(ids.coordinator)).rejects.toThrow("injected failure"); }
    finally { await db.exec("drop trigger reject_test_transfer on public.enrollments; drop function app_private.reject_test_transfer()"); }
    expect((await db.query<{ status:string }>("select status from public.enrollments where id=$1",[enrollment])).rows[0].status).toBe("active");
    const moved=(await move(ids.coordinator)).rows[0].data;
    expect(moved.classroomId).toBe(ids.otherClass);
    expect((await move(ids.coordinator)).rows[0].data.id).toBe(moved.id);
    await expect(move(ids.coordinator,ids.classId)).rejects.toThrow("ROSTER_STALE_PREVIEW");
    expect((await db.query("select id from public.enrollments where student_id=$1 and status='active'",[ids.student])).rows).toHaveLength(1);
  });

  it("busca apenas os emails pedidos sem enumerar Auth e restringe a RPC ao servidor", async () => {
    const found=await queryAs<{ data:Array<{ email:string; userId:string }> }>(db,"service_role",null,
      "select public.accounts_by_emails($1::text[]) as data",[[" STUDENT@FIXTURE.TEST ","missing@fixture.test"]]);
    expect(found.rows[0].data).toEqual([{ email:"student@fixture.test",userId:ids.student }]);
    for (const role of ["anon","authenticated"] as const) {
      await expect(queryAs(db,role,role === "authenticated" ? ids.coordinator : null,
        "select public.accounts_by_emails($1::text[])",[["student@fixture.test"]])).rejects.toMatchObject({ code:"42501" });
      await expect(queryAs(db,role,role === "authenticated" ? ids.coordinator : null,
        "select app_private.account_ids_by_email($1::text[])",[["student@fixture.test"]])).rejects.toMatchObject({ code:"42501" });
    }
  });

  it("audita ator, turma e resultados parciais sem guardar senhas ou links e isola a leitura por escola", async () => {
    const planned=[{ line:1,email:"test@fixture.test",decision:"apply",accessLink:"PRIVATE_LINK",password:"PRIVATE_PASSWORD" }];
    const start=await queryAs<{ id:string }>(db,"service_role",null,
      "select public.roster_start_import_audit($1,$2,$3,$4,$5::jsonb) as id",[ids.school,ids.coordinator,ids.classId,"students",JSON.stringify(planned)]);
    const auditId=start.rows[0].id;
    const result=[{ line:1,email:"test@fixture.test",status:"failed",issue:{ code:"ROW_FAILED" },accessLink:"PRIVATE_LINK" }];
    await queryAs(db,"service_role",null,"select public.roster_finish_import_audit($1,$2,$3,$4::jsonb)",
      [ids.school,ids.coordinator,auditId,JSON.stringify(result)]);
    const own=await queryAs(db,"authenticated",ids.coordinator,"select * from public.roster_import_audits");
    expect(own.rows).toHaveLength(1);
    expect(JSON.stringify(own.rows)).not.toContain("PRIVATE_");
    expect(own.rows[0]).toMatchObject({ actor_id:ids.coordinator,classroom_id:ids.classId,status:"completed" });
    expect((await queryAs(db,"authenticated",otherAdmin,"select id from public.roster_import_audits")).rows).toHaveLength(0);
    expect((await queryAs(db,"authenticated",ids.student,"select id from public.roster_import_audits")).rows).toHaveLength(0);
    await expect(queryAs(db,"authenticated",ids.coordinator,"insert into public.roster_import_audits(school_id) values($1)",[ids.school])).rejects.toMatchObject({ code:"42501" });
  });

  it("agrega respostas e acessos reais em lote, filtra matéria do professor e não inventa dados de turma vazia", async () => {
    await service.recordAccess(actor());
    await service.recordAccess(actor());
    for (const [root,option] of [["root-01","a"],["root-02","b"]]) {
      const opened=await service.openActivity(actor(),root);
      await service.submitAttempt(actor(),{ questionInstanceId:opened.question.questionInstanceId,selectedOptionId:option,idempotencyKey:`metric-${root}` });
    }
    const portugueseRoots=[];
    for (let i=0;i<10;i++) {
      const rootQuestionId=`portuguese-${i}`;
      portugueseRoots.push(rootQuestionId);
      await service.registerActivity(coordinator(),ids.classId,{ rootQuestionId,body:{ ...question(800+i),subjectId:"portugues",skillCodes:["EF06LP01"] },contentVersion:1,reviewed:true });
    }
    await service.activate(coordinator(),ids.classId,"portugues",portugueseRoots);
    const opened=await service.openActivity(actor(),portugueseRoots[0]);
    await service.submitAttempt(actor(),{ questionInstanceId:opened.question.questionInstanceId,selectedOptionId:"a",idempotencyKey:"metric-portuguese" });
    await db.query("delete from public.enrollments where classroom_id=$1",[ids.otherClass]);
    const classes=await service.classMetrics(coordinator(),[ids.classId,ids.otherClass],"2026-10-30","2026-10-31");
    expect(classes.find((item) => item.classroomId===ids.classId)).toMatchObject({ studentsEnrolled:1,attempts:3,correct:2,correctPercent:66.67,accessDays:1,eligibleDays:2,frequencyPercent:50 });
    expect(classes.find((item) => item.classroomId===ids.otherClass)).toMatchObject({ studentsEnrolled:0,attempts:0,correct:0,correctPercent:0,eligibleDays:0,frequencyPercent:0 });
    expect((await service.classMetrics(teacher(),[ids.classId],"2026-10-30","2026-10-31"))[0]).toMatchObject({ attempts:2,correct:1,correctPercent:50 });
    await expect(service.classMetrics(actor(),[ids.classId],"2026-10-30","2026-10-31")).rejects.toMatchObject({ status:403 });
    await expect(service.classMetrics(teacher(),[ids.otherClass],"2026-10-30","2026-10-31")).rejects.toMatchObject({ status:404 });
    await expect(service.classMetrics(coordinator(),[otherClass],"2026-10-30","2026-10-31")).rejects.toMatchObject({ status:404 });
  });
});
