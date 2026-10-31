-- Confirmed scoring: regular exercise 50 rank/0 XP; weekly challenge
-- 100 rank/100 XP while active; recovery 35 rank/0 XP.
create or replace function public.learning_commit_student(
  p_school uuid, p_student uuid, p_expected_version bigint, p_catalog_version bigint, p_state jsonb
) returns boolean language plpgsql security definer set search_path = pg_catalog
as $$
declare current_class uuid; catalog app_private.learning_catalogs%rowtype;
  account app_private.learning_student_states%rowtype; item jsonb; previous jsonb; instance jsonb; result jsonb; activity jsonb;
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
    -- Immutable attempts were already validated under the policy in effect when saved.
    if (account.payload->'attempts') @> jsonb_build_array(item) then continue; end if;
    result := item->'result';
    select value into instance from jsonb_array_elements(p_state->'instances')
      where value->'question'->>'questionInstanceId' = result->>'questionInstanceId';
    select value into activity from jsonb_array_elements(catalog.payload->'activities')
      where value->>'rootQuestionId' = item->>'rootQuestionId';
    if instance is null or activity is null or item->>'classId' <> instance->>'classId'
      or item->>'rootQuestionId' <> instance->'question'->>'rootQuestionId'
      or item->>'subjectId' <> instance->'question'->>'subjectId'
      or not exists (select 1 from jsonb_array_elements(instance->'question'->'options') o where o->>'id' = item->>'selectedOptionId')
      or (result->>'isCorrect')::boolean is distinct from (item->>'selectedOptionId' = instance->'answerKey'->>'correctOptionId')
      or (result->>'rankPointsAwarded')::numeric is distinct from (
        case when not (result->>'isCorrect')::boolean then 0
          when instance->>'recoveryId' is not null then 35
          when coalesce(activity->>'activityType','weekly_challenge') = 'weekly_challenge' then 100
          else 50 end)
      or (result->>'xpAwarded')::numeric is distinct from (
        case when (result->>'isCorrect')::boolean and instance->>'recoveryId' is null
          and coalesce(activity->>'activityType','weekly_challenge') = 'weekly_challenge' then 100 else 0 end)
      or (not ((account.payload->'instances') @> jsonb_build_array(instance))
        and (instance->>'nominalPoints')::numeric is distinct from (
        case when instance->>'recoveryId' is not null then 35
          when coalesce(activity->>'activityType','weekly_challenge') = 'weekly_challenge' then 100 else 50 end))
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
