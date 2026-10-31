-- Base de identidade e vínculos. Aplicar como postgres pelo Supabase/CLI.
-- Não contém contas, senhas, dados reais ou o banco de questões completo.
begin;

create type public.app_role as enum ('aluno', 'coordenador', 'professor', 'responsavel');

create schema if not exists app_private;
revoke all on schema app_private from public, anon;
grant usage on schema app_private to authenticated, service_role;
revoke all on type public.app_role from public;
grant usage on type public.app_role to authenticated, service_role;

create table public.schools (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 200),
  created_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  school_id uuid not null references public.schools(id),
  full_name text not null check (char_length(btrim(full_name)) between 1 and 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, school_id)
);

create table public.user_roles (
  user_id uuid not null,
  school_id uuid not null,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  primary key (user_id, school_id, role),
  foreign key (user_id, school_id) references public.profiles(id, school_id) on delete cascade
);

create table public.subjects (
  id text primary key,
  name text not null unique,
  bncc_component text not null,
  display_order smallint not null unique check (display_order > 0)
);

create table public.classrooms (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id),
  name text not null check (char_length(btrim(name)) between 1 and 100),
  grade smallint not null check (grade between 6 and 9),
  school_year smallint not null check (school_year between 2000 and 2200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, school_id),
  unique (school_id, school_year, name)
);

create table public.enrollments (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id),
  classroom_id uuid not null,
  student_id uuid not null,
  status text not null default 'active' check (status in ('active', 'transferred', 'inactive')),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  foreign key (classroom_id, school_id) references public.classrooms(id, school_id),
  foreign key (student_id, school_id) references public.profiles(id, school_id),
  check ((status = 'active' and ended_at is null) or (status <> 'active' and ended_at is not null)),
  check (ended_at is null or ended_at >= started_at)
);
-- Transferir requer encerrar a matrícula anterior e criar uma nova em transação.
create unique index one_active_enrollment_per_student
  on public.enrollments (student_id) where status = 'active';
create index enrollments_classroom_active_idx
  on public.enrollments (school_id, classroom_id, student_id) where status = 'active';

create table public.teacher_assignments (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id),
  classroom_id uuid not null,
  teacher_id uuid not null,
  subject_id text not null references public.subjects(id),
  created_at timestamptz not null default now(),
  foreign key (classroom_id, school_id) references public.classrooms(id, school_id),
  foreign key (teacher_id, school_id) references public.profiles(id, school_id),
  unique (classroom_id, teacher_id, subject_id)
);
create index teacher_assignments_actor_idx
  on public.teacher_assignments (teacher_id, school_id, classroom_id, subject_id);

create table public.guardian_links (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id),
  guardian_id uuid not null,
  student_id uuid not null,
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'revoked')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (guardian_id, school_id) references public.profiles(id, school_id),
  foreign key (student_id, school_id) references public.profiles(id, school_id),
  unique (guardian_id, student_id),
  check (guardian_id <> student_id)
);
create index guardian_links_confirmed_idx
  on public.guardian_links (guardian_id, school_id, student_id) where status = 'confirmed';

create table public.student_preferences (
  student_id uuid primary key,
  school_id uuid not null references public.schools(id),
  interests text[] not null default '{}',
  context text not null default '' check (char_length(context) <= 4000),
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (student_id, school_id) references public.profiles(id, school_id),
  check (cardinality(interests) <= 30)
);

create table public.academic_history (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id),
  student_id uuid not null,
  subject_id text not null references public.subjects(id),
  school_year smallint not null check (school_year between 2000 and 2200),
  period text not null check (char_length(btrim(period)) between 1 and 100),
  grade numeric(4,2) check (grade between 0 and 10),
  notes text not null default '' check (char_length(notes) <= 10000),
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (student_id, school_id) references public.profiles(id, school_id)
);
create index academic_history_student_idx
  on public.academic_history (school_id, student_id, subject_id, school_year);

create table public.student_health (
  student_id uuid primary key,
  school_id uuid not null references public.schools(id),
  details text not null default '' check (char_length(details) <= 10000),
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (student_id, school_id) references public.profiles(id, school_id)
);

