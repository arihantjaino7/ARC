-- Step 12 (V2 Step 3): challenge tables (docs/PLAN-V2.md §2).
-- Run once via `node scripts/run-sql.mjs supabase/step12_challenges.sql`
-- (or paste into the Supabase dashboard -> SQL Editor -> Run).
--
-- SQL only, no UI yet (that's V2 Steps 5+). Nothing existing is touched, so
-- this is safe to run alongside real data in profiles/goals/logs/log_entries.
--
-- Two rules are enforced here, not just in the UI (docs/PLAN-V2.md §2, §4.2):
--   1. A rule is never edited in place once inserted — only effective_to may
--      ever change on an existing row (challenge_rule_immutable_guard below).
--      An edit means: close this row (effective_to), insert a replacement
--      starting tomorrow. This is anti-cheat rule #1: nobody can see a bad
--      score and retroactively lower the target.
--   2. A partial unique index blocks two live (effective_to is null) rules
--      for the same metric on the same challenge.
--
-- week_anchor from the §2 sketch is deliberately NOT a stored column: "week
-- boundaries anchor to start_date's weekday" (V2 Step 4) is fully derivable
-- from challenges.start_date, so storing it separately would just be a
-- second source of truth that could drift from it.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- 1. challenges
-- ---------------------------------------------------------------------------
-- kind='community' reuses this same table later (docs/PLAN-V2.md §6) rather
-- than forking a parallel schema.

create table if not exists public.challenges (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('buddy', 'community')),
  name text not null check (char_length(name) between 1 and 60),
  created_by uuid not null references auth.users (id) on delete cascade,
  start_date date not null,
  end_date date not null check (end_date >= start_date),
  stake_text text check (stake_text is null or char_length(stake_text) <= 200),
  status text not null default 'draft'
    check (status in ('draft', 'pending', 'active', 'completed', 'cancelled')),
  -- Holds blind_mode (V2 Step 11) and future per-challenge toggles.
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 2. challenge_participants
-- ---------------------------------------------------------------------------

create table if not exists public.challenge_participants (
  challenge_id uuid not null references public.challenges (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  status text not null default 'invited'
    check (status in ('invited', 'accepted', 'declined', 'left')),
  joined_at timestamptz,
  primary key (challenge_id, user_id)
);

-- ---------------------------------------------------------------------------
-- 3. challenge_rules
-- ---------------------------------------------------------------------------
-- Same {shape, target, min, max, weight} fields as public.goals (Step 7), on
-- purpose: src/lib/scoring/engine.ts's scoreGoal/calculateDayScore are reused
-- unchanged by the rollup (V2 Step 4).
--
-- scope='shared': one number both sides race against — lives on the rule
-- itself, so the same shape-vs-fields check from goals_check applies.
-- scope='own': each participant sets their own number in
-- challenge_rule_targets instead, so the rule's own target/min/max stay null
-- regardless of shape.

create table if not exists public.challenge_rules (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references public.challenges (id) on delete cascade,
  metric_key text not null,
  shape text not null check (shape in ('at_least', 'at_most', 'range', 'boolean')),
  scope text not null check (scope in ('shared', 'own')),
  target numeric(10, 2),
  min numeric(10, 2),
  max numeric(10, 2),
  weight smallint not null default 1 check (weight between 1 and 5),
  period text not null default 'daily' check (period in ('daily', 'weekly')),
  -- Gym-style scheduling (docs/PLAN-V2.md §2, "Gym days and rest days"):
  -- {"mode":"flexible","sessionsPerWeek":n} or
  -- {"mode":"fixed_days","days":[0..6]} (0=Sun, matching JS Date#getUTCDay()).
  -- Null for rules that don't need it (period='daily', not gym-shaped).
  schedule jsonb,
  requires_proof boolean not null default false,
  effective_from date not null default current_date,
  -- Inclusive last active day. Null = still active. Never edited once set to
  -- a real date except by the guard trigger's own bookkeeping below.
  effective_to date,
  created_by uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  check (effective_to is null or effective_to >= effective_from),
  check (
    (scope = 'own' and target is null and min is null and max is null)
    or (scope = 'shared' and (
      (shape in ('at_least', 'at_most') and target is not null and min is null and max is null)
      or (shape = 'range' and min is not null and max is not null and max > min and target is null)
      or (shape = 'boolean' and target is null and min is null and max is null)
    ))
  )
);

-- Rule #2: a challenge can never have two live rules for the same metric.
create unique index if not exists challenge_rules_one_live_per_metric
  on public.challenge_rules (challenge_id, metric_key)
  where effective_to is null;

create index if not exists challenge_rules_challenge on public.challenge_rules (challenge_id);

-- Rule #1: once inserted, only effective_to may ever change. Every other
-- field is fixed for the life of the row — "editing" a rule is always
-- close-this-row-and-insert-a-replacement, done at the application layer.
create or replace function public.challenge_rule_immutable_guard()
returns trigger
language plpgsql
as $$
begin
  if new.challenge_id is distinct from old.challenge_id
    or new.metric_key is distinct from old.metric_key
    or new.shape is distinct from old.shape
    or new.scope is distinct from old.scope
    or new.target is distinct from old.target
    or new.min is distinct from old.min
    or new.max is distinct from old.max
    or new.weight is distinct from old.weight
    or new.period is distinct from old.period
    or new.schedule is distinct from old.schedule
    or new.requires_proof is distinct from old.requires_proof
    or new.effective_from is distinct from old.effective_from
    or new.created_by is distinct from old.created_by
  then
    raise exception
      'A challenge rule cannot be edited in place. Close it (effective_to) and insert a replacement.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists challenge_rule_immutable_guard_trigger on public.challenge_rules;
create trigger challenge_rule_immutable_guard_trigger
  before update on public.challenge_rules
  for each row execute function public.challenge_rule_immutable_guard();

-- ---------------------------------------------------------------------------
-- 4. challenge_rule_targets — per-participant numbers for scope='own' rules
-- ---------------------------------------------------------------------------

create table if not exists public.challenge_rule_targets (
  rule_id uuid not null references public.challenge_rules (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  target numeric(10, 2),
  min numeric(10, 2),
  max numeric(10, 2),
  primary key (rule_id, user_id),
  check (min is null or max is null or max > min)
);

-- ---------------------------------------------------------------------------
-- 5. challenge_invites
-- ---------------------------------------------------------------------------

create table if not exists public.challenge_invites (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references public.challenges (id) on delete cascade,
  -- Built from two gen_random_uuid()s rather than pgcrypto's gen_random_bytes:
  -- gen_random_uuid is core Postgres (13+), so it doesn't depend on pgcrypto
  -- being installed on whatever schema is on the current search_path.
  token text not null unique
    default (replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')),
  created_by uuid not null references auth.users (id) on delete cascade,
  expires_at timestamptz not null default (now() + interval '14 days'),
  accepted_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 6. RLS
-- ---------------------------------------------------------------------------
-- A plain "select from challenge_participants inside its own policy" would
-- work but is the classic self-referencing-RLS footgun to reason about. A
-- security-definer helper sidesteps that: it runs with RLS bypassed, so it's
-- just an ordinary membership check reused across every table's policies.

create or replace function public.is_challenge_participant(p_challenge_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.challenge_participants cp
    where cp.challenge_id = p_challenge_id and cp.user_id = auth.uid()
  );
$$;

alter table public.challenges enable row level security;

create policy "Participants can view their challenges"
  on public.challenges for select
  using (public.is_challenge_participant(id) or created_by = auth.uid());

create policy "Users can create challenges"
  on public.challenges for insert
  with check (created_by = auth.uid());

create policy "Creator can update their challenge"
  on public.challenges for update
  using (created_by = auth.uid())
  with check (created_by = auth.uid());

alter table public.challenge_participants enable row level security;

create policy "Participants can view their challenge's roster"
  on public.challenge_participants for select
  using (user_id = auth.uid() or public.is_challenge_participant(challenge_id));

create policy "Creator can add participants"
  on public.challenge_participants for insert
  with check (
    exists (
      select 1 from public.challenges c
      where c.id = challenge_id and c.created_by = auth.uid()
    )
  );

create policy "Users can update their own participation"
  on public.challenge_participants for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

alter table public.challenge_rules enable row level security;

create policy "Participants can view challenge rules"
  on public.challenge_rules for select
  using (public.is_challenge_participant(challenge_id));

-- Exactly the instruction: "only created_by inserts rules while
-- status='draft'". Once a challenge is active, a replacement rule is only
-- ever written via the (later) change-request approval flow.
create policy "Creator can add rules while the challenge is a draft"
  on public.challenge_rules for insert
  with check (
    created_by = auth.uid()
    and exists (
      select 1 from public.challenges c
      where c.id = challenge_id and c.created_by = auth.uid() and c.status = 'draft'
    )
  );

create policy "Creator can close out rules"
  on public.challenge_rules for update
  using (
    exists (
      select 1 from public.challenges c
      where c.id = challenge_id and c.created_by = auth.uid()
    )
  );

-- No delete policy: rules are versioned via effective_to, never deleted.

alter table public.challenge_rule_targets enable row level security;

create policy "Participants can view rule targets for their challenge"
  on public.challenge_rule_targets for select
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.challenge_rules r
      where r.id = rule_id and public.is_challenge_participant(r.challenge_id)
    )
  );

create policy "Creator or the target's own user can set a target"
  on public.challenge_rule_targets for insert
  with check (
    user_id = auth.uid()
    or exists (
      select 1 from public.challenge_rules r
      join public.challenges c on c.id = r.challenge_id
      where r.id = rule_id and c.created_by = auth.uid()
    )
  );

create policy "Users can update their own target"
  on public.challenge_rule_targets for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

alter table public.challenge_invites enable row level security;

create policy "Creator can view their invites"
  on public.challenge_invites for select
  using (created_by = auth.uid());

create policy "Creator can create invites"
  on public.challenge_invites for insert
  with check (
    created_by = auth.uid()
    and exists (
      select 1 from public.challenges c
      where c.id = challenge_id and c.created_by = auth.uid()
    )
  );

-- No public-by-token read/update policy yet: the /join/[token] screen (V2
-- Step 7) needs a signed-out visitor to look up an invite and later set
-- accepted_by, which belongs in a security-definer RPC (like
-- exec_sql/is_challenge_participant above), not a broad RLS policy. Deferred
-- to that step on purpose.
