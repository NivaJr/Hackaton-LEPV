-- Requested roster handoff: atomic transfer, bounded Auth lookup, import audit, class metrics.
begin;

create function public.transfer_student(p_enrollment_id uuid,p_classroom_id uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare previous public.enrollments%rowtype; destination public.classrooms%rowtype; moved public.enrollments%rowtype;
  school uuid := app_private.current_school_id();
begin
  if auth.uid() is null or not app_private.has_role(school,'coordenador') then
    raise exception 'ROSTER_FORBIDDEN' using errcode='42501';
  end if;
  select * into previous from public.enrollments where id=p_enrollment_id and school_id=school for update;
  if not found then raise exception 'ROSTER_STALE_PREVIEW'; end if;
  select * into destination from public.classrooms where id=p_classroom_id and school_id=school for share;
  if not found then raise exception 'ROSTER_DESTINATION_NOT_FOUND'; end if;
  if previous.status<>'active' then
    select * into moved from public.enrollments where school_id=school and student_id=previous.student_id
      and classroom_id=p_classroom_id and status='active';
    if previous.status='transferred' and found then
      return jsonb_build_object('id',moved.id,'studentId',moved.student_id,'classroomId',moved.classroom_id,'classroomName',destination.name);
    end if;
    raise exception 'ROSTER_STALE_PREVIEW';
  end if;
  if previous.classroom_id=p_classroom_id then moved:=previous;
  else
    update public.enrollments set status='transferred',ended_at=now() where id=previous.id;
    insert into public.enrollments(school_id,classroom_id,student_id)
      values(school,p_classroom_id,previous.student_id) returning * into moved;
  end if;
  return jsonb_build_object('id',moved.id,'studentId',moved.student_id,'classroomId',moved.classroom_id,'classroomName',destination.name);
end;
$$;
revoke all on function public.transfer_student(uuid,uuid) from public,anon;
grant execute on function public.transfer_student(uuid,uuid) to authenticated;

-- Auth lookup needs auth.users privileges; the definer stays private and service-only.
-- Its result contains no password, token, metadata or other Auth columns.
create function app_private.account_ids_by_email(p_emails text[])
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  if auth.uid() is not null or current_setting('role',true) is distinct from 'service_role' then
    raise exception 'ROSTER_LOOKUP_FORBIDDEN' using errcode='42501';
  end if;
  if coalesce(cardinality(p_emails),0)>1000 then raise exception 'ROSTER_LOOKUP_LIMIT'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('userId',u.id,'email',u.email) order by u.email),'[]'::jsonb)
    from auth.users u where u.email=any(array(select distinct lower(btrim(e)) from unnest(p_emails) e)));
end;
$$;
revoke all on function app_private.account_ids_by_email(text[]) from public,anon,authenticated;
grant execute on function app_private.account_ids_by_email(text[]) to service_role;
create function public.accounts_by_emails(p_emails text[])
returns jsonb language sql stable security invoker set search_path='' as $$
  select app_private.account_ids_by_email(p_emails);
$$;
revoke all on function public.accounts_by_emails(text[]) from public,anon,authenticated;
grant execute on function public.accounts_by_emails(text[]) to service_role;

create table public.roster_import_audits (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id),
  actor_id uuid not null,
  classroom_id uuid not null,
  kind text not null check (kind in ('students','teachers')),
  status text not null default 'running' check (status in ('running','completed')),
  rows jsonb not null check (jsonb_typeof(rows)='array' and jsonb_array_length(rows) between 1 and 1000),
  results jsonb not null default '[]' check (jsonb_typeof(results)='array'),
  created_at timestamptz not null default now(),
  finished_at timestamptz,
  foreign key(actor_id,school_id) references public.profiles(id,school_id),
  foreign key(classroom_id,school_id) references public.classrooms(id,school_id),
  check ((status='running' and finished_at is null) or (status='completed' and finished_at is not null))
);
create index roster_import_audits_school_date on public.roster_import_audits(school_id,created_at desc);
create index roster_import_audits_actor on public.roster_import_audits(actor_id,school_id);
create index roster_import_audits_class on public.roster_import_audits(classroom_id,school_id);
alter table public.roster_import_audits enable row level security;
revoke all on public.roster_import_audits from public,anon,authenticated;
grant select on public.roster_import_audits to authenticated;
grant select,insert,update on public.roster_import_audits to service_role;
create policy roster_import_audits_coordinator_read on public.roster_import_audits for select to authenticated
using (school_id=(select app_private.current_school_id()) and app_private.has_role(school_id,'coordenador'));

