-- Teacher-only durable drafts. Answer keys remain in a non-exposed schema.
begin;
create table app_private.content_questions (
  school_id uuid not null references public.schools(id),
  id text not null check (char_length(id) between 1 and 128),
  classroom_id uuid not null,
  subject_id text not null references public.subjects(id),
  created_by uuid not null,
  version integer not null check (version > 0),
  status text not null check (status in ('rascunho','publicada')),
  payload jsonb not null check (jsonb_typeof(payload)='object'),
  created_at timestamptz not null,
  primary key (school_id,id),
  foreign key (classroom_id,school_id) references public.classrooms(id,school_id),
  foreign key (created_by,school_id) references public.profiles(id,school_id),
  check (payload->>'id'=id and payload->>'institutionId'=school_id::text
    and payload->>'classId'=classroom_id::text and payload#>>'{body,subjectId}'=subject_id
    and (payload->>'version')::integer=version and payload->>'status'=status),
  check (status<>'publicada' or (payload->>'reviewed')::boolean
    and payload->>'answerKeySource'='professor' and payload->>'publishedAt' is not null)
);
create index content_questions_scope on app_private.content_questions(classroom_id,school_id,subject_id,created_at,id);
create index content_questions_creator on app_private.content_questions(created_by,school_id);
create index content_questions_subject on app_private.content_questions(subject_id);
alter table app_private.content_questions enable row level security;
revoke all on app_private.content_questions from public,anon,authenticated;
grant select,insert,update,delete on app_private.content_questions to service_role;

create function public.content_list_questions(p_school uuid,p_class uuid,p_subject text)
returns jsonb language sql stable security invoker set search_path='' as $$
  select coalesce(jsonb_agg(payload order by created_at,id),'[]'::jsonb)
  from app_private.content_questions where school_id=p_school and classroom_id=p_class and subject_id=p_subject;
$$;
create function public.content_get_question(p_school uuid,p_id text)
returns jsonb language sql stable security invoker set search_path='' as $$
  select payload from app_private.content_questions where school_id=p_school and id=p_id;
$$;
create function public.content_insert_questions(p_items jsonb)
returns void language plpgsql security invoker set search_path='' as $$
declare item jsonb;
begin
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) not between 1 and 40 then
    raise exception 'CONTENT_INVALID_BATCH';
  end if;
  for item in select value from jsonb_array_elements(p_items) loop
    if not exists (select 1 from public.classrooms c where c.id=(item->>'classId')::uuid
      and c.school_id=(item->>'institutionId')::uuid and c.grade=(item#>>'{body,grade}')::smallint)
      or item->>'status' is distinct from 'rascunho' then raise exception 'CONTENT_INVALID_SCOPE'; end if;
  end loop;
  insert into app_private.content_questions(school_id,id,classroom_id,subject_id,created_by,version,status,payload,created_at)
  select (i->>'institutionId')::uuid,i->>'id',(i->>'classId')::uuid,i#>>'{body,subjectId}',
    (i->>'createdBy')::uuid,(i->>'version')::integer,i->>'status',i,(i->>'createdAt')::timestamptz
  from jsonb_array_elements(p_items) i;
end;
$$;
create function public.content_replace_question(p_item jsonb,p_expected_version integer)
returns boolean language plpgsql security invoker set search_path='' as $$
declare touched integer;
begin
  if (p_item->>'version')::integer not in (p_expected_version,p_expected_version+1) then
    raise exception 'CONTENT_INVALID_VERSION';
  end if;
  update app_private.content_questions q set payload=p_item,version=(p_item->>'version')::integer,
    subject_id=p_item#>>'{body,subjectId}',status=p_item->>'status'
  where q.school_id=(p_item->>'institutionId')::uuid and q.id=p_item->>'id' and q.version=p_expected_version
    and q.status='rascunho' and q.classroom_id=(p_item->>'classId')::uuid
    and q.created_by=(p_item->>'createdBy')::uuid and q.payload->>'createdAt'=p_item->>'createdAt'
    and q.payload->>'rootQuestionId'=p_item->>'rootQuestionId'
    and exists (select 1 from public.classrooms c where c.id=q.classroom_id and c.school_id=q.school_id
      and c.grade=(p_item#>>'{body,grade}')::smallint);
  get diagnostics touched=row_count;
  return touched=1;
end;
$$;
create function public.content_remove_question(p_school uuid,p_id text,p_expected_version integer)
returns boolean language plpgsql security invoker set search_path='' as $$
declare touched integer;
begin
  delete from app_private.content_questions where school_id=p_school and id=p_id and version=p_expected_version and status='rascunho';
  get diagnostics touched=row_count;
  return touched=1;
end;
$$;

create table app_private.content_import_usage (
  school_id uuid not null,
  user_id uuid not null,
  usage_day date not null,
  used integer not null default 0 check (used between 0 and 20),
  lease_token uuid,
  lease_until timestamptz,
  primary key(school_id,user_id,usage_day),
  foreign key(user_id,school_id) references public.profiles(id,school_id)
);
create index content_import_usage_user on app_private.content_import_usage(user_id,school_id);
alter table app_private.content_import_usage enable row level security;
revoke all on app_private.content_import_usage from public,anon,authenticated;
grant select,insert,update on app_private.content_import_usage to service_role;
create function public.content_acquire_import(p_school uuid,p_user uuid,p_token uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare usage app_private.content_import_usage%rowtype; day date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  if not exists (select 1 from public.user_roles where user_id=p_user and school_id=p_school and role in ('professor','coordenador'))
    then raise exception 'CONTENT_FORBIDDEN'; end if;
  insert into app_private.content_import_usage(school_id,user_id,usage_day) values(p_school,p_user,day) on conflict do nothing;
  select * into usage from app_private.content_import_usage where school_id=p_school and user_id=p_user and usage_day=day for update;
  if usage.lease_until>now() then return jsonb_build_object('ok',false,'reason','busy','limit',20); end if;
  if usage.used>=20 then return jsonb_build_object('ok',false,'reason','daily','limit',20); end if;
  update app_private.content_import_usage set used=used+1,lease_token=p_token,lease_until=now()+interval '5 minutes'
    where school_id=p_school and user_id=p_user and usage_day=day;
  return jsonb_build_object('ok',true);
end;
$$;
create function public.content_release_import(p_school uuid,p_user uuid,p_token uuid)
returns void language sql security invoker set search_path='' as $$
  update app_private.content_import_usage set lease_token=null,lease_until=null
    where school_id=p_school and user_id=p_user and lease_token=p_token;
$$;

revoke all on function public.content_list_questions(uuid,uuid,text),public.content_get_question(uuid,text),
  public.content_insert_questions(jsonb),public.content_replace_question(jsonb,integer),public.content_remove_question(uuid,text,integer),
  public.content_acquire_import(uuid,uuid,uuid),public.content_release_import(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.content_list_questions(uuid,uuid,text),public.content_get_question(uuid,text),
  public.content_insert_questions(jsonb),public.content_replace_question(jsonb,integer),public.content_remove_question(uuid,text,integer),
  public.content_acquire_import(uuid,uuid,uuid),public.content_release_import(uuid,uuid,uuid) to service_role;
comment on table app_private.content_questions is 'Durable teacher drafts and published metadata, including private answer keys. No browser grants.';
commit;
