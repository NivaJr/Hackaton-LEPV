begin;

-- The same allowlist applies to browser writes, privileged RPCs and legacy rows.
create function app_private.approved_student_interests() returns text[]
language sql immutable security invoker set search_path = pg_catalog as $$
  select array['animais','artes','astronomia','ciência','dança','desenho','esportes','futebol',
    'geografia','história','idiomas','jogos educativos','leitura','matemática','música',
    'natureza','programação','quebra-cabeças','tecnologia','xadrez']::text[];
$$;
revoke all on function app_private.approved_student_interests() from public, anon;
grant execute on function app_private.approved_student_interests() to authenticated, service_role;

update public.student_preferences p
set interests = array(select value from unnest(p.interests) value
  where value = any(app_private.approved_student_interests()))
where not (p.interests <@ app_private.approved_student_interests());
alter table public.student_preferences add constraint student_interests_approved
  check (interests <@ app_private.approved_student_interests());

-- An omitted type is always a regular exercise. Existing issued instances and
-- credits retain their historical snapshots, independent of this catalogue backfill.
update app_private.learning_catalogs c set
  payload = jsonb_set(c.payload, '{activities}', (
    select coalesce(jsonb_agg(a || jsonb_build_object(
      'activityType', coalesce(a->>'activityType', 'exercise'),
      'contentId', coalesce(a->>'contentId', 'legacy-' || (a->'body'->>'subjectId')),
      'contentTitle', coalesce(a->>'contentTitle', 'Conteúdos anteriores'),
      'contentDefinedBy', coalesce(a->>'contentDefinedBy', case when exists (
        select 1 from public.teacher_assignments t where t.school_id = c.school_id
          and t.classroom_id = c.classroom_id and t.subject_id = a->'body'->>'subjectId'
      ) then 'teacher' else 'coordinator' end)
    ) order by ordinal), '[]'::jsonb)
    from jsonb_array_elements(c.payload->'activities') with ordinality as items(a, ordinal)
  )), revision = revision + 1
where exists (select 1 from jsonb_array_elements(c.payload->'activities') a
  where not (a ?& array['activityType','contentId','contentTitle','contentDefinedBy']));

-- Staff must have the subject assignment. Coordination may define content only
-- when the class/subject has no assigned teacher. The caller is the authenticated
-- database session; no browser-provided role or school authorizes this predicate.
create function app_private.can_manage_content(target_school uuid, target_class uuid, target_subject text)
returns boolean language sql stable security invoker set search_path = pg_catalog as $$
  select auth.uid() is not null and target_school = app_private.current_school_id()
    and (
      (app_private.has_role(target_school, 'professor') and exists (
        select 1 from public.teacher_assignments t where t.school_id = target_school
          and t.classroom_id = target_class and t.subject_id = target_subject and t.teacher_id = (select auth.uid())
      )) or (app_private.has_role(target_school, 'coordenador') and not exists (
        select 1 from public.teacher_assignments t where t.school_id = target_school
          and t.classroom_id = target_class and t.subject_id = target_subject
      ))
    );
$$;
revoke all on function app_private.can_manage_content(uuid,uuid,text) from public, anon;
grant execute on function app_private.can_manage_content(uuid,uuid,text) to authenticated, service_role;

-- Reuse the private, server-only content bank delivered by PR #17.
alter table app_private.content_questions drop constraint content_questions_status_check;
alter table app_private.content_questions add constraint content_questions_status_check
  check (status in ('rascunho','publicando','publicada'));