create table public.student_support (
  student_id uuid primary key,
  school_id uuid not null references public.schools(id),
  details text not null default '' check (char_length(details) <= 10000),
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (student_id, school_id) references public.profiles(id, school_id)
);

-- SECURITY DEFINER usa consultas estáticas, nomes qualificados e search_path fixo.
-- O dono postgres pode consultar as tabelas sem reaplicar RLS, evitando recursão.
-- Não habilitar FORCE ROW LEVEL SECURITY sem redesenhar esses helpers.
create function app_private.current_school_id()
returns uuid language sql stable security definer set search_path = pg_catalog
as $$
  select p.school_id from public.profiles p where p.id = auth.uid();
$$;

create function app_private.has_role(target_school uuid, target_role public.app_role)
returns boolean language sql stable security definer set search_path = pg_catalog
as $$
  select exists (
    select 1 from public.user_roles r
    join public.profiles p on p.id = r.user_id and p.school_id = r.school_id
    where r.user_id = auth.uid() and r.school_id = target_school and r.role = target_role
  );
$$;

create function app_private.can_read_student(target_student uuid, target_school uuid)
returns boolean language sql stable security definer set search_path = pg_catalog
as $$
  select target_school = app_private.current_school_id()
  and exists (
    select 1 from public.user_roles r
    where r.user_id = target_student and r.school_id = target_school and r.role = 'aluno'
  )
  and (
    (auth.uid() = target_student and app_private.has_role(target_school, 'aluno'))
    or app_private.has_role(target_school, 'coordenador')
    or (
      app_private.has_role(target_school, 'professor')
      and exists (
        select 1 from public.teacher_assignments ta
        join public.enrollments e on e.classroom_id = ta.classroom_id and e.school_id = ta.school_id
        where ta.teacher_id = auth.uid() and ta.school_id = target_school
          and e.student_id = target_student and e.status = 'active'
      )
    )
    or (
      app_private.has_role(target_school, 'responsavel')
      and exists (
        select 1 from public.guardian_links g
        where g.guardian_id = auth.uid() and g.student_id = target_student
          and g.school_id = target_school and g.status = 'confirmed'
      )
    )
  );
$$;

create function app_private.can_edit_academic(target_student uuid, target_school uuid, target_subject text)
returns boolean language sql stable security definer set search_path = pg_catalog
as $$
  select target_school = app_private.current_school_id()
  and (
    app_private.has_role(target_school, 'coordenador')
    or (
      app_private.has_role(target_school, 'professor')
      and exists (
        select 1 from public.teacher_assignments ta
        join public.enrollments e on e.classroom_id = ta.classroom_id and e.school_id = ta.school_id
        where ta.teacher_id = auth.uid() and ta.school_id = target_school
          and ta.subject_id = target_subject and e.student_id = target_student and e.status = 'active'
      )
    )
  );
$$;

create function app_private.is_guardian(target_student uuid, target_school uuid)
returns boolean language sql stable security definer set search_path = pg_catalog
as $$
  select target_school = app_private.current_school_id()
    and app_private.has_role(target_school, 'responsavel')
    and exists (
      select 1 from public.guardian_links g
      where g.guardian_id = auth.uid() and g.student_id = target_student
        and g.school_id = target_school and g.status = 'confirmed'
    );
$$;

create function app_private.can_read_class(target_class uuid, target_school uuid)
returns boolean language sql stable security definer set search_path = pg_catalog
as $$
  select target_school = app_private.current_school_id()
    and (
      app_private.has_role(target_school, 'coordenador')
      or (
        app_private.has_role(target_school, 'professor') and exists (
          select 1 from public.teacher_assignments ta
          where ta.teacher_id = auth.uid() and ta.classroom_id = target_class and ta.school_id = target_school
        )
      )
      or exists (
        select 1 from public.enrollments e
        where e.classroom_id = target_class and e.school_id = target_school and e.status = 'active'
          and (
            (e.student_id = auth.uid() and app_private.has_role(target_school, 'aluno'))
            or app_private.is_guardian(e.student_id, target_school)
          )
      )
    );
