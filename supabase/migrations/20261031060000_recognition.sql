-- Elogio do professor por atitude em aula (docs/RECONHECIMENTO.md).
-- Vale só pontos anuais de patente: nunca XP semanal nem o TOP 10 da turma.
-- Escrita só pela RPC recognition_grant (service_role), chamada depois de o serviço validar a sessão.
begin;

create table public.teacher_recognitions (
  id uuid primary key,
  school_id uuid not null references public.schools(id),
  teacher_id uuid not null,
  teacher_name text not null check (char_length(btrim(teacher_name)) between 1 and 200),
  classroom_id uuid not null,
  subject_id text not null references public.subjects(id),
  student_id uuid not null,
  reason text not null check (reason in ('pergunta_curiosa','ajudou_turma','organizou_sala','colaboracao','superacao','outro')),
  note text check (note is null or char_length(btrim(note)) between 1 and 140),
  points numeric(14,2) not null check (points > 0 and points <= 100 and points <> 'NaN'::numeric),
  school_year smallint not null check (school_year between 2000 and 2200),
  award_day date not null,
  idempotency_key text not null check (char_length(idempotency_key) between 8 and 128),
  created_at timestamptz not null default now(),
  foreign key (teacher_id, school_id) references public.profiles(id, school_id),
  foreign key (student_id, school_id) references public.profiles(id, school_id),
  foreign key (classroom_id, school_id) references public.classrooms(id, school_id),
  check (reason <> 'outro' or note is not null),
  check (teacher_id <> student_id),
  unique (teacher_id, idempotency_key, student_id),
  unique (id, student_id, school_id)
);
create index teacher_recognitions_daily_idx
  on public.teacher_recognitions (school_id, teacher_id, student_id, award_day);
create index teacher_recognitions_student_idx
  on public.teacher_recognitions (school_id, student_id, created_at desc);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id),
  user_id uuid not null,
  student_id uuid not null,
  kind text not null check (kind in ('recognition')),
  recognition_id uuid not null references public.teacher_recognitions(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  body text not null check (char_length(body) between 1 and 600),
  created_at timestamptz not null default now(),
  read_at timestamptz,
  foreign key (user_id, school_id) references public.profiles(id, school_id),
  foreign key (student_id, school_id) references public.profiles(id, school_id),
  unique (recognition_id, user_id)
);
create index notifications_inbox_idx
  on public.notifications (school_id, user_id, read_at nulls first, created_at desc);

alter table public.teacher_recognitions enable row level security;
alter table public.notifications enable row level security;

-- Aluno (o próprio), responsável confirmado e coordenação da escola leem os elogios do aluno.
-- Professor lê só os pares (turma, matéria) atribuídos a ele, igual a RecognitionService.listForStudent.
create policy teacher_recognitions_read on public.teacher_recognitions for select to authenticated
using (
  school_id = app_private.current_school_id() and (
    (student_id = auth.uid() and app_private.has_role(school_id, 'aluno'))
    or app_private.is_guardian(student_id, school_id)
    or app_private.has_role(school_id, 'coordenador')
    or (app_private.has_role(school_id, 'professor') and exists (
      select 1 from public.teacher_assignments ta
      where ta.teacher_id = auth.uid() and ta.school_id = teacher_recognitions.school_id
        and ta.classroom_id = teacher_recognitions.classroom_id and ta.subject_id = teacher_recognitions.subject_id
    ))
  )
);
-- Cada usuário (aluno ou responsável) vê e marca como lidas apenas as próprias notificações.
create policy notifications_own_read on public.notifications for select to authenticated
using (user_id = auth.uid() and school_id = app_private.current_school_id());
create policy notifications_own_mark_read on public.notifications for update to authenticated
using (user_id = auth.uid() and school_id = app_private.current_school_id())
with check (user_id = auth.uid() and school_id = app_private.current_school_id());

revoke all on public.teacher_recognitions, public.notifications from public, anon, authenticated;
grant select on public.teacher_recognitions, public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;
grant all on public.teacher_recognitions, public.notifications to service_role;

