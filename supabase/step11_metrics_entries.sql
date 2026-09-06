-- Step 11: generic metrics + key/value log entries (V2 plan, section 1.1).
-- Run this once in the Supabase dashboard -> SQL Editor -> New query -> Run.
--
-- Replaces the five fixed columns on public.logs (calories, protein_g,
-- water_ml, sleep_hours, gym_done) with a metric catalog and one row per
-- (user, day, metric). This is what lets a challenge be about *anything* —
-- steps, pushups, screen time — instead of only those five, and it's what
-- lets the Personal Dashboard show the deduped union of every metric every
-- active challenge needs.
--
-- public.logs is kept (it still owns the day-level note) and is the source
-- this backfills from. Nothing is dropped, so this is safe to run on a
-- database that already has real rows.
--
-- ORDER MATTERS: the tables are created and backfilled BEFORE the day-lock
-- triggers are installed, because those triggers reject writes to past days
-- and would otherwise block the backfill itself.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- 1. profiles: timezone + display name
-- ---------------------------------------------------------------------------
-- Every "what day is it" decision is made server-side from this column, never
-- from the browser clock (anti-cheat layer 1). Defaults to UTC so existing
-- rows stay valid; Settings lets you set your real one.

alter table public.profiles
  add column if not exists timezone text not null default 'UTC',
  add column if not exists display_name text;

-- ---------------------------------------------------------------------------
-- 2. metrics — the vocabulary
-- ---------------------------------------------------------------------------
-- Built-in rows are global (owner_id null, readable by everyone). A user can
-- add their own custom metric; it's private to them.

create table if not exists public.metrics (
  id uuid primary key default gen_random_uuid(),
  key text not null check (key ~ '^[a-z][a-z0-9_]{0,39}$'),
  label text not null check (char_length(label) between 1 and 40),
  unit text,
  value_type text not null check (value_type in ('number', 'boolean')),
  default_shape text not null check (default_shape in ('at_least', 'at_most', 'range', 'boolean')),
  step numeric(10, 2) not null default 1,
  -- Anti-cheat layer 4: anything above this is auto-flagged as implausible.
  max_plausible numeric(12, 2),
  is_builtin boolean not null default false,
  owner_id uuid references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  -- A boolean metric can only ever be scored with the boolean shape, and a
  -- numeric one never with it — same pairing rule as goals_metric_shape_check.
  check (
    (value_type = 'boolean' and default_shape = 'boolean')
    or (value_type = 'number' and default_shape <> 'boolean')
  ),
  check (
    (is_builtin and owner_id is null)
    or (not is_builtin and owner_id is not null)
  )
);

create unique index if not exists metrics_builtin_key
  on public.metrics (key) where is_builtin;

create unique index if not exists metrics_owner_key
  on public.metrics (owner_id, key) where not is_builtin;

insert into public.metrics (key, label, unit, value_type, default_shape, step, max_plausible, is_builtin)
values
  ('calories',        'Calories',       'kcal',  'number',  'at_most',  10,   8000,  true),
  ('protein_g',       'Protein',        'g',     'number',  'at_least', 5,    500,   true),
  ('water_ml',        'Water',          'ml',    'number',  'at_least', 100,  10000, true),
  ('sleep_hours',     'Sleep',          'h',     'number',  'at_least', 0.5,  20,    true),
  ('gym_done',        'Gym',            null,    'boolean', 'boolean',  1,    null,  true),
  ('steps',           'Steps',          'steps', 'number',  'at_least', 500,  60000, true),
  ('weight_kg',       'Body weight',    'kg',    'number',  'at_most',  0.1,  300,   true),
  ('workout_minutes', 'Workout length', 'min',   'number',  'at_least', 5,    480,   true)
on conflict (key) where is_builtin do nothing;

alter table public.metrics enable row level security;

create policy "Anyone can read built-ins and their own metrics"
  on public.metrics for select
  using (is_builtin or owner_id = auth.uid());

create policy "Users can create their own metrics"
  on public.metrics for insert
  with check (not is_builtin and owner_id = auth.uid());

create policy "Users can update their own metrics"
  on public.metrics for update
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid() and not is_builtin);

create policy "Users can delete their own metrics"
  on public.metrics for delete
  using (owner_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 3. logs: keep the day row, add the day-level extras
-- ---------------------------------------------------------------------------

alter table public.logs
  add column if not exists tz text,
  add column if not exists note text;

-- ---------------------------------------------------------------------------
-- 4. log_entries — one row per (user, day, metric)
-- ---------------------------------------------------------------------------
-- No FK to logs: an entry stands on its own (user_id + log_date is enough),
-- so logging a metric never requires a day row to exist first.

create table if not exists public.log_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  log_date date not null,
  metric_key text not null,
  value_num numeric(12, 2),
  value_bool boolean,
  source text not null default 'manual' check (source in ('manual', 'device', 'proof')),
  -- Server clock only. Set by the trigger below, never by the client.
  logged_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  is_late boolean not null default false,
  edit_count smallint not null default 0,
  implausible boolean not null default false,
  unique (user_id, log_date, metric_key),
  -- Exactly one of the two value columns, matching the metric's value_type.
  check (num_nonnulls(value_num, value_bool) = 1)
);

