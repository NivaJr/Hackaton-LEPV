-- Atomic recognitions, notifications and annual credits. No XP or TOP 10 credit.
begin;

create table public.teacher_recognitions (
  id uuid primary key,
  school_id uuid not null references public.schools(id),
  teacher_id uuid not null,
  teacher_name text not null,
  classroom_id uuid not null,
  subject_id text not null references public.subjects(id),
  student_id uuid not null,
  reason text not null check (reason in ('pergunta_curiosa','ajudou_turma','organizou_sala','colaboracao','superacao','outro')),
  note text check (char_length(note) <= 140),
  points numeric(14,2) not null default 20 check (points = 20),
  school_year smallint not null check (school_year between 2000 and 2200),
  award_day date not null,
  idempotency_key text not null check (char_length(idempotency_key) between 8 and 128),
  created_at timestamptz not null default now(),
  foreign key (teacher_id,school_id) references public.profiles(id,school_id),
  foreign key (student_id,school_id) references public.profiles(id,school_id),
  foreign key (classroom_id,school_id) references public.classrooms(id,school_id),
  check (reason <> 'outro' or char_length(btrim(coalesce(note,''))) > 0),
  unique (school_id,teacher_id,student_id,idempotency_key),
  unique (id,student_id,school_id)
);
create index recognitions_daily_limit on public.teacher_recognitions(school_id,teacher_id,student_id,award_day);
create index recognitions_student_year on public.teacher_recognitions(school_id,student_id,school_year,created_at desc);
create index recognitions_class_subject on public.teacher_recognitions(classroom_id,school_id,subject_id);
create index recognitions_subject on public.teacher_recognitions(subject_id);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id),
  user_id uuid not null,
  student_id uuid not null,
  kind text not null check (kind = 'recognition'),
  recognition_id uuid not null,
  title text not null check (char_length(title) between 1 and 300),
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now(),
  read_at timestamptz,
  foreign key (user_id,school_id) references public.profiles(id,school_id),
  foreign key (recognition_id,student_id,school_id) references public.teacher_recognitions(id,student_id,school_id),
  unique (recognition_id,user_id)
);
create index notifications_inbox on public.notifications(school_id,user_id,created_at desc);
create index notifications_student on public.notifications(student_id,school_id);

alter table public.teacher_recognitions enable row level security;
alter table public.notifications enable row level security;
revoke all on public.teacher_recognitions,public.notifications from public,anon,authenticated;
grant select on public.teacher_recognitions,public.notifications to authenticated;
grant update(read_at) on public.notifications to authenticated;
grant select,insert on public.teacher_recognitions,public.notifications to service_role;
grant update(read_at) on public.notifications to service_role;

create policy recognitions_scoped_read on public.teacher_recognitions for select to authenticated using (
  school_id = (select app_private.current_school_id()) and (
    student_id = (select auth.uid())
    or app_private.has_role(school_id,'coordenador')
    or exists (select 1 from public.guardian_links g where g.school_id = teacher_recognitions.school_id
      and g.student_id = teacher_recognitions.student_id and g.guardian_id = (select auth.uid()) and g.status = 'confirmed')
    or exists (select 1 from public.teacher_assignments t join public.enrollments e
      on e.classroom_id=t.classroom_id and e.school_id=t.school_id and e.status='active'
      where t.teacher_id=(select auth.uid()) and t.school_id=teacher_recognitions.school_id
      and t.classroom_id=teacher_recognitions.classroom_id and t.subject_id=teacher_recognitions.subject_id
      and e.student_id=teacher_recognitions.student_id)
  )
);
create policy notifications_own_read on public.notifications for select to authenticated using (
  user_id = (select auth.uid()) and school_id = (select app_private.current_school_id())
  and (user_id=student_id or exists (select 1 from public.guardian_links g
    where g.school_id=notifications.school_id and g.student_id=notifications.student_id
    and g.guardian_id=(select auth.uid()) and g.status='confirmed'))
);
create policy notifications_own_update on public.notifications for update to authenticated
using (user_id=(select auth.uid()) and school_id=(select app_private.current_school_id()))
with check (user_id=(select auth.uid()) and school_id=(select app_private.current_school_id()));

