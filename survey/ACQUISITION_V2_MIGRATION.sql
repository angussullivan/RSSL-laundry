-- RSSL Acquisition Survey V2 — ADDITIVE, idempotent database migration
-- Apply in the RSSL Customer Survey Supabase project's SQL Editor:
-- https://supabase.com/dashboard/project/mfsdnfhoifahvlsjzzxf/sql/new
--
-- Safe for existing clients and unsent offline V1 submissions. Existing columns,
-- primary keys, check constraints, and RLS policies are intentionally untouched.
-- New channel detail is separate from legacy discovery_source to avoid widening
-- an unknown legacy CHECK constraint. Never run this on another Supabase project.

begin;

alter table public.rssl_customer_surveys
  add column if not exists choice_reason text,
  add column if not exists customer_context text,
  add column if not exists discovery_detail text,
  add column if not exists survey_language text,
  add column if not exists survey_version smallint default 1;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.rssl_customer_surveys'::regclass
      and conname='rssl_v2_reason_check'
  ) then
    alter table public.rssl_customer_surveys
      add constraint rssl_v2_reason_check
      check (choice_reason is null or choice_reason in
        ('location','hours','reviews','price','card','machine','referral','other'));
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.rssl_customer_surveys'::regclass
      and conname='rssl_v2_context_check'
  ) then
    alter table public.rssl_customer_surveys
      add constraint rssl_v2_context_check
      check (customer_context is null or customer_context in
        ('resident','work_study','staying_nearby','visiting_area','prefer_not'));
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.rssl_customer_surveys'::regclass
      and conname='rssl_v2_discovery_detail_check'
  ) then
    alter table public.rssl_customer_surveys
      add constraint rssl_v2_discovery_detail_check
      check (discovery_detail is null or discovery_detail in
        ('host_referral','apple_maps','other'));
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.rssl_customer_surveys'::regclass
      and conname='rssl_v2_language_check'
  ) then
    alter table public.rssl_customer_surveys
      add constraint rssl_v2_language_check
      check (survey_language is null or survey_language in
        ('en','zh-CN','zh-TW','ja','ko','hi','id','es','fr','pt-BR','de'));
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.rssl_customer_surveys'::regclass
      and conname='rssl_v2_version_check'
  ) then
    alter table public.rssl_customer_surveys
      add constraint rssl_v2_version_check
      check (survey_version is null or survey_version in (1,2));
  end if;
end $$;

comment on column public.rssl_customer_surveys.choice_reason is
  'V2 acquisition: principal reason for choosing RSSL; first-time/unknown branch only.';
comment on column public.rssl_customer_surveys.customer_context is
  'V2 acquisition: local resident, nearby worker/student or visitor; no address collected.';
comment on column public.rssl_customer_surveys.discovery_detail is
  'V2 discovery refinement: host referral or Apple Maps; discovery_source remains legacy other.';
comment on column public.rssl_customer_surveys.survey_language is
  'Kiosk presentation preference, NOT demographic ethnicity or nationality.';
comment on column public.rssl_customer_surveys.survey_version is
  '1=original survey, 2=acquisition survey with conditional questions.';

commit;

-- VERIFICATION (read-only): run after the migration; five rows should appear.
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema='public'
  and table_name='rssl_customer_surveys'
  and column_name in
    ('choice_reason','customer_context','discovery_detail','survey_language','survey_version')
order by column_name;

-- SECURITY CHECK (read-only): table RLS should be enabled, and public browser
-- clients should not be allowed to SELECT/UPDATE/DELETE survey responses.
select relname, relrowsecurity
from pg_class
where oid='public.rssl_customer_surveys'::regclass;
