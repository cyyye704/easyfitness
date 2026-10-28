-- Existing JSONB rows need no rewrite. Missing fields are legacy, unconfirmed data.
-- Run after 202610280001_workspace.sql, including on projects that already ran it.
begin;

alter table public.daily_records
  drop constraint if exists daily_record_confirmation_shape;
alter table public.daily_records
  add constraint daily_record_confirmation_shape check (
    (
      not (data ? 'trainingStatus')
      or (
        jsonb_typeof(data -> 'trainingStatus') = 'string'
        and data ->> 'trainingStatus' in ('unrecorded', 'trained', 'rest')
      )
    )
    and (
      not (data ? 'nutritionComplete')
      or (
        jsonb_typeof(data -> 'nutritionComplete') = 'boolean'
        and (
          data -> 'nutritionComplete' = 'false'::jsonb
          or jsonb_array_length(data -> 'unestimatedMeals') = 0
        )
      )
    )
  );

commit;