alter table public.learning_point_ledger
  alter column attempt_id drop not null,
  alter column root_question_id drop not null,
  add column source text not null default 'attempt' check (source in ('attempt','recognition')),
  add column recognition_id uuid unique,
  add constraint learning_ledger_recognition_fk foreign key (recognition_id,student_id,school_id)
    references public.teacher_recognitions(id,student_id,school_id),
  add constraint learning_ledger_source_ref check (
    (source='attempt' and attempt_id is not null and root_question_id is not null and recognition_id is null)
    or (source='recognition' and kind='annual' and attempt_id is null and root_question_id is null
      and recognition_id is not null and keep_after_rotation)
  );
grant insert on public.learning_point_ledger to service_role;
create index learning_ledger_subject on public.learning_point_ledger(subject_id);
create index learning_ledger_attempt_scope on public.learning_point_ledger(attempt_id,student_id,school_id);
create index learning_ledger_class_scope on public.learning_point_ledger(classroom_id,school_id);

create function public.recognition_grant(
  p_id uuid,p_school uuid,p_teacher uuid,p_teacher_name text,p_class uuid,p_subject text,p_student uuid,
  p_reason text,p_note text,p_points numeric,p_school_year integer,p_day date,p_key text,p_created_at timestamptz,
  p_limit integer,p_guardian_ids uuid[],p_student_title text,p_student_body text,p_guardian_title text,p_guardian_body text
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare existing public.teacher_recognitions%rowtype; granted public.teacher_recognitions%rowtype; teacher_name text;
begin
  if p_points is distinct from 20 or p_limit is distinct from 3
    or p_day is distinct from (p_created_at at time zone 'America/Sao_Paulo')::date then
    raise exception 'RECOGNITION_INVALID_POLICY';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_school::text||p_teacher::text||p_student::text||p_day::text,0));
  select * into existing from public.teacher_recognitions where school_id=p_school and teacher_id=p_teacher
    and student_id=p_student and idempotency_key=p_key;
  if found then
    if (existing.classroom_id,existing.subject_id,existing.reason,coalesce(existing.note,''))
      is distinct from (p_class,p_subject,p_reason,coalesce(p_note,'')) then raise exception 'RECOGNITION_IDEMPOTENCY_CONFLICT'; end if;
    return pg_catalog.jsonb_build_object('status','duplicate','recognition',pg_catalog.to_jsonb(existing));
  end if;
  select p.full_name into teacher_name from public.profiles p
    join public.user_roles r on r.user_id=p.id and r.school_id=p.school_id and r.role='professor'
    join public.teacher_assignments t on t.teacher_id=p.id and t.school_id=p.school_id
    join public.classrooms c on c.id=t.classroom_id and c.school_id=t.school_id
    where p.id=p_teacher and p.school_id=p_school and t.classroom_id=p_class and t.subject_id=p_subject
      and c.school_year=p_school_year;
  if not found then raise exception 'RECOGNITION_FORBIDDEN'; end if;
  if not exists (select 1 from public.enrollments e join public.user_roles r
    on r.user_id=e.student_id and r.school_id=e.school_id and r.role='aluno'
    where e.school_id=p_school and e.classroom_id=p_class and e.student_id=p_student and e.status='active') then
    return pg_catalog.jsonb_build_object('status','not_enrolled');
  end if;
  if (select count(*) from public.teacher_recognitions where school_id=p_school and teacher_id=p_teacher
    and student_id=p_student and award_day=p_day) >= 3 then return pg_catalog.jsonb_build_object('status','limit'); end if;
  insert into public.teacher_recognitions(id,school_id,teacher_id,teacher_name,classroom_id,subject_id,student_id,
    reason,note,points,school_year,award_day,idempotency_key,created_at)
  values(p_id,p_school,p_teacher,teacher_name,p_class,p_subject,p_student,p_reason,p_note,20,p_school_year,p_day,p_key,p_created_at)
  returning * into granted;
  insert into public.notifications(school_id,user_id,student_id,kind,recognition_id,title,body,created_at)
  values(p_school,p_student,p_student,'recognition',p_id,p_student_title,p_student_body,p_created_at);
  -- Recipients are re-read from confirmed links; caller-supplied IDs cannot grant access.
  insert into public.notifications(school_id,user_id,student_id,kind,recognition_id,title,body,created_at)
  select p_school,g.guardian_id,p_student,'recognition',p_id,p_guardian_title,p_guardian_body,p_created_at
    from public.guardian_links g where g.school_id=p_school and g.student_id=p_student and g.status='confirmed';
  insert into public.learning_point_ledger(id,school_id,student_id,attempt_id,classroom_id,root_question_id,
    subject_id,school_year,kind,points,keep_after_rotation,source,recognition_id)
  values(gen_random_uuid(),p_school,p_student,null,p_class,null,p_subject,p_school_year,'annual',20,true,'recognition',p_id);
  return pg_catalog.jsonb_build_object('status','created','recognition',pg_catalog.to_jsonb(granted));