$$;

create function app_private.touch_updated_at()
returns trigger language plpgsql set search_path = pg_catalog
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create function app_private.bump_preferences_version()
returns trigger language plpgsql set search_path = pg_catalog
as $$
begin
  if tg_op = 'INSERT' then
    new.version := 1;
  elsif new.interests is distinct from old.interests or new.context is distinct from old.context then
    new.version := old.version + 1;
  else
    new.version := old.version;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create function app_private.audit_actor()
returns trigger language plpgsql set search_path = pg_catalog
as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
    new.created_at := now();
  else
    new.created_by := old.created_by;
    new.created_at := old.created_at;
  end if;
  new.updated_by := auth.uid();
  new.updated_at := now();
  return new;
end;
$$;

create function app_private.validate_role_references()
returns trigger language plpgsql security definer set search_path = pg_catalog
as $$
begin
  if tg_table_name = 'teacher_assignments' then
    if not exists (
      select 1 from public.user_roles r
      where r.user_id = new.teacher_id and r.school_id = new.school_id and r.role = 'professor'
    ) then
      raise exception 'O usuário não possui papel de professor nesta escola.' using errcode = '23514';
    end if;
  else
    if not exists (
      select 1 from public.user_roles r
      where r.user_id = new.student_id and r.school_id = new.school_id and r.role = 'aluno'
    ) then
      raise exception 'O estudante não possui papel de aluno nesta escola.' using errcode = '23514';
    end if;
    if tg_table_name = 'guardian_links' then
      if not exists (
        select 1 from public.user_roles r
        where r.user_id = new.guardian_id and r.school_id = new.school_id and r.role = 'responsavel'
      ) then
        raise exception 'O usuário não possui papel de responsável nesta escola.' using errcode = '23514';
      end if;
    end if;
  end if;
  return new;
end;
$$;

create trigger profiles_updated before update on public.profiles
for each row execute function app_private.touch_updated_at();
create trigger classrooms_updated before update on public.classrooms
for each row execute function app_private.touch_updated_at();
create trigger guardian_links_updated before update on public.guardian_links
for each row execute function app_private.touch_updated_at();
create trigger student_preferences_version before insert or update on public.student_preferences
for each row execute function app_private.bump_preferences_version();
create trigger academic_history_audit before insert or update on public.academic_history
for each row execute function app_private.audit_actor();
create trigger student_health_audit before insert or update on public.student_health
for each row execute function app_private.audit_actor();
create trigger student_support_audit before insert or update on public.student_support
for each row execute function app_private.audit_actor();

create trigger enrollments_roles before insert or update on public.enrollments
for each row execute function app_private.validate_role_references();
create trigger teacher_assignments_roles before insert or update on public.teacher_assignments
for each row execute function app_private.validate_role_references();
create trigger guardian_links_roles before insert or update on public.guardian_links
for each row execute function app_private.validate_role_references();
create trigger preferences_roles before insert or update on public.student_preferences
for each row execute function app_private.validate_role_references();
create trigger academic_history_roles before insert or update on public.academic_history
for each row execute function app_private.validate_role_references();
create trigger student_health_roles before insert or update on public.student_health
for each row execute function app_private.validate_role_references();
create trigger student_support_roles before insert or update on public.student_support
for each row execute function app_private.validate_role_references();

-- Nenhuma tabela desta base é acessível sem autenticação por grant/RLS.
alter table public.schools enable row level security;
alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.subjects enable row level security;
alter table public.classrooms enable row level security;
alter table public.enrollments enable row level security;
alter table public.teacher_assignments enable row level security;
alter table public.guardian_links enable row level security;
alter table public.student_preferences enable row level security;
alter table public.academic_history enable row level security;
alter table public.student_health enable row level security;
alter table public.student_support enable row level security;

create policy schools_read on public.schools for select to authenticated
using (id = app_private.current_school_id());