create function public.roster_start_import_audit(p_school uuid,p_actor uuid,p_class uuid,p_kind text,p_rows jsonb)
returns uuid language plpgsql security invoker set search_path='' as $$
declare audit_id uuid;
begin
  if not exists (select 1 from public.user_roles where user_id=p_actor and school_id=p_school and role='coordenador')
    then raise exception 'ROSTER_AUDIT_FORBIDDEN'; end if;
  insert into public.roster_import_audits(school_id,actor_id,classroom_id,kind,rows)
  values(p_school,p_actor,p_class,p_kind,(select jsonb_agg(jsonb_build_object('line',r->'line','email',r->>'email',
    'subject',r->>'subject','decision',r->>'decision')) from jsonb_array_elements(p_rows) r)) returning id into audit_id;
  return audit_id;
end;
$$;
create function public.roster_finish_import_audit(p_school uuid,p_actor uuid,p_id uuid,p_results jsonb)
returns boolean language plpgsql security invoker set search_path='' as $$
declare touched integer;
begin
  update public.roster_import_audits a set status='completed',finished_at=now(),
    results=(select coalesce(jsonb_agg(jsonb_build_object('line',r->'line','email',r->>'email','status',r->>'status',
      'issueCode',r#>>'{issue,code}')),'[]'::jsonb) from jsonb_array_elements(p_results) r)
  where a.id=p_id and a.school_id=p_school and a.actor_id=p_actor and a.status='running'
    and jsonb_array_length(p_results)=jsonb_array_length(a.rows);
  get diagnostics touched=row_count;
  return touched=1;
end;
$$;
revoke all on function public.roster_start_import_audit(uuid,uuid,uuid,text,jsonb),public.roster_finish_import_audit(uuid,uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.roster_start_import_audit(uuid,uuid,uuid,text,jsonb),public.roster_finish_import_audit(uuid,uuid,uuid,jsonb) to service_role;

create function public.learning_class_metrics(p_school uuid,p_classes uuid[],p_from date,p_to date,p_subjects text[] default null)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
begin
  if p_from is null or p_to is null or p_from>p_to or p_to-p_from>365 or cardinality(p_classes)>1000 then
    raise exception 'LEARNING_INVALID_PERIOD';
  end if;
  return (
    with members as (
      select e.classroom_id,e.student_id,greatest(p_from,(e.started_at at time zone 'America/Sao_Paulo')::date) as eligible_from
      from public.enrollments e where e.school_id=p_school and e.classroom_id=any(p_classes) and e.status='active'
    ), answers as (
      select m.classroom_id,m.student_id,count(a.id) as attempts,
        count(a.id) filter (where (a.result->>'isCorrect')::boolean) as correct
      from members m left join public.learning_attempts a on a.student_id=m.student_id and a.school_id=p_school
        and a.classroom_id=m.classroom_id and a.created_at >= (p_from::timestamp at time zone 'America/Sao_Paulo')
        and a.created_at < ((p_to+1)::timestamp at time zone 'America/Sao_Paulo')
        and (p_subjects is null or a.subject_id=any(p_subjects))
      group by m.classroom_id,m.student_id
    ), access as (
      select m.classroom_id,m.student_id,greatest(0,p_to-m.eligible_from+1) as eligible_days,
        (select count(distinct d) from jsonb_array_elements_text(coalesce(s.payload->'accessDays','[]'::jsonb)) d
          where d::date between m.eligible_from and p_to) as access_days
      from members m left join app_private.learning_student_states s on s.school_id=p_school and s.student_id=m.student_id
    ), aggregated as (
      select c.id as "classroomId",count(m.student_id) as "studentsEnrolled",
        coalesce(sum(a.attempts),0) as attempts,coalesce(sum(a.correct),0) as correct,
        coalesce(sum(x.access_days),0) as "accessDays",coalesce(sum(x.eligible_days),0) as "eligibleDays",
        coalesce(round(100.0*sum(a.correct)/nullif(sum(a.attempts),0),2),0) as "correctPercent",
        coalesce(round(100.0*sum(x.access_days)/nullif(sum(x.eligible_days),0),2),0) as "frequencyPercent"
      from public.classrooms c left join members m on m.classroom_id=c.id
      left join answers a on a.classroom_id=m.classroom_id and a.student_id=m.student_id
      left join access x on x.classroom_id=m.classroom_id and x.student_id=m.student_id
      where c.school_id=p_school and c.id=any(p_classes) group by c.id
    ) select coalesce(jsonb_agg(to_jsonb(aggregated) order by "classroomId"),'[]'::jsonb) from aggregated
  );
end;
$$;
revoke all on function public.learning_class_metrics(uuid,uuid[],date,date,text[]) from public,anon,authenticated;
grant execute on function public.learning_class_metrics(uuid,uuid[],date,date,text[]) to service_role;
comment on table public.roster_import_audits is 'Coordinator and school, planned rows, final per-row outcome. Access links, passwords and source files are never recorded.';
notify pgrst,'reload schema';
commit;