create or replace function public.content_replace_question(p_item jsonb,p_expected_version integer)
returns boolean language plpgsql security invoker set search_path='' as $$
declare old app_private.content_questions%rowtype;
begin
  select * into old from app_private.content_questions q
    where q.school_id=(p_item->>'institutionId')::uuid and q.id=p_item->>'id' for update;
  if not found or old.version<>p_expected_version or old.status='publicada' then return false; end if;
  if old.classroom_id<>(p_item->>'classId')::uuid or old.created_by<>(p_item->>'createdBy')::uuid
    or old.payload->>'createdAt'<>p_item->>'createdAt' or old.payload->>'rootQuestionId'<>p_item->>'rootQuestionId'
    then return false; end if;
  if old.status='publicando' then
    if p_item->>'status' not in ('publicando','publicada') or (p_item->>'version')::integer<>old.version
      or (p_item - 'status' - 'updatedAt' - 'publishedAt')<>(old.payload - 'status' - 'updatedAt' - 'publishedAt')
      then return false; end if;
  elsif (p_item->>'version')::integer<>old.version+1 then return false;
  end if;
  if not exists (select 1 from public.classrooms c where c.id=old.classroom_id
    and c.school_id=old.school_id and c.grade=(p_item#>>'{body,grade}')::smallint) then return false; end if;
  if p_item->>'status' in ('publicando','publicada') and (
    p_item->>'answerKeySource' is distinct from 'professor' or p_item->'reviewed' is distinct from 'true'::jsonb
  ) then raise exception 'CONTENT_REVIEW_REQUIRED'; end if;
  if p_item->>'status'='publicada' and not exists (
    select 1 from app_private.learning_catalogs c,jsonb_array_elements(c.payload->'activities') a
    where c.school_id=old.school_id and c.classroom_id=old.classroom_id
      and a->>'rootQuestionId'=p_item->>'rootQuestionId' and a->'body'=p_item->'body'
      and (a->>'contentVersion')::integer=(p_item->>'version')::integer
  ) then raise exception 'CONTENT_CATALOGUE_REQUIRED'; end if;
  update app_private.content_questions set payload=p_item,version=(p_item->>'version')::integer,
    subject_id=p_item#>>'{body,subjectId}',status=p_item->>'status'
    where school_id=old.school_id and id=old.id;
  return true;
end;
$$;
revoke all on function public.content_replace_question(jsonb,integer) from public,anon,authenticated;
grant execute on function public.content_replace_question(jsonb,integer) to service_role;

-- The bucket and policies are created when Supabase Storage is installed. Pure
-- Postgres test environments emulate the same tables to exercise these policies.
create function app_private.can_manage_content_path(object_name text) returns boolean
language sql stable security invoker set search_path = pg_catalog as $$
  select case when split_part(object_name,'/',1) ~ '^[0-9a-fA-F]{8}(-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}$'
    and split_part(object_name,'/',2) ~ '^[0-9a-fA-F]{8}(-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}$'
  then app_private.can_manage_content(split_part(object_name,'/',1)::uuid,
    split_part(object_name,'/',2)::uuid,split_part(object_name,'/',3)) else false end;
$$;
revoke all on function app_private.can_manage_content_path(text) from public,anon;
grant execute on function app_private.can_manage_content_path(text) to authenticated,service_role;
do $$ begin
  if to_regclass('storage.buckets') is not null and to_regclass('storage.objects') is not null then
    insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
    values ('teaching-sources','teaching-sources',false,10485760,
      array['application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document'])
    on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
    execute 'create policy teaching_sources_read on storage.objects for select to authenticated
      using (bucket_id = ''teaching-sources'' and app_private.can_manage_content_path(name))';
    execute 'create policy teaching_sources_insert on storage.objects for insert to authenticated
      with check (bucket_id = ''teaching-sources'' and app_private.can_manage_content_path(name))';
  end if;
end $$;

comment on table app_private.content_questions is 'Private reviewed teacher drafts and publication snapshots. Students and guardians cannot read answer keys.';

-- The scoring function below is appended from the reviewed predecessor with
-- per-instance policy validation and immutable historical attempts preserved.

-- Confirmed scoring: regular exercise 50 rank/0 XP; weekly challenge
-- 100 rank/100 XP while active; recovery 35 rank/0 XP.
create or replace function public.learning_commit_student(
  p_school uuid, p_student uuid, p_expected_version bigint, p_catalog_version bigint, p_state jsonb
) returns boolean language plpgsql security definer set search_path = pg_catalog
as $$
declare current_class uuid; catalog app_private.learning_catalogs%rowtype;
  account app_private.learning_student_states%rowtype; item jsonb; previous jsonb; instance jsonb; result jsonb; activity jsonb; expected_points numeric; expected_xp numeric; expected_nominal numeric; confirmed boolean;
begin
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
    if account.payload->'attempts' @> jsonb_build_array(item) then continue; end if;
    result := item->'result';
    select value into instance from jsonb_array_elements(p_state->'instances')
      where value->'question'->>'questionInstanceId' = result->>'questionInstanceId';
    select value into activity from jsonb_array_elements(catalog.payload->'activities')
      where value->>'rootQuestionId' = item->>'rootQuestionId';
    confirmed := instance->'scoring'->>'version' = 'confirmed-v1';
    expected_nominal := case when confirmed then
      case when instance->>'recoveryId' is not null then 35
        when instance->>'activityType' = 'weekly_challenge' then 100 else 50 end
      else (instance->>'nominalPoints')::numeric end;
    expected_points := case when (result->>'isCorrect')::boolean then expected_nominal else 0 end;
    expected_xp := case when not (result->>'isCorrect')::boolean then 0
      when confirmed then case when instance->>'recoveryId' is null
        and instance->>'activityType' = 'weekly_challenge' then 100 else 0 end
      else expected_nominal end;
    if instance is null or activity is null or item->>'classId' <> instance->>'classId'
      or item->>'rootQuestionId' <> instance->'question'->>'rootQuestionId'
      or item->>'subjectId' <> instance->'question'->>'subjectId'
      or not exists (select 1 from jsonb_array_elements(instance->'question'->'options') o where o->>'id' = item->>'selectedOptionId')
      or (result->>'isCorrect')::boolean is distinct from (item->>'selectedOptionId' = instance->'answerKey'->>'correctOptionId')
      or (result->>'rankPointsAwarded')::numeric is distinct from expected_points
      or (result->>'xpAwarded')::numeric is distinct from expected_xp
      or (instance->>'nominalPoints')::numeric is distinct from expected_nominal
      then raise exception 'LEARNING_INVALID_RESULT'; end if;
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

revoke all on function public.learning_commit_student(uuid,uuid,bigint,bigint,jsonb) from public, anon, authenticated;
grant execute on function public.learning_commit_student(uuid,uuid,bigint,bigint,jsonb) to service_role;

commit;
