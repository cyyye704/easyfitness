-- Run this entire file in the SQL Editor of a new Supabase project.
begin;

create table if not exists public.daily_records (
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  data jsonb not null,
  revision bigint not null default 1 check (revision between 1 and 9007199254740991),
  updated_at timestamptz not null default now(),
  primary key (user_id, date),
  constraint daily_record_shape check (
    jsonb_typeof(data) = 'object'
    and data ?& array['date', 'weightKg', 'sleepHours', 'training', 'foods', 'unestimatedMeals']
    and jsonb_typeof(data -> 'date') = 'string'
    and data ->> 'date' = date::text
    and jsonb_typeof(data -> 'training') = 'string'
    and jsonb_typeof(data -> 'foods') = 'array'
    and jsonb_typeof(data -> 'unestimatedMeals') = 'array'
    and jsonb_typeof(data -> 'weightKg') in ('number', 'null')
    and jsonb_typeof(data -> 'sleepHours') in ('number', 'null')
  )
);

create table if not exists public.user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null,
  revision bigint not null default 1 check (revision between 1 and 9007199254740991),
  updated_at timestamptz not null default now(),
  constraint user_profile_shape check (
    jsonb_typeof(data) = 'object'
    and data ?& array['version', 'id', 'createdAt', 'updatedAt', 'facts', 'estimates', 'onboarding']
    and data -> 'version' = '1'::jsonb
    and jsonb_typeof(data -> 'id') = 'string'
    and jsonb_typeof(data -> 'createdAt') = 'string'
    and jsonb_typeof(data -> 'updatedAt') = 'string'
    and jsonb_typeof(data -> 'facts') = 'object'
    and jsonb_typeof(data -> 'estimates') = 'object'
    and jsonb_typeof(data -> 'onboarding') = 'object'
    and data -> 'onboarding' @> '{"completed":true,"source":"natural-language"}'::jsonb
  )
);

-- A sequence also prevents stale writes after an entity is deleted and recreated.
create sequence if not exists public.easyfitness_revision_seq
  as bigint minvalue 1 maxvalue 9007199254740991 no cycle;
revoke all on sequence public.easyfitness_revision_seq from public, anon, authenticated;

-- Revision and timestamps always come from the database, never the browser.
-- The tightly scoped definer trigger is the only way clients can use the sequence.
create or replace function public.easyfitness_version_row()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    if new.user_id is distinct from old.user_id then
      raise exception 'The record owner cannot be changed' using errcode = '23514';
    end if;
    if tg_table_name = 'daily_records' then
      if new.date is distinct from old.date then
        raise exception 'The record date cannot be changed' using errcode = '23514';
      end if;
    end if;
  end if;
  new.revision := nextval('public.easyfitness_revision_seq'::regclass);
  new.updated_at := statement_timestamp();
  return new;
end;
$$;

revoke all on function public.easyfitness_version_row() from public, anon, authenticated;

drop trigger if exists daily_records_version on public.daily_records;
create trigger daily_records_version before insert or update on public.daily_records
for each row execute function public.easyfitness_version_row();

drop trigger if exists user_profiles_version on public.user_profiles;
create trigger user_profiles_version before insert or update on public.user_profiles
for each row execute function public.easyfitness_version_row();

alter table public.daily_records enable row level security;
alter table public.daily_records force row level security;
alter table public.user_profiles enable row level security;
alter table public.user_profiles force row level security;

revoke all on public.daily_records, public.user_profiles from public, anon;
grant select, insert, update, delete on public.daily_records, public.user_profiles to authenticated;

drop policy if exists daily_records_select_own on public.daily_records;
create policy daily_records_select_own on public.daily_records for select to authenticated
using ((select auth.uid()) = user_id);
drop policy if exists daily_records_insert_own on public.daily_records;
create policy daily_records_insert_own on public.daily_records for insert to authenticated
with check ((select auth.uid()) = user_id);
drop policy if exists daily_records_update_own on public.daily_records;
create policy daily_records_update_own on public.daily_records for update to authenticated
using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists daily_records_delete_own on public.daily_records;
create policy daily_records_delete_own on public.daily_records for delete to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists user_profiles_select_own on public.user_profiles;
create policy user_profiles_select_own on public.user_profiles for select to authenticated
using ((select auth.uid()) = user_id);
drop policy if exists user_profiles_insert_own on public.user_profiles;
create policy user_profiles_insert_own on public.user_profiles for insert to authenticated
with check ((select auth.uid()) = user_id);
drop policy if exists user_profiles_update_own on public.user_profiles;
create policy user_profiles_update_own on public.user_profiles for update to authenticated
using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists user_profiles_delete_own on public.user_profiles;
create policy user_profiles_delete_own on public.user_profiles for delete to authenticated
using ((select auth.uid()) = user_id);

commit;
