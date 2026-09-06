-- Step 17 (V2 Step 13, three of the five polish items): grace tokens and the
-- stake ledger (docs/PLAN-V2.md §5). "Who won today" and "Rematch" needed no
-- new schema — they're built entirely from data that already exists.
-- Run once via `node scripts/run-sql.mjs supabase/step17_polish.sql`.

-- ---------------------------------------------------------------------------
-- 1. challenge_grace_days — one excused day per 30-day period per challenge
-- ---------------------------------------------------------------------------
-- "One per 30 days per challenge" (docs/PLAN-V2.md §5) is implemented as
-- fixed 30-day blocks counted from the challenge's own start_date, not a
-- rolling window — simpler to enforce with a plain unique index, and just as
-- fair since every participant shares the same start_date. "Must be declared
-- before the day ends" is enforced by requiring log_date to be the caller's
-- own current day (their stored timezone against the server clock, the same
-- rule log_entry_guard() uses) — there is no path to grace a day after the
-- fact.

create table if not exists public.challenge_grace_days (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references public.challenges (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  log_date date not null,
  -- Computed by the trigger below from challenges.start_date — never trusted
  -- from the client, since it's what the one-per-30-days limit is keyed on.
  period int not null default 0,
  created_at timestamptz not null default now(),
  unique (challenge_id, user_id, log_date),
  unique (challenge_id, user_id, period)
);

create index if not exists challenge_grace_days_challenge on public.challenge_grace_days (challenge_id);

create or replace function public.grace_day_guard()
returns trigger
language plpgsql
as $$
declare
  v_start date;
begin
  select start_date into v_start from public.challenges where id = new.challenge_id;
  new.period := floor((new.log_date - v_start) / 30.0);
  return new;
end;
$$;

drop trigger if exists grace_day_guard_trigger on public.challenge_grace_days;
create trigger grace_day_guard_trigger
  before insert on public.challenge_grace_days
  for each row execute function public.grace_day_guard();

alter table public.challenge_grace_days enable row level security;

create policy "Participants can view grace days"
  on public.challenge_grace_days for select
  using (public.is_challenge_participant(challenge_id));

create policy "A participant can declare their own grace day for today"
  on public.challenge_grace_days for insert
  with check (
    user_id = auth.uid()
    and public.is_challenge_participant(challenge_id)
    and log_date = (
      now() at time zone (
        select coalesce(p.timezone, 'UTC') from public.profiles p where p.id = auth.uid()
      )
    )::date
  );

-- No update/delete policy: a grace day, once declared, stands — same
-- "no retroactive fixing" spirit as challenge_rules never being edited in
-- place.

-- ---------------------------------------------------------------------------
-- 2. challenge_stakes — who owes whom
-- ---------------------------------------------------------------------------
-- The winner/loser is computed in TypeScript (src/lib/challenges/actions.ts's
-- getStakeLedger, from the same getScoreboard totals the buddy screen already
-- shows) and written here once, the first time either side opens the ledger
-- after the challenge ends — scoring logic stays out of SQL entirely, same
-- boundary challenge_scoreboard's own header comment describes. Settling is
-- the one thing that needs a database rule (each side can only ever flip
-- their own column), so that goes through mark_stake_settled below instead of
-- a plain UPDATE policy.

create table if not exists public.challenge_stakes (
  challenge_id uuid primary key references public.challenges (id) on delete cascade,
  winner_id uuid references auth.users (id) on delete cascade,
  loser_id uuid references auth.users (id) on delete cascade,
  is_tie boolean not null default false,
  winner_settled boolean not null default false,
  loser_settled boolean not null default false,
  created_at timestamptz not null default now(),
  check (is_tie or (winner_id is not null and loser_id is not null and winner_id <> loser_id))
);

alter table public.challenge_stakes enable row level security;

create policy "Participants can view their stake"
  on public.challenge_stakes for select
  using (public.is_challenge_participant(challenge_id));

create policy "A participant can record the outcome once their challenge has ended"
  on public.challenge_stakes for insert
  with check (
    public.is_challenge_participant(challenge_id)
    and (is_tie or auth.uid() in (winner_id, loser_id))
    and exists (
      select 1 from public.challenges c
      where c.id = challenge_id and c.end_date < current_date and c.stake_text is not null
    )
  );

-- No update policy for plain users: settling only ever goes through
-- mark_stake_settled, which touches only the caller's own column.

create or replace function public.mark_stake_settled(p_challenge_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.challenge_stakes%rowtype;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  select * into v_row from public.challenge_stakes where challenge_id = p_challenge_id;
  if not found then
    raise exception 'No stake recorded for this challenge yet.' using errcode = 'P0002';
  end if;

  if v_row.is_tie then
    raise exception 'A tie has nothing to settle.' using errcode = 'P0001';
  elsif v_row.winner_id = v_uid then
    update public.challenge_stakes set winner_settled = true where challenge_id = p_challenge_id;
  elsif v_row.loser_id = v_uid then
    update public.challenge_stakes set loser_settled = true where challenge_id = p_challenge_id;
  else
    raise exception 'Not part of this stake.' using errcode = '42501';
  end if;

  select * into v_row from public.challenge_stakes where challenge_id = p_challenge_id;
  return jsonb_build_object('winnerSettled', v_row.winner_settled, 'loserSettled', v_row.loser_settled);
end;
$$;

grant execute on function public.mark_stake_settled(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. challenge_scoreboard — extended with each participant's graced dates
-- ---------------------------------------------------------------------------
-- `create or replace`d again (same function as step14/step16): grace days are
-- excluded from scoring the same way a rest day is — see rollup.ts's new
-- `graced` parameter — so the scoreboard needs to hand TypeScript the list of
-- dates to exclude, per participant.

create or replace function public.challenge_scoreboard(p_challenge_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_uid uuid := auth.uid();
  v_challenge public.challenges%rowtype;
  v_blind boolean;
  v_caller_tz text;
  v_caller_today date;
  v_metric_keys text[];
  v_caller_logged_today boolean;
  v_rules jsonb;
  v_participants jsonb;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  select * into v_challenge from public.challenges where id = p_challenge_id;
  if not found then
    return jsonb_build_object('error', 'not_found');
  end if;

  if not exists (
    select 1 from public.challenge_participants cp
    where cp.challenge_id = p_challenge_id and cp.user_id = v_uid
  ) then
    return jsonb_build_object('error', 'not_participant');
  end if;

  v_blind := coalesce((v_challenge.settings ->> 'blind_mode')::boolean, false);

  select coalesce(p.timezone, 'UTC') into v_caller_tz
  from public.profiles p where p.id = v_uid;
  v_caller_tz := coalesce(v_caller_tz, 'UTC');
  v_caller_today := (now() at time zone v_caller_tz)::date;

  select coalesce(array_agg(distinct r.metric_key), array[]::text[])
    into v_metric_keys
    from public.challenge_rules r
    where r.challenge_id = p_challenge_id;

  v_caller_logged_today := exists (
    select 1 from public.log_entries le
    where le.user_id = v_uid
      and le.log_date = v_caller_today
      and le.metric_key = any(v_metric_keys)
  );

  select coalesce(jsonb_agg(jsonb_build_object(
      'id', r.id,
      'metricKey', r.metric_key,
      'shape', r.shape,
      'scope', r.scope,
      'target', r.target,
      'min', r.min,
      'max', r.max,
      'weight', r.weight,
      'period', r.period,
      'schedule', r.schedule,
      'effectiveFrom', r.effective_from,
      'effectiveTo', r.effective_to,
      'targets', (
        select coalesce(jsonb_object_agg(t.user_id::text, jsonb_build_object(
            'target', t.target, 'min', t.min, 'max', t.max
          )), '{}'::jsonb)
        from public.challenge_rule_targets t
        where t.rule_id = r.id
      )
    ) order by r.created_at), '[]'::jsonb)
    into v_rules
    from public.challenge_rules r
    where r.challenge_id = p_challenge_id;

  select coalesce(jsonb_agg(jsonb_build_object(
      'userId', cp.user_id,
      'label', coalesce(pr.display_name, split_part(u.email, '@', 1)),
      'isCaller', cp.user_id = v_uid,
      'todayLogged', exists (
        select 1 from public.log_entries le
        where le.user_id = cp.user_id
          and le.log_date = v_caller_today
          and le.metric_key = any(v_metric_keys)
      ),
      'trustScore', public.trust_score(cp.user_id),
      'gracedDates', (
        select coalesce(jsonb_agg(g.log_date order by g.log_date), '[]'::jsonb)
        from public.challenge_grace_days g
        where g.challenge_id = p_challenge_id and g.user_id = cp.user_id
      ),
      'logsByMetric', (
        select coalesce(jsonb_object_agg(m.metric_key, m.dates), '{}'::jsonb)
        from (
          select le.metric_key,
            jsonb_object_agg(
              le.log_date::text,
              case when le.value_bool is not null then to_jsonb(le.value_bool) else to_jsonb(le.value_num) end
            ) as dates
          from public.log_entries le
          where le.user_id = cp.user_id
            and le.metric_key = any(v_metric_keys)
            and not (
              v_blind
              and cp.user_id <> v_uid
              and not v_caller_logged_today
              and le.log_date = v_caller_today
            )
            and not exists (
              select 1 from public.verifications v
              where v.entry_id = le.id and v.state = 'disputed'
            )
          group by le.metric_key
        ) m
      ),
      'badges', jsonb_build_object(
        'late', (
          select count(*) from public.log_entries le
          where le.user_id = cp.user_id and le.metric_key = any(v_metric_keys) and le.is_late
        ),
        'edited', (
          select count(*) from public.log_entries le
          where le.user_id = cp.user_id and le.metric_key = any(v_metric_keys) and le.edit_count > 0
        ),
        'flagged', (
          select count(*) from public.log_entries le
          where le.user_id = cp.user_id and le.metric_key = any(v_metric_keys) and le.implausible
        ),
        'disputed', (
          select count(*) from public.log_entries le
          join public.verifications v on v.entry_id = le.id and v.state = 'disputed'
          where le.user_id = cp.user_id and le.metric_key = any(v_metric_keys)
        )
      )
    ) order by cp.role), '[]'::jsonb)
    into v_participants
    from public.challenge_participants cp
    join auth.users u on u.id = cp.user_id
    left join public.profiles pr on pr.id = cp.user_id
    where cp.challenge_id = p_challenge_id and cp.status = 'accepted';

  return jsonb_build_object(
    'challengeId', v_challenge.id,
    'name', v_challenge.name,
    'startDate', v_challenge.start_date,
    'endDate', v_challenge.end_date,
    'blindMode', v_blind,
    'callerToday', v_caller_today,
    'rules', v_rules,
    'participants', v_participants
  );
end;
$$;

grant execute on function public.challenge_scoreboard(uuid) to authenticated;