end;
$$;
revoke all on function public.recognition_grant(uuid,uuid,uuid,text,uuid,text,uuid,text,text,numeric,integer,date,text,timestamptz,integer,uuid[],text,text,text,text) from public,anon,authenticated;
grant execute on function public.recognition_grant(uuid,uuid,uuid,text,uuid,text,uuid,text,text,numeric,integer,date,text,timestamptz,integer,uuid[],text,text,text,text) to service_role;

create function public.learning_recognition_points(p_school uuid,p_student uuid,p_year integer,p_subjects text[] default null)
returns numeric language sql stable security invoker set search_path = '' as $$
  select coalesce(sum(points),0) from public.teacher_recognitions
    where school_id=p_school and student_id=p_student and school_year=p_year
    and (p_subjects is null or subject_id=any(p_subjects));
$$;
revoke all on function public.learning_recognition_points(uuid,uuid,integer,text[]) from public,anon,authenticated;
grant execute on function public.learning_recognition_points(uuid,uuid,integer,text[]) to service_role;

create or replace function public.learning_class_ranking(p_school uuid,p_class uuid)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select coalesce(jsonb_agg(to_jsonb(ranked) order by ranked.xp desc,ranked."rankPoints" desc,ranked."studentId"),'[]'::jsonb)
  from (
    select p.id as "studentId",p.full_name as name,
      coalesce(sum(l.points) filter (where l.kind='xp' and l.source='attempt' and l.classroom_id=p_class
        and (l.keep_after_rotation or exists (
          select 1 from app_private.learning_catalogs c,jsonb_array_elements(c.payload->'activities') a
          where c.classroom_id=p_class and c.school_id=p_school and (a->>'active')::boolean and a->>'rootQuestionId'=l.root_question_id
        ))),0) as xp,
      coalesce(sum(l.points) filter (where l.kind='annual' and l.source='attempt' and l.school_year=cls.school_year),0) as "rankPoints"
    from public.profiles p
    join public.enrollments e on e.student_id=p.id and e.school_id=p.school_id and e.classroom_id=p_class and e.status='active'
    join public.classrooms cls on cls.id=e.classroom_id and cls.school_id=e.school_id
    left join public.learning_point_ledger l on l.student_id=p.id and l.school_id=p.school_id
    where p.school_id=p_school group by p.id,p.full_name
    order by xp desc,"rankPoints" desc,p.id limit 10
  ) ranked;
$$;
comment on table public.teacher_recognitions is '20 annual rank points, at most three per teacher/student/Brasilia day. Never XP or TOP 10 tie-break credit.';
comment on table public.notifications is 'Recognition inbox scoped to the student or a currently confirmed guardian. No credentials or access links.';
commit;
