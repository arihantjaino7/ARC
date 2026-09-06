-- Step 9: link each goal to the log metric it's scored against.
-- Run this once in the Supabase dashboard -> SQL Editor -> New query -> Run.
--
-- Goals (Step 7) have a free-text name and no link to a specific number.
-- Logs (Step 8) have five fixed columns: calories, protein_g, water_ml,
-- sleep_hours, gym_done. This adds `metric` so a goal knows which of those
-- five columns to score itself against. Boolean-shaped goals only make sense
-- against gym_done (the only boolean log field), everything else picks one
-- of the four numeric fields.

alter table public.goals add column if not exists metric text;

update public.goals
set metric = case when shape = 'boolean' then 'gym_done' else 'calories' end
where metric is null;

alter table public.goals alter column metric set not null;

alter table public.goals
  add constraint goals_metric_check
  check (metric in ('calories', 'protein_g', 'water_ml', 'sleep_hours', 'gym_done'));

alter table public.goals
  add constraint goals_metric_shape_check
  check (
    (shape = 'boolean' and metric = 'gym_done')
    or (shape <> 'boolean' and metric <> 'gym_done')
  );
