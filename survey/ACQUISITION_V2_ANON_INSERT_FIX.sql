-- RSSL SURVEY: Restore only the anonymous INSERT privilege
-- This addresses PostgREST SQLSTATE 42501 "permission denied for table".
-- Run in the RSSL Customer Survey project SQL Editor ONLY:
-- https://supabase.com/dashboard/project/mfsdnfhoifahvlsjzzxf/sql/new
--
-- This does NOT grant public SELECT, UPDATE or DELETE.
-- Existing RLS policies and historical data are preserved.

begin;

alter table public.rssl_customer_surveys enable row level security;

grant usage on schema public to anon;
grant insert on table public.rssl_customer_surveys to anon;

commit;

-- Verify privilege and privacy configuration.
select
  (select relrowsecurity from pg_class
   where oid='public.rssl_customer_surveys'::regclass) as rls_enabled,
  has_table_privilege('anon','public.rssl_customer_surveys','INSERT') as anon_insert_granted,
  has_table_privilege('anon','public.rssl_customer_surveys','SELECT') as anon_select_granted,
  has_table_privilege('anon','public.rssl_customer_surveys','UPDATE') as anon_update_granted,
  has_table_privilege('anon','public.rssl_customer_surveys','DELETE') as anon_delete_granted;

-- Informational only. Existing INSERT RLS policy still applies.
select policyname, cmd, roles, with_check
from pg_policies
where schemaname='public'
  and tablename='rssl_customer_surveys'
order by policyname;
