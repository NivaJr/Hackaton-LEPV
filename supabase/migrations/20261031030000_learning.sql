-- Learning snapshots are not the content bank. Original/review ownership remains with content.
-- No scoring formula is duplicated here: this transaction persists server-calculated effects.
begin;

create table app_private.learning_catalogs (
  classroom_id uuid primary key,
  school_id uuid not null,
  revision bigint not null default 0 check (revision >= 0),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  foreign key (classroom_id, school_id) references public.classrooms(id, school_id)
);
create table app_private.learning_student_states (
  student_id uuid primary key,
  school_id uuid not null,
  revision bigint not null default 0 check (revision >= 0),
  payload jsonb not null default '{"instances":[],"attempts":[],"recoveries":[],"ledger":[],"accessDays":[]}',
  foreign key (student_id, school_id) references public.profiles(id, school_id),
  check (jsonb_typeof(payload) = 'object')
);

create table public.learning_attempts (
  id uuid primary key,
  school_id uuid not null,
  student_id uuid not null,
  classroom_id uuid not null,
  question_instance_id uuid not null,
  root_question_id text not null,
  subject_id text not null references public.subjects(id),
  selected_option_id text not null,
  idempotency_key text not null check (char_length(idempotency_key) between 8 and 128),
  source text not null check (source in ('original', 'recovery')),
  result jsonb not null check (jsonb_typeof(result) = 'object'),
  created_at timestamptz not null,
  foreign key (student_id, school_id) references public.profiles(id, school_id),
  foreign key (classroom_id, school_id) references public.classrooms(id, school_id),
  unique (student_id, question_instance_id),
  unique (student_id, idempotency_key),
  unique (id, student_id, school_id)
);
create index learning_attempts_student_date on public.learning_attempts(student_id, created_at);

create table public.learning_point_ledger (
  id uuid primary key,
  school_id uuid not null,
  student_id uuid not null,
  attempt_id uuid not null,
  classroom_id uuid not null,
  root_question_id text not null,
  subject_id text not null references public.subjects(id),
  school_year smallint not null check (school_year between 2000 and 2200),
  kind text not null check (kind in ('xp', 'annual')),
  points numeric(14,2) not null check (points >= 0 and points <> 'NaN'::numeric),
  keep_after_rotation boolean not null,
  foreign key (attempt_id, student_id, school_id) references public.learning_attempts(id, student_id, school_id),
  foreign key (classroom_id, school_id) references public.classrooms(id, school_id),
  unique (attempt_id, kind)
);
create index learning_points_projection on public.learning_point_ledger(school_id, student_id, kind, school_year);

alter table app_private.learning_catalogs enable row level security;
alter table app_private.learning_student_states enable row level security;
alter table public.learning_attempts enable row level security;
alter table public.learning_point_ledger enable row level security;

revoke all on app_private.learning_catalogs, app_private.learning_student_states,
  public.learning_attempts, public.learning_point_ledger from public, anon, authenticated;
grant select on public.learning_attempts, public.learning_point_ledger to authenticated;
grant select on app_private.learning_catalogs, app_private.learning_student_states,
  public.learning_attempts, public.learning_point_ledger to service_role;

-- Only finalized answers are exposed here. Question snapshots/keys have no browser grants.
create policy learning_attempts_own_read on public.learning_attempts for select to authenticated
using (student_id = auth.uid() and school_id = app_private.current_school_id()
  and app_private.has_role(school_id, 'aluno'));
create policy learning_points_own_read on public.learning_point_ledger for select to authenticated
using (student_id = auth.uid() and school_id = app_private.current_school_id()
  and app_private.has_role(school_id, 'aluno'));

