-- Run after the migration in SQL Editor. All fixtures are rolled back.
-- These checks use real RLS roles and the same compare-and-swap UPDATE as the client.
begin;

create temp table easyfitness_test_users (
  alice uuid, bob uuid,
  alice_record_revision bigint, bob_record_revision bigint,
  alice_profile_revision bigint, bob_profile_revision bigint
);
insert into easyfitness_test_users (alice, bob) values (gen_random_uuid(), gen_random_uuid());
grant select on easyfitness_test_users to authenticated;

insert into auth.users (id, email, aud, role)
select alice, alice::text || '@example.invalid', 'authenticated', 'authenticated'
from easyfitness_test_users
union all
select bob, bob::text || '@example.invalid', 'authenticated', 'authenticated'
from easyfitness_test_users;

insert into public.daily_records (user_id, date, data, revision, updated_at)
select id, '2026-10-28',
  '{"date":"2026-10-28","weightKg":70,"sleepHours":8,"training":"","foods":[],"unestimatedMeals":[]}',
  -1, '2000-01-01'
from (select alice as id from easyfitness_test_users union all select bob from easyfitness_test_users) users;

insert into public.user_profiles (user_id, data, revision)
select id,
  '{"version":1,"id":"test-profile","createdAt":"2026-10-28T00:00:00Z","updatedAt":"2026-10-28T00:00:00Z","facts":{},"estimates":{},"onboarding":{"completed":true,"source":"natural-language"}}',
  -1
from (select alice as id from easyfitness_test_users union all select bob from easyfitness_test_users) users;

update easyfitness_test_users set
  alice_record_revision = (select revision from public.daily_records where user_id = alice),
  bob_record_revision = (select revision from public.daily_records where user_id = bob),
  alice_profile_revision = (select revision from public.user_profiles where user_id = alice),
  bob_profile_revision = (select revision from public.user_profiles where user_id = bob);

select set_config('request.jwt.claim.sub', alice::text, true) from easyfitness_test_users;
select set_config('request.jwt.claims', jsonb_build_object('sub', alice, 'role', 'authenticated')::text, true)
from easyfitness_test_users;
set local role authenticated;

do $$
declare
  alice_id uuid := (select alice from easyfitness_test_users);
  bob_id uuid := (select bob from easyfitness_test_users);
  changed integer;
  saved_revision bigint;
  old_record_revision bigint := (select alice_record_revision from easyfitness_test_users);
  old_profile_revision bigint := (select alice_profile_revision from easyfitness_test_users);
  saved_profile_revision bigint;
  profile_data jsonb;
