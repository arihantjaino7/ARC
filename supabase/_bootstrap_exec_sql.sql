-- One-time bootstrap. Paste this once into the Supabase dashboard -> SQL
-- Editor -> Run. After this, every migration in supabase/*.sql is applied
-- directly (via scripts/run-sql.mjs, using the service_role key) instead of
-- being pasted here by hand.
--
-- What this does: lets a service_role-authenticated request run an arbitrary
-- SQL string through a single RPC call. Execution is revoked from every
-- other Postgres role (public, anon, authenticated) and granted only to
-- service_role, so a real signed-in user calling this RPC through the normal
-- app (anon/authenticated JWT) gets a permission error, not arbitrary SQL
-- execution — this does not open a privilege-escalation path for app users.
--
-- Security note worth knowing: the service_role key already bypasses RLS on
-- every table (full read/write on all data). This function additionally lets
-- a leaked service_role key run schema changes (create/alter/drop tables,
-- policies), which the key alone couldn't do via the REST API before. If
-- that tradeoff stops being worth it, remove this function any time with:
--   drop function if exists public.exec_sql(text);

create or replace function public.exec_sql(query text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  execute query;
end;
$$;

revoke execute on function public.exec_sql(text) from public, anon, authenticated;
grant execute on function public.exec_sql(text) to service_role;