create function public.learning_read_catalog(p_school uuid, p_class uuid)
returns jsonb language plpgsql security definer set search_path = pg_catalog
as $$
declare c public.classrooms%rowtype; record app_private.learning_catalogs%rowtype;
begin
  select * into c from public.classrooms where id = p_class and school_id = p_school;
  if not found then raise exception 'LEARNING_NOT_FOUND'; end if;
  insert into app_private.learning_catalogs(classroom_id, school_id, payload)
  values (c.id, c.school_id, jsonb_build_object('classId',c.id,'institutionId',c.school_id,
    'grade',c.grade,'schoolYear',c.school_year,'activities','[]'::jsonb,'rotations','[]'::jsonb))
  on conflict (classroom_id) do nothing;
  select * into record from app_private.learning_catalogs where classroom_id = c.id and school_id = c.school_id;
  if record.payload->>'grade' <> c.grade::text or record.payload->>'schoolYear' <> c.school_year::text then
    raise exception 'LEARNING_CLASS_CHANGED';
  end if;
  return jsonb_build_object('catalog',record.payload,'version',record.revision);
end;
$$;

create function public.learning_read_student(p_school uuid, p_student uuid)
returns jsonb language plpgsql security definer set search_path = pg_catalog
as $$
declare scope record; catalog jsonb; account app_private.learning_student_states%rowtype; preferences jsonb;
begin
  select p.full_name,e.classroom_id into scope from public.profiles p
  join public.user_roles r on r.user_id = p.id and r.school_id = p.school_id and r.role = 'aluno'
  join public.enrollments e on e.student_id = p.id and e.school_id = p.school_id and e.status = 'active'
  where p.id = p_student and p.school_id = p_school;
  if not found then raise exception 'LEARNING_NOT_FOUND'; end if;
  catalog := public.learning_read_catalog(p_school, scope.classroom_id);
  insert into app_private.learning_student_states(student_id,school_id) values (p_student,p_school)
  on conflict (student_id) do nothing;
  select * into account from app_private.learning_student_states where student_id = p_student and school_id = p_school;
  if not found then raise exception 'LEARNING_NOT_FOUND'; end if;
  select jsonb_build_object('studentId',student_id,'interests',interests,'context',context,'version',version,
    'updatedAt',to_char(updated_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')) into preferences
  from public.student_preferences where student_id = p_student and school_id = p_school;
  return jsonb_build_object('studentId',p_student,'institutionId',p_school,'studentName',scope.full_name,
    'preferences',preferences,'catalog',catalog->'catalog','catalogVersion',catalog->'version',
    'state',account.payload,'stateVersion',account.revision);
end;
$$;

create function public.learning_commit_student(
  p_school uuid, p_student uuid, p_expected_version bigint, p_catalog_version bigint, p_state jsonb
) returns boolean language plpgsql security definer set search_path = pg_catalog
as $$
declare current_class uuid; catalog app_private.learning_catalogs%rowtype;
  account app_private.learning_student_states%rowtype; item jsonb; previous jsonb; instance jsonb; result jsonb;
begin
  -- Lock membership, class catalog, then student in this order. Rotation uses the same catalog lock.
  select e.classroom_id into current_class from public.enrollments e
  join public.user_roles r on r.user_id = e.student_id and r.school_id = e.school_id and r.role = 'aluno'
  where e.student_id = p_student and e.school_id = p_school and e.status = 'active' for share of e;
  if not found then raise exception 'LEARNING_NOT_FOUND'; end if;
  select * into catalog from app_private.learning_catalogs
    where classroom_id = current_class and school_id = p_school for update;
  if not found or catalog.revision <> p_catalog_version then return false; end if;
  select * into account from app_private.learning_student_states
    where student_id = p_student and school_id = p_school for update;
  if not found or account.revision <> p_expected_version then return false; end if;

  if jsonb_typeof(p_state->'instances') is distinct from 'array'
    or jsonb_typeof(p_state->'attempts') is distinct from 'array'
    or jsonb_typeof(p_state->'recoveries') is distinct from 'array'
    or jsonb_typeof(p_state->'ledger') is distinct from 'array'
    or jsonb_typeof(p_state->'accessDays') is distinct from 'array' then raise exception 'LEARNING_INVALID_STATE'; end if;
  -- Existing immutable facts cannot be rewritten or removed by a later commit.
  if not ((p_state->'instances') @> (account.payload->'instances'))
    or not ((p_state->'attempts') @> (account.payload->'attempts'))
    or not ((p_state->'ledger') @> (account.payload->'ledger'))
    or not ((p_state->'accessDays') @> (account.payload->'accessDays')) then raise exception 'LEARNING_IMMUTABLE_HISTORY'; end if;
  if (select count(*) <> count(distinct value->'question'->>'questionInstanceId') from jsonb_array_elements(p_state->'instances'))
    or (select count(*) <> count(distinct value->'result'->>'attemptId') from jsonb_array_elements(p_state->'attempts'))
    or (select count(*) <> count(distinct value->>'id') from jsonb_array_elements(p_state->'ledger'))
    or (select count(*) <> count(distinct value->>'id') from jsonb_array_elements(p_state->'recoveries')) then raise exception 'LEARNING_DUPLICATE_FACT'; end if;

  for previous in select value from jsonb_array_elements(account.payload->'recoveries') loop
    select value into item from jsonb_array_elements(p_state->'recoveries') where value->>'id' = previous->>'id';
    if item is null or item->>'rootQuestionId' <> previous->>'rootQuestionId'
      or item->>'classId' <> previous->>'classId'
      or (previous->'state'->>'status' <> 'in_progress' and item->'state' <> previous->'state') then
      raise exception 'LEARNING_RECOVERY_CLOSED';
    end if;
  end loop;

  for item in select value from jsonb_array_elements(p_state->'instances') loop
    if not (account.payload->'instances' @> jsonb_build_array(item)) then
      if item->>'classId' <> current_class::text or not exists (
        select 1 from jsonb_array_elements(catalog.payload->'activities') a
        where a->>'rootQuestionId' = item->'question'->>'rootQuestionId' and (a->>'active')::boolean
      ) then raise exception 'LEARNING_INACTIVE_ACTIVITY'; end if;
    end if;
  end loop;

  for item in select value from jsonb_array_elements(p_state->'attempts') loop
    result := item->'result';
    select value into instance from jsonb_array_elements(p_state->'instances')
      where value->'question'->>'questionInstanceId' = result->>'questionInstanceId';
    if instance is null or item->>'classId' <> instance->>'classId'
      or item->>'rootQuestionId' <> instance->'question'->>'rootQuestionId'
      or item->>'subjectId' <> instance->'question'->>'subjectId'
      or not exists (select 1 from jsonb_array_elements(instance->'question'->'options') o where o->>'id' = item->>'selectedOptionId')
      or (result->>'isCorrect')::boolean is distinct from (item->>'selectedOptionId' = instance->'answerKey'->>'correctOptionId')
      or (result->>'xpAwarded')::numeric is distinct from (case when (result->>'isCorrect')::boolean then (instance->>'nominalPoints')::numeric else 0 end)
      or result->>'rankPointsAwarded' <> result->>'xpAwarded' then raise exception 'LEARNING_INVALID_RESULT'; end if;
    if not (account.payload->'attempts' @> jsonb_build_array(item)) and (item->>'classId' <> current_class::text or not exists (
      select 1 from jsonb_array_elements(catalog.payload->'activities') a
      where a->>'rootQuestionId' = item->>'rootQuestionId' and (a->>'active')::boolean
    )) then raise exception 'LEARNING_INACTIVE_ACTIVITY'; end if;
    insert into public.learning_attempts(id,school_id,student_id,classroom_id,question_instance_id,root_question_id,
      subject_id,selected_option_id,idempotency_key,source,result,created_at)
    values ((result->>'attemptId')::uuid,p_school,p_student,(item->>'classId')::uuid,(result->>'questionInstanceId')::uuid,
      item->>'rootQuestionId',item->>'subjectId',item->>'selectedOptionId',item->>'idempotencyKey',item->>'source',result,(item->>'createdAt')::timestamptz)
    on conflict (id) do nothing;
  end loop;

  for item in select value from jsonb_array_elements(p_state->'ledger') loop
    select a.result into result from public.learning_attempts a
      where a.id = (item->>'attemptId')::uuid and a.student_id = p_student and a.school_id = p_school
      and a.classroom_id = (item->>'classId')::uuid and a.root_question_id = item->>'rootQuestionId' and a.subject_id = item->>'subjectId';
    if result is null or (item->>'points')::numeric is distinct from
      (result->>(case when item->>'kind' = 'xp' then 'xpAwarded' else 'rankPointsAwarded' end))::numeric then
      raise exception 'LEARNING_INVALID_CREDIT';
    end if;
    insert into public.learning_point_ledger(id,school_id,student_id,attempt_id,classroom_id,root_question_id,
      subject_id,school_year,kind,points,keep_after_rotation)
    values ((item->>'id')::uuid,p_school,p_student,(item->>'attemptId')::uuid,(item->>'classId')::uuid,item->>'rootQuestionId',
      item->>'subjectId',(item->>'schoolYear')::smallint,item->>'kind',(item->>'points')::numeric,(item->>'keepAfterRotation')::boolean)
    on conflict (id) do nothing;
  end loop;
  if exists (select 1 from public.learning_attempts a where a.student_id = p_student and a.school_id = p_school
    and (select count(*) from public.learning_point_ledger l where l.attempt_id = a.id) <> 2) then raise exception 'LEARNING_INCOMPLETE_CREDIT'; end if;
  update app_private.learning_student_states set revision = revision + 1, payload = p_state where student_id = p_student and school_id = p_school;
  return true;
end;
$$;

create function public.learning_commit_catalog(p_school uuid, p_class uuid, p_expected_version bigint, p_catalog jsonb)
returns boolean language plpgsql security definer set search_path = pg_catalog
as $$
declare old app_private.learning_catalogs%rowtype; item jsonb; updated jsonb;
begin
  perform 1 from public.classrooms where id = p_class and school_id = p_school for share;
  if not found then raise exception 'LEARNING_NOT_FOUND'; end if;
  select * into old from app_private.learning_catalogs where classroom_id = p_class and school_id = p_school for update;
  if not found or old.revision <> p_expected_version then return false; end if;
  if p_catalog->>'classId' <> p_class::text or p_catalog->>'institutionId' <> p_school::text
    or p_catalog->'grade' <> old.payload->'grade' or p_catalog->'schoolYear' <> old.payload->'schoolYear'
    or jsonb_typeof(p_catalog->'activities') is distinct from 'array' or jsonb_typeof(p_catalog->'rotations') is distinct from 'array'
    or not ((p_catalog->'rotations') @> (old.payload->'rotations')) then raise exception 'LEARNING_INVALID_CATALOG'; end if;
  for item in select value from jsonb_array_elements(old.payload->'activities') loop
    select value into updated from jsonb_array_elements(p_catalog->'activities') where value->>'rootQuestionId' = item->>'rootQuestionId';
    if updated is null or (updated - 'active' - 'activatedAt') <> (item - 'active' - 'activatedAt') then raise exception 'LEARNING_IMMUTABLE_CONTENT'; end if;
  end loop;
  if (select count(*) <> count(distinct value->>'rootQuestionId') from jsonb_array_elements(p_catalog->'activities'))
    or exists (select 1 from jsonb_array_elements(p_catalog->'rotations') r group by r->>'subjectId',r->>'weekStart' having count(*) > 1) then
    raise exception 'LEARNING_DUPLICATE_FACT';
  end if;
  update app_private.learning_catalogs set revision = revision + 1,payload = p_catalog where classroom_id = p_class and school_id = p_school;
  return true;
end;
$$;

create function public.learning_save_preferences(p_school uuid, p_student uuid, p_preferences jsonb)
returns jsonb language plpgsql security definer set search_path = pg_catalog
as $$
declare record public.student_preferences%rowtype;
begin
  perform 1 from public.enrollments e join public.user_roles r
    on r.user_id = e.student_id and r.school_id = e.school_id and r.role = 'aluno'
    where e.student_id = p_student and e.school_id = p_school and e.status = 'active' for share of e;
  if not found then raise exception 'LEARNING_NOT_FOUND'; end if;
  if jsonb_typeof(p_preferences->'interests') is distinct from 'array'
    or jsonb_array_length(p_preferences->'interests') > 20 or jsonb_typeof(p_preferences->'context') is distinct from 'string'
    or char_length(p_preferences->>'context') > 2000 then raise exception 'LEARNING_INVALID_PREFERENCES'; end if;
  insert into public.student_preferences(student_id,school_id,interests,context)
  values (p_student,p_school,array(select jsonb_array_elements_text(p_preferences->'interests')),p_preferences->>'context')
  on conflict (student_id) do update set interests = excluded.interests,context = excluded.context
  returning * into record;
  return jsonb_build_object('studentId',record.student_id,'interests',record.interests,'context',record.context,'version',record.version,
    'updatedAt',to_char(record.updated_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));
end;
$$;

create function public.learning_class_ranking(p_school uuid, p_class uuid)
returns jsonb language sql stable security definer set search_path = pg_catalog
as $$
  select coalesce(jsonb_agg(to_jsonb(ranked) order by ranked.xp desc,ranked."rankPoints" desc,ranked."studentId"),'[]'::jsonb)
  from (
    select p.id as "studentId",p.full_name as name,
      coalesce(sum(l.points) filter (where l.kind = 'xp' and l.classroom_id = p_class
        and (l.keep_after_rotation or exists (
          select 1 from app_private.learning_catalogs c,jsonb_array_elements(c.payload->'activities') a
          where c.classroom_id = p_class and c.school_id = p_school and (a->>'active')::boolean and a->>'rootQuestionId' = l.root_question_id
        ))),0) as xp,
      coalesce(sum(l.points) filter (where l.kind = 'annual' and l.school_year = cls.school_year),0) as "rankPoints"
    from public.profiles p
    join public.enrollments e on e.student_id = p.id and e.school_id = p.school_id and e.classroom_id = p_class and e.status = 'active'
    join public.classrooms cls on cls.id = e.classroom_id and cls.school_id = e.school_id
    left join public.learning_point_ledger l on l.student_id = p.id and l.school_id = p.school_id
    where p.school_id = p_school
    group by p.id,p.full_name
    order by xp desc,"rankPoints" desc,p.id limit 10
  ) ranked;
$$;

-- No caller can supply an arbitrary student/credit through a browser RPC.
revoke all on function public.learning_read_catalog(uuid,uuid),public.learning_read_student(uuid,uuid),
  public.learning_commit_student(uuid,uuid,bigint,bigint,jsonb),public.learning_commit_catalog(uuid,uuid,bigint,jsonb),
  public.learning_save_preferences(uuid,uuid,jsonb),public.learning_class_ranking(uuid,uuid)
from public,anon,authenticated;
grant execute on function public.learning_read_catalog(uuid,uuid),public.learning_read_student(uuid,uuid),
  public.learning_commit_student(uuid,uuid,bigint,bigint,jsonb),public.learning_commit_catalog(uuid,uuid,bigint,jsonb),
  public.learning_save_preferences(uuid,uuid,jsonb),public.learning_class_ranking(uuid,uuid) to service_role;

comment on table app_private.learning_student_states is 'Versioned learner aggregate; immutable snapshots and private answer keys; no browser SELECT.';
comment on table app_private.learning_catalogs is 'Reviewed learning snapshots and active selection per class; not a replacement for the content bank.';
comment on table public.learning_point_ledger is 'Append-only application credits; one XP and annual entry per finalized attempt. Rotation does not delete annual entries.';
commit;