create index if not exists log_entries_user_date on public.log_entries (user_id, log_date);

alter table public.log_entries enable row level security;

create policy "Users can view own entries"
  on public.log_entries for select
  using (auth.uid() = user_id);

create policy "Users can insert own entries"
  on public.log_entries for insert
  with check (auth.uid() = user_id);

create policy "Users can update own entries"
  on public.log_entries for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete own entries"
  on public.log_entries for delete
  using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- 5. log_edits — append-only audit trail (anti-cheat layer 3)
-- ---------------------------------------------------------------------------
-- Written by a trigger, never by the app. There is deliberately no update or
-- delete policy: nobody, including the row's owner, can rewrite their history.

create table if not exists public.log_edits (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.log_entries (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  old_num numeric(12, 2),
  old_bool boolean,
  new_num numeric(12, 2),
  new_bool boolean,
  edited_at timestamptz not null default now()
);

create index if not exists log_edits_entry on public.log_edits (entry_id);

alter table public.log_edits enable row level security;

create policy "Users can view own edit history"
  on public.log_edits for select
  using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- 6. Backfill from the old fixed columns (BEFORE the triggers exist)
-- ---------------------------------------------------------------------------

insert into public.log_entries (user_id, log_date, metric_key, value_num, logged_at, updated_at)
select l.user_id, l.log_date, m.key, m.value, l.updated_at, l.updated_at
from public.logs l
cross join lateral (
  values
    ('calories', l.calories),
    ('protein_g', l.protein_g),
    ('water_ml', l.water_ml),
    ('sleep_hours', l.sleep_hours)
) as m(key, value)
where m.value is not null
on conflict (user_id, log_date, metric_key) do nothing;

insert into public.log_entries (user_id, log_date, metric_key, value_bool, logged_at, updated_at)
select l.user_id, l.log_date, 'gym_done', l.gym_done, l.updated_at, l.updated_at
from public.logs l
on conflict (user_id, log_date, metric_key) do nothing;

-- ---------------------------------------------------------------------------
-- 7. The day lock (anti-cheat layers 1-4), enforced in the database
-- ---------------------------------------------------------------------------
-- Putting this in a trigger rather than in the server action matters: it holds
-- even if someone calls the REST API directly with their own anon-key session.
--
-- Editable window: today in your own timezone, plus yesterday until 10:00
-- local. After that the day is frozen — which is what stops backfilling a
-- perfect month on the final day of a challenge.

create or replace function public.log_entry_guard()
returns trigger
language plpgsql
as $$
declare
  v_row public.log_entries;
  v_tz text;
  v_local_now timestamp;
  v_today date;
  v_editable boolean;
  v_max numeric;
  v_changed boolean;
begin
  if tg_op = 'DELETE' then
    v_row := old;
  else
    v_row := new;
  end if;

  select coalesce(p.timezone, 'UTC') into v_tz
  from public.profiles p
  where p.id = v_row.user_id;

  v_tz := coalesce(v_tz, 'UTC');
  v_local_now := now() at time zone v_tz;
  v_today := v_local_now::date;

  if v_row.log_date > v_today then
    raise exception 'You cannot log a day that has not happened yet.'
      using errcode = 'check_violation';
  end if;

  v_editable :=
    v_row.log_date = v_today
    or (v_row.log_date = v_today - 1 and v_local_now::time < time '10:00');

  if not v_editable then
    raise exception 'That day is locked. You can edit today, and yesterday until 10:00.'
      using errcode = 'check_violation';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  if tg_op = 'INSERT' then
    new.logged_at := now();
    -- An entry written after its own day closed is marked late for the whole
    -- of its life. The buddy's feed shows it; no score penalty is applied.
    new.is_late := new.log_date < v_today;
    new.edit_count := 0;
  else
    new.logged_at := old.logged_at;
    new.is_late := old.is_late;
    v_changed :=
      old.value_num is distinct from new.value_num
      or old.value_bool is distinct from new.value_bool;
    new.edit_count := old.edit_count + (case when v_changed then 1 else 0 end);
  end if;

  new.updated_at := now();

  select m.max_plausible into v_max
  from public.metrics m
  where m.key = new.metric_key
    and (m.is_builtin or m.owner_id = new.user_id)
  order by m.is_builtin desc
  limit 1;

  new.implausible := v_max is not null
    and new.value_num is not null
    and new.value_num > v_max;

  return new;
end;
$$;

drop trigger if exists log_entry_guard_trigger on public.log_entries;
create trigger log_entry_guard_trigger
  before insert or update or delete on public.log_entries
  for each row execute function public.log_entry_guard();

create or replace function public.log_entry_audit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.value_num is distinct from new.value_num
     or old.value_bool is distinct from new.value_bool then
    insert into public.log_edits (entry_id, user_id, old_num, old_bool, new_num, new_bool)
    values (new.id, new.user_id, old.value_num, old.value_bool, new.value_num, new.value_bool);
  end if;
  return null;
end;
$$;

drop trigger if exists log_entry_audit_trigger on public.log_entries;
create trigger log_entry_audit_trigger
  after update on public.log_entries
  for each row execute function public.log_entry_audit();
