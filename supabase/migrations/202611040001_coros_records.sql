-- Run after the workspace and record-features migrations.
-- COROS values are confirmed source estimates; food calories remain unchanged.
begin;

alter table public.daily_records
  drop constraint if exists daily_record_coros_shape;
alter table public.daily_records
  add constraint daily_record_coros_shape check (
    (
      not (data ? 'coros')
      or (
        jsonb_typeof(data -> 'coros') = 'object'
        and (data -> 'coros') ?& array['sourceDate', 'sleepHours', 'activeCaloriesKcal', 'syncedAt']
        and (data -> 'coros') - array['sourceDate', 'sleepHours', 'activeCaloriesKcal', 'syncedAt'] = '{}'::jsonb
        and jsonb_typeof(data -> 'coros' -> 'sourceDate') = 'string'
        and data -> 'coros' ->> 'sourceDate' = date::text
        and case jsonb_typeof(data -> 'coros' -> 'sleepHours')
          when 'null' then true
          when 'number' then (data -> 'coros' ->> 'sleepHours')::numeric between 0 and 24
          else false
        end
        and case jsonb_typeof(data -> 'coros' -> 'activeCaloriesKcal')
          when 'null' then true
          when 'number' then (data -> 'coros' ->> 'activeCaloriesKcal')::numeric between 0 and 30000
          else false
        end
        and (
          data -> 'coros' -> 'sleepHours' <> 'null'::jsonb
          or data -> 'coros' -> 'activeCaloriesKcal' <> 'null'::jsonb
        )
        and case when
          jsonb_typeof(data -> 'coros' -> 'syncedAt') = 'string'
          and data -> 'coros' ->> 'syncedAt' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9](\.[0-9]{1,3})?Z$'
          then (data -> 'coros' ->> 'syncedAt')::timestamptz is not null
          else false
        end
      )
    ) is true
  );

-- An older browser may read JSONB and strip fields it does not understand.
-- Reject that update rather than silently destroying confirmed device data.
create or replace function public.easyfitness_preserve_coros_data()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.data ? 'coros' and not (new.data ? 'coros') then
    raise exception 'This client cannot remove COROS record data' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function public.easyfitness_preserve_coros_data() from public, anon, authenticated;

drop trigger if exists daily_records_preserve_coros on public.daily_records;
create trigger daily_records_preserve_coros before update on public.daily_records
for each row execute function public.easyfitness_preserve_coros_data();

commit;