-- Livro de pontos: o elogio entra como crédito anual sem tentativa.
-- unique (attempt_id, kind) continua valendo para tentativas; com attempt_id nulo o Postgres não compara
-- as linhas, e a unicidade do elogio fica em recognition_id unique. A FK composta de attempt_id é MATCH SIMPLE.
alter table public.learning_point_ledger
  alter column attempt_id drop not null,
  alter column root_question_id drop not null,
  add column source text not null default 'attempt' check (source in ('attempt', 'recognition')),
  add column recognition_id uuid unique;

alter table public.learning_point_ledger
  add constraint learning_point_ledger_recognition_fk
    foreign key (recognition_id, student_id, school_id)
    references public.teacher_recognitions(id, student_id, school_id),
  add constraint learning_point_ledger_source_ref check (
    (source = 'attempt' and attempt_id is not null and root_question_id is not null and recognition_id is null)
    or (source = 'recognition' and kind = 'annual' and attempt_id is null and recognition_id is not null
        and keep_after_rotation)
  );

comment on table public.learning_point_ledger is 'Append-only application credits. source=attempt: one XP and annual entry per finalized attempt. source=recognition: one annual entry per teacher recognition, outside the class ranking. Rotation does not delete annual entries.';

-- O ranking (XP e desempate) usa só pontos de tentativa. Elogio nunca muda o TOP 10.
-- Corpo igual ao de 20261031030000_learning.sql com l.source = 'attempt' nos dois filtros.
-- create or replace mantém os revoke/grant já aplicados à função.
create or replace function public.learning_class_ranking(p_school uuid, p_class uuid)
returns jsonb language sql stable security definer set search_path = pg_catalog
as $$
  select coalesce(jsonb_agg(to_jsonb(ranked) order by ranked.xp desc,ranked."rankPoints" desc,ranked."studentId"),'[]'::jsonb)
  from (
    select p.id as "studentId",p.full_name as name,
      coalesce(sum(l.points) filter (where l.kind = 'xp' and l.source = 'attempt' and l.classroom_id = p_class
        and (l.keep_after_rotation or exists (
          select 1 from app_private.learning_catalogs c,jsonb_array_elements(c.payload->'activities') a
          where c.classroom_id = p_class and c.school_id = p_school and (a->>'active')::boolean and a->>'rootQuestionId' = l.root_question_id
        ))),0) as xp,
      coalesce(sum(l.points) filter (where l.kind = 'annual' and l.source = 'attempt' and l.school_year = cls.school_year),0) as "rankPoints"
    from public.profiles p
    join public.enrollments e on e.student_id = p.id and e.school_id = p.school_id and e.classroom_id = p_class and e.status = 'active'
    join public.classrooms cls on cls.id = e.classroom_id and cls.school_id = e.school_id
    left join public.learning_point_ledger l on l.student_id = p.id and l.school_id = p.school_id
    where p.school_id = p_school
    group by p.id,p.full_name
    order by xp desc,"rankPoints" desc,p.id limit 10
  ) ranked;
$$;

-- Atômica por professor+aluno+dia: o lock impede que dois toques simultâneos passem do limite.
-- Retorna {status:'created'|'duplicate', recognition}, {status:'limit'} ou {status:'not_enrolled'}.
create function public.recognition_grant(
  p_id uuid, p_school uuid, p_teacher uuid, p_teacher_name text, p_class uuid, p_subject text,
  p_student uuid, p_reason text, p_note text, p_points numeric, p_school_year smallint, p_day date,
  p_key text, p_created_at timestamptz, p_limit integer, p_guardian_ids uuid[],
  p_student_title text, p_student_body text, p_guardian_title text, p_guardian_body text
) returns jsonb language plpgsql security definer set search_path = pg_catalog
as $$
declare existing public.teacher_recognitions%rowtype; created public.teacher_recognitions%rowtype;
  class_year smallint; total integer;
