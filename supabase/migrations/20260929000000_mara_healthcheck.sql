-- Tiny read-only RPC used by the scheduled GitHub Actions activity ping.
-- Calls execute as anon and count as database activity without reading user data.
create or replace function public.mara_healthcheck()
returns integer
language sql
immutable
security invoker
as $$
  select 1;
$$;

revoke all on function public.mara_healthcheck() from public;
grant execute on function public.mara_healthcheck() to anon, authenticated;
