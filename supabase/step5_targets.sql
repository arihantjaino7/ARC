-- Step 5: recommendation calculator.
-- Run this once in the Supabase dashboard -> SQL Editor -> New query -> Run.
-- Adds `sex` (needed for the BMR formula) and the four editable daily targets
-- to the existing profiles table from Step 4.

alter table public.profiles
  add column if not exists sex text check (sex in ('male', 'female')),
  add column if not exists target_calories smallint check (target_calories between 800 and 6000),
  add column if not exists target_protein_g smallint check (target_protein_g between 0 and 500),
  add column if not exists target_water_ml integer check (target_water_ml between 0 and 10000),
  add column if not exists target_sleep_hours numeric(3, 1) check (target_sleep_hours between 0 and 14);