create policy profiles_read on public.profiles for select to authenticated
using (
  school_id = app_private.current_school_id()
  and (id = auth.uid() or app_private.has_role(school_id, 'coordenador')
    or app_private.can_read_student(id, school_id))
);
create policy profiles_update_name on public.profiles for update to authenticated
using (id = auth.uid() and school_id = app_private.current_school_id())
with check (id = auth.uid() and school_id = app_private.current_school_id());

-- Atribuição de escola/papéis só pelo provisionamento administrativo no servidor.
create policy user_roles_read on public.user_roles for select to authenticated
using (
  school_id = app_private.current_school_id()
  and (user_id = auth.uid() or app_private.has_role(school_id, 'coordenador'))
);
create policy subjects_read on public.subjects for select to authenticated
using (app_private.current_school_id() is not null);

create policy classrooms_read on public.classrooms for select to authenticated
using (app_private.can_read_class(id, school_id));
create policy classrooms_insert on public.classrooms for insert to authenticated
with check (app_private.has_role(school_id, 'coordenador'));
create policy classrooms_update on public.classrooms for update to authenticated
using (app_private.has_role(school_id, 'coordenador'))
with check (app_private.has_role(school_id, 'coordenador'));
create policy classrooms_delete on public.classrooms for delete to authenticated
using (app_private.has_role(school_id, 'coordenador'));

create policy enrollments_read on public.enrollments for select to authenticated
using (app_private.can_read_student(student_id, school_id));
create policy enrollments_insert on public.enrollments for insert to authenticated
with check (app_private.has_role(school_id, 'coordenador'));
create policy enrollments_update on public.enrollments for update to authenticated
using (app_private.has_role(school_id, 'coordenador'))
with check (app_private.has_role(school_id, 'coordenador'));

create policy teacher_assignments_read on public.teacher_assignments for select to authenticated
using (app_private.can_read_class(classroom_id, school_id));
create policy teacher_assignments_insert on public.teacher_assignments for insert to authenticated
with check (app_private.has_role(school_id, 'coordenador'));
create policy teacher_assignments_update on public.teacher_assignments for update to authenticated
using (app_private.has_role(school_id, 'coordenador'))
with check (app_private.has_role(school_id, 'coordenador'));
create policy teacher_assignments_delete on public.teacher_assignments for delete to authenticated
using (app_private.has_role(school_id, 'coordenador'));

create policy guardian_links_read on public.guardian_links for select to authenticated
using (
  school_id = app_private.current_school_id()
  and (app_private.has_role(school_id, 'coordenador') or guardian_id = auth.uid() or student_id = auth.uid())
);
create policy guardian_links_insert on public.guardian_links for insert to authenticated
with check (app_private.has_role(school_id, 'coordenador'));
create policy guardian_links_update on public.guardian_links for update to authenticated
using (app_private.has_role(school_id, 'coordenador'))
with check (app_private.has_role(school_id, 'coordenador'));

create policy preferences_read on public.student_preferences for select to authenticated
using (student_id = auth.uid() and app_private.has_role(school_id, 'aluno'));
create policy preferences_insert on public.student_preferences for insert to authenticated
with check (student_id = auth.uid() and app_private.has_role(school_id, 'aluno'));
create policy preferences_update on public.student_preferences for update to authenticated
using (student_id = auth.uid() and app_private.has_role(school_id, 'aluno'))
with check (student_id = auth.uid() and app_private.has_role(school_id, 'aluno'));

create policy academic_history_read on public.academic_history for select to authenticated
using (app_private.can_read_student(student_id, school_id));
create policy academic_history_insert on public.academic_history for insert to authenticated
with check (app_private.can_edit_academic(student_id, school_id, subject_id));
create policy academic_history_update on public.academic_history for update to authenticated
using (app_private.can_edit_academic(student_id, school_id, subject_id))
with check (app_private.can_edit_academic(student_id, school_id, subject_id));