begin
  if (select count(*) from public.daily_records) <> 1
    or (select count(*) from public.user_profiles) <> 1 then
    raise exception 'RLS exposed another account';
  end if;
  if exists (select 1 from public.daily_records where user_id = bob_id)
    or exists (select 1 from public.user_profiles where user_id = bob_id) then
    raise exception 'Explicit cross-account SELECT was allowed';
  end if;
  if old_record_revision < 1 or old_profile_revision < 1 then
    raise exception 'INSERT trusted a client-supplied revision';
  end if;
  if exists (select 1 from public.daily_records where updated_at < transaction_timestamp()) then
    raise exception 'INSERT trusted a client-supplied timestamp';
  end if;
  if has_function_privilege(current_user, 'public.easyfitness_version_row()', 'EXECUTE') then
    raise exception 'A client can invoke the privileged trigger function directly';
  end if;
  begin
    perform nextval('public.easyfitness_revision_seq');
    raise exception 'A client can allocate revisions directly';
  exception when insufficient_privilege then null;
  end;

  update public.daily_records set data = jsonb_set(data, '{training}', '"walking"'), revision = -1, updated_at = '2000-01-01'
  where user_id = alice_id and date = '2026-10-28' and revision = old_record_revision
  returning revision into saved_revision;
  if saved_revision is null or saved_revision <= old_record_revision then
    raise exception 'A successful CAS must receive a new server revision';
  end if;
  if exists (select 1 from public.daily_records where updated_at < transaction_timestamp()) then
    raise exception 'UPDATE trusted a client-supplied timestamp';
  end if;
  -- A second caller that loaded the old revision cannot overwrite the first caller.
  update public.daily_records set data = jsonb_set(data, '{training}', '"stale write"')
  where user_id = alice_id and date = '2026-10-28' and revision = old_record_revision;
  get diagnostics changed = row_count;
  if changed <> 0 then raise exception 'Stale daily-record write succeeded'; end if;

  update public.user_profiles set data = jsonb_set(data, '{id}', '"changed-profile"'), revision = -1
  where user_id = alice_id and revision = old_profile_revision returning revision into saved_profile_revision;
  if saved_profile_revision is null or saved_profile_revision <= old_profile_revision then
    raise exception 'Profile CAS failed';
  end if;
  delete from public.user_profiles where user_id = alice_id and revision = old_profile_revision;
  get diagnostics changed = row_count;
  if changed <> 0 then raise exception 'Stale profile deletion succeeded'; end if;

  update public.daily_records set data = data where user_id = bob_id;
  get diagnostics changed = row_count;
  if changed <> 0 then raise exception 'Cross-account record UPDATE succeeded'; end if;
  delete from public.daily_records where user_id = bob_id;
  get diagnostics changed = row_count;
  if changed <> 0 then raise exception 'Cross-account record DELETE succeeded'; end if;
  update public.user_profiles set data = data where user_id = bob_id;
  get diagnostics changed = row_count;
  if changed <> 0 then raise exception 'Cross-account profile UPDATE succeeded'; end if;
  delete from public.user_profiles where user_id = bob_id;
  get diagnostics changed = row_count;
  if changed <> 0 then raise exception 'Cross-account profile DELETE succeeded'; end if;

  begin
    insert into public.daily_records (user_id, date, data)
    values (bob_id, '2026-10-29', '{"date":"2026-10-29","weightKg":null,"sleepHours":null,"training":"","foods":[],"unestimatedMeals":[]}');
    raise exception 'Cross-account record INSERT succeeded';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.user_profiles (user_id, data)
    select bob_id, data from public.user_profiles where user_id = alice_id;
    raise exception 'Cross-account profile INSERT succeeded';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.daily_records set user_id = bob_id where user_id = alice_id;
    raise exception 'Changing record owner succeeded';
  exception when check_violation then null;
  end;
  begin
    update public.daily_records set date = '2026-10-29', data = jsonb_set(data, '{date}', '"2026-10-29"')
    where user_id = alice_id;
    raise exception 'Changing record date succeeded';
  exception when check_violation then null;
  end;
  begin
    update public.user_profiles set user_id = bob_id where user_id = alice_id;
    raise exception 'Changing profile owner succeeded';
  exception when check_violation then null;
  end;

  insert into public.daily_records (user_id, date, data)
  values (alice_id, '2026-10-29', '{"date":"2026-10-29","weightKg":null,"sleepHours":null,"training":"","foods":[],"unestimatedMeals":[]}');
  delete from public.daily_records where user_id = alice_id and date = '2026-10-29';
  get diagnostics changed = row_count;
  if changed <> 1 then raise exception 'Own record INSERT/DELETE failed'; end if;
  select data into profile_data from public.user_profiles where user_id = alice_id;
  delete from public.user_profiles where user_id = alice_id and revision = saved_profile_revision;
  get diagnostics changed = row_count;
  if changed <> 1 then raise exception 'Own profile DELETE failed'; end if;
  insert into public.user_profiles (user_id, data) values (alice_id, profile_data)
  returning revision into saved_revision;
  if saved_revision <= saved_profile_revision then raise exception 'Profile recreation reused a revision'; end if;
  delete from public.user_profiles where user_id = alice_id and revision = saved_profile_revision;
  get diagnostics changed = row_count;
  if changed <> 0 then raise exception 'A stale delete removed a recreated profile (ABA)'; end if;
end;
$$;

reset role;
select set_config('request.jwt.claim.sub', bob::text, true) from easyfitness_test_users;
select set_config('request.jwt.claims', jsonb_build_object('sub', bob, 'role', 'authenticated')::text, true)
from easyfitness_test_users;
set local role authenticated;
do $$
begin
  if (select count(*) from public.daily_records) <> 1
    or (select revision from public.daily_records) <> (select bob_record_revision from easyfitness_test_users)
    or (select count(*) from public.user_profiles) <> 1
    or (select revision from public.user_profiles) <> (select bob_profile_revision from easyfitness_test_users) then
    raise exception 'The other account was modified or can see Alice data';
  end if;
end;
$$;

reset role;
set local role anon;
do $$
begin
  begin
    perform 1 from public.daily_records;
    raise exception 'Anonymous record access was allowed';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from public.user_profiles;
    raise exception 'Anonymous profile access was allowed';
  exception when insufficient_privilege then null;
  end;
end;
$$;
reset role;
rollback;
