-- Separate RPC keeps existing strict catalog payloads compatible with older deployments.
begin;
create function public.learning_classroom_name(p_school uuid, p_class uuid)
returns text language plpgsql stable security definer set search_path = pg_catalog
as $$
declare result text;
begin
  select name into result from public.classrooms where id = p_class and school_id = p_school;
  if not found then raise exception 'LEARNING_NOT_FOUND'; end if;
  return result;
end;
$$;
revoke all on function public.learning_classroom_name(uuid, uuid) from public, anon, authenticated;
grant execute on function public.learning_classroom_name(uuid, uuid) to service_role;
commit;