begin
  -- Regras confirmadas: 20 pontos anuais, até 3 por professor por aluno por dia de São Paulo.
  if p_points is distinct from 20 or p_limit is null or p_limit < 1 or p_limit > 3
    or p_day is distinct from (p_created_at at time zone 'America/Sao_Paulo')::date then
    raise exception 'RECOGNITION_INVALID';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_teacher::text || ':' || p_student::text || ':' || p_day::text, 0));
  select * into existing from public.teacher_recognitions
    where teacher_id = p_teacher and idempotency_key = p_key and student_id = p_student and school_id = p_school;
  if found then
    return jsonb_build_object('status', 'duplicate', 'recognition', to_jsonb(existing));
  end if;
  if not exists (
    select 1 from public.teacher_assignments ta
    where ta.teacher_id = p_teacher and ta.school_id = p_school
      and ta.classroom_id = p_class and ta.subject_id = p_subject
  ) then raise exception 'RECOGNITION_FORBIDDEN'; end if;
  select c.school_year into class_year from public.classrooms c where c.id = p_class and c.school_id = p_school;
  if class_year is distinct from p_school_year then raise exception 'RECOGNITION_INVALID'; end if;
  perform 1 from public.enrollments e
    where e.student_id = p_student and e.school_id = p_school and e.classroom_id = p_class and e.status = 'active'
    for share;
  if not found then return jsonb_build_object('status', 'not_enrolled'); end if;
  select count(*) into total from public.teacher_recognitions
    where school_id = p_school and teacher_id = p_teacher and student_id = p_student and award_day = p_day;
  if total >= p_limit then return jsonb_build_object('status', 'limit'); end if;

  insert into public.teacher_recognitions(id, school_id, teacher_id, teacher_name, classroom_id, subject_id, student_id,
    reason, note, points, school_year, award_day, idempotency_key, created_at)
  values (p_id, p_school, p_teacher, p_teacher_name, p_class, p_subject, p_student,
    p_reason, p_note, p_points, p_school_year, p_day, p_key, p_created_at)
  returning * into created;

  insert into public.notifications(school_id, user_id, student_id, kind, recognition_id, title, body, created_at)
  values (p_school, p_student, p_student, 'recognition', created.id, p_student_title, p_student_body, p_created_at);
  -- Só responsável com vínculo confirmado no banco; a lista do serviço apenas restringe.
  insert into public.notifications(school_id, user_id, student_id, kind, recognition_id, title, body, created_at)
  select distinct p_school, g.guardian_id, p_student, 'recognition', created.id, p_guardian_title, p_guardian_body, p_created_at
  from public.guardian_links g
  where g.school_id = p_school and g.student_id = p_student and g.status = 'confirmed'
    and g.guardian_id = any(coalesce(p_guardian_ids, '{}'::uuid[]));

  insert into public.learning_point_ledger(id, school_id, student_id, attempt_id, classroom_id, root_question_id,
    subject_id, school_year, kind, points, keep_after_rotation, source, recognition_id)
  values (pg_catalog.gen_random_uuid(), p_school, p_student, null, p_class, null,
    p_subject, p_school_year, 'annual', p_points, true, 'recognition', created.id);

  return jsonb_build_object('status', 'created', 'recognition', to_jsonb(created));
end;
$$;

revoke all on function public.recognition_grant(uuid, uuid, uuid, text, uuid, text, uuid, text, text, numeric,
  smallint, date, text, timestamptz, integer, uuid[], text, text, text, text) from public, anon, authenticated;
grant execute on function public.recognition_grant(uuid, uuid, uuid, text, uuid, text, uuid, text, text, numeric,
  smallint, date, text, timestamptz, integer, uuid[], text, text, text, text) to service_role;

comment on table public.teacher_recognitions is 'Elogio do professor por atitude em aula. Vale só pontos anuais de patente. Até 3 por aluno por dia por professor (dia de São Paulo).';
comment on table public.notifications is 'Avisos por usuário. O usuário lê e marca read_at; criação só pela RPC recognition_grant.';

commit;