create policy student_health_read on public.student_health for select to authenticated
using (app_private.can_read_student(student_id, school_id));
create policy student_health_insert on public.student_health for insert to authenticated
with check (app_private.is_guardian(student_id, school_id));
create policy student_health_update on public.student_health for update to authenticated
using (app_private.is_guardian(student_id, school_id))
with check (app_private.is_guardian(student_id, school_id));

create policy student_support_read on public.student_support for select to authenticated
using (app_private.can_read_student(student_id, school_id));
create policy student_support_insert on public.student_support for insert to authenticated
with check (app_private.is_guardian(student_id, school_id));
create policy student_support_update on public.student_support for update to authenticated
using (app_private.is_guardian(student_id, school_id))
with check (app_private.is_guardian(student_id, school_id));

-- Revogar defaults do Supabase antes de conceder a superfície necessária.
revoke all on table public.schools, public.profiles, public.user_roles, public.subjects,
  public.classrooms, public.enrollments, public.teacher_assignments, public.guardian_links,
  public.student_preferences, public.academic_history, public.student_health, public.student_support
from public, anon, authenticated;

grant select on table public.schools, public.profiles, public.user_roles, public.subjects,
  public.classrooms, public.enrollments, public.teacher_assignments, public.guardian_links,
  public.student_preferences, public.academic_history, public.student_health, public.student_support
to authenticated;
grant update (full_name) on public.profiles to authenticated;
grant insert, delete on public.classrooms to authenticated;
grant update (name, grade, school_year) on public.classrooms to authenticated;
grant insert on public.enrollments to authenticated;
grant update (status, ended_at) on public.enrollments to authenticated;
grant insert, delete on public.teacher_assignments to authenticated;
grant update (subject_id) on public.teacher_assignments to authenticated;
grant insert on public.guardian_links to authenticated;
grant update (status) on public.guardian_links to authenticated;
grant insert on public.student_preferences to authenticated;
grant update (interests, context) on public.student_preferences to authenticated;
grant insert on public.academic_history to authenticated;
grant update (school_year, period, grade, notes) on public.academic_history to authenticated;
grant insert on public.student_health, public.student_support to authenticated;
grant update (details) on public.student_health, public.student_support to authenticated;

grant all on table public.schools, public.profiles, public.user_roles, public.subjects,
  public.classrooms, public.enrollments, public.teacher_assignments, public.guardian_links,
  public.student_preferences, public.academic_history, public.student_health, public.student_support
to service_role;

revoke all on function app_private.current_school_id(),
  app_private.has_role(uuid, public.app_role), app_private.can_read_student(uuid, uuid),
  app_private.can_edit_academic(uuid, uuid, text), app_private.is_guardian(uuid, uuid),
  app_private.can_read_class(uuid, uuid), app_private.touch_updated_at(),
  app_private.bump_preferences_version(), app_private.audit_actor(), app_private.validate_role_references()
from public, anon, authenticated;
grant execute on function app_private.current_school_id(),
  app_private.has_role(uuid, public.app_role), app_private.can_read_student(uuid, uuid),
  app_private.can_edit_academic(uuid, uuid, text), app_private.is_guardian(uuid, uuid),
  app_private.can_read_class(uuid, uuid)
to authenticated, service_role;

comment on table public.student_preferences is 'Interesses do próprio aluno; version incrementa quando interesses/contexto mudam. Não inclui saúde.';
comment on table public.student_health is 'Responsável confirmado edita; perfis vinculados consultam. Não enviar automaticamente à LLM.';
comment on table public.student_support is 'Necessidades de apoio editadas por responsável confirmado.';
comment on table public.academic_history is 'Professor edita somente a matéria atribuída para aluno de turma ativa; coordenador edita na própria escola.';
comment on table public.subjects is 'Biologia é nome de navegação; o componente BNCC correspondente é Ciências.';
-- Próximas migrações: catálogo BNCC, fontes PDF/DOCX, questões/variantes, atividades,
-- tentativas idempotentes, recuperação, livro de pontos, frequência e conexões.
-- Não há gabaritos, resultados, ranking nem cálculo de pontuação nesta fundação.

commit;

