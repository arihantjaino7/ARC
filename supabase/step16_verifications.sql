-- Step 16 (V2 Step 11, the anti-cheat layers not already shipped): buddy
-- verification + a dispute window (docs/PLAN-V2.md §4, layer 5).
-- Run once via `node scripts/run-sql.mjs supabase/step16_verifications.sql`.
--
-- Blind mode (layer 7) already shipped in step14_scoreboard.sql. Suspicious-
-- consistency detection (layer 4's pattern check) is pure TypeScript
-- (src/lib/challenges/rollup.ts's findSuspiciousStreaks) and needs no schema
-- at all. This file is everything left that needs a database: the
-- verifications table, and the two scoreboard-adjacent RPCs that read across
-- both participants (challenge_scoreboard, extended; challenge_recent_entries,
-- new).

-- ---------------------------------------------------------------------------
-- 1. verifications
-- ---------------------------------------------------------------------------
-- A buddy (never the entry's own owner) can confirm or flag ONE of the other
-- side's days, within 48 hours of it being logged. One entry -> at most one
-- verification per verifier (a buddy challenge only ever has one other
-- participant, so "both sides must agree" reduces to "the one verifier's
-- current call"); they can change their mind inside the same window via
-- upsert on the (entry_id, verifier_id) unique pair. A 'disputed' row makes
-- the entry worth 0 in the scoreboard until it's changed back to 'ok' — see
-- challenge_scoreboard below.

create table if not exists public.verifications (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.log_entries (id) on delete cascade,
  verifier_id uuid not null references auth.users (id) on delete cascade,
  state text not null check (state in ('ok', 'disputed')),
  note text check (note is null or char_length(note) <= 200),
  created_at timestamptz not null default now(),
  unique (entry_id, verifier_id)
);

create index if not exists verifications_entry on public.verifications (entry_id);

alter table public.verifications enable row level security;

create policy "Verifier or the entry's owner can view a verification"
  on public.verifications for select
  using (
    verifier_id = auth.uid()
    or exists (select 1 from public.log_entries le where le.id = entry_id and le.user_id = auth.uid())
  );

-- Two people share a challenge_participants row on the same challenge iff
-- they're buddies in some challenge together — that's the whole "who's
-- allowed to verify whom" rule, expressed as a self-join on the table rather
-- than a security-definer helper, since this policy lives on `verifications`
-- (a different table), not on `challenge_participants` itself, so it isn't
-- the self-referencing-RLS trap step12's own comment warns about.
create policy "A buddy can verify the other side's entry within 48h"
  on public.verifications for insert
  with check (
    verifier_id = auth.uid()
    and exists (
      select 1 from public.log_entries le
      where le.id = entry_id
        and le.user_id <> auth.uid()
        and le.logged_at > now() - interval '48 hours'
        and exists (
          select 1
          from public.challenge_participants mine
          join public.challenge_participants theirs on theirs.challenge_id = mine.challenge_id
          where mine.user_id = auth.uid() and theirs.user_id = le.user_id
        )
    )
  );

create policy "Verifier can change their call within the window"
  on public.verifications for update
  using (
    verifier_id = auth.uid()
    and exists (
      select 1 from public.log_entries le
      where le.id = entry_id and le.logged_at > now() - interval '48 hours'
    )
  )
  with check (verifier_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 2. trust_score — consecutive clean verifications, for the profile
-- ---------------------------------------------------------------------------
-- Global, not per-challenge (docs/PLAN-V2.md §4: "a visible Trust Score on
-- the profile"). Counts back from the most recently verified day: every
-- verified-'ok' day in a row, stopping at the first 'disputed' one (or at the
-- end of history, if none ever were). Unverified days don't break or extend
-- the streak — they're simply not part of it.

create or replace function public.trust_score(p_user_id uuid)
returns int
language sql
security definer
set search_path = public
stable
as $$
  with verified as (
    select distinct on (le.id) le.id, le.log_date, v.state
    from public.log_entries le
    join public.verifications v on v.entry_id = le.id
    where le.user_id = p_user_id
    order by le.id, v.created_at desc
  ),
  ordered as (
    select state, row_number() over (order by log_date desc, id desc) as rn
    from verified
  )
  select coalesce(
    (select min(rn) - 1 from ordered where state = 'disputed'),
    (select count(*) from ordered)
  );
$$;

grant execute on function public.trust_score(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. challenge_scoreboard — extended with dispute exclusion + badge
-- ---------------------------------------------------------------------------
-- Same function as step14_scoreboard.sql, `create or replace`d: a 'disputed'
-- entry is excluded from logsByMetric exactly like a blind-mode-hidden one
-- (absent, not zeroed) — the rollup already scores an absent day as 0 (see
-- rollup.ts's "unlogged scores 0" rule), which is exactly "worth 0 until both
-- agree." A 'disputed' badge count is added alongside late/edited/flagged.

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
            -- Worth 0 until both agree: a disputed entry is dropped from the
            -- scored values entirely, same as an unlogged day (rollup.ts
            -- scores an absent day 0, never a real value that was later
            -- withdrawn).
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

-- ---------------------------------------------------------------------------
-- 4. challenge_recent_entries — the verification feed
-- ---------------------------------------------------------------------------
-- What the buddy screen's confirm/flag control needs: the OTHER participant's
-- entries logged in the last 48 hours, each with the caller's own
-- verification state (if any) so the UI can show "confirmed" / "flagged"
-- instead of re-offering the buttons. Deliberately narrower than a raw
-- log_entries read: only recent rows, only for this one challenge's metrics,
-- and blind-mode's "hide today until you've logged" rule still applies (an
-- entry you can't see on the scoreboard yet shouldn't be verifiable either).

create or replace function public.challenge_recent_entries(p_challenge_id uuid)
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
  v_caller_logged_today boolean;
  v_metric_keys text[];
  v_entries jsonb;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  select * into v_challenge from public.challenges where id = p_challenge_id;
  if not found or not exists (
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
    where le.user_id = v_uid and le.log_date = v_caller_today and le.metric_key = any(v_metric_keys)
  );

  select coalesce(jsonb_agg(jsonb_build_object(
      'entryId', le.id,
      'userId', le.user_id,
      'label', coalesce(pr.display_name, split_part(u.email, '@', 1)),
      'logDate', le.log_date,
      'metricKey', le.metric_key,
      'value', case when le.value_bool is not null then to_jsonb(le.value_bool) else to_jsonb(le.value_num) end,
      'loggedAt', le.logged_at,
      'isLate', le.is_late,
      'implausible', le.implausible,
      'myVerification', (
        select v.state from public.verifications v
        where v.entry_id = le.id and v.verifier_id = v_uid
      )
    ) order by le.logged_at desc), '[]'::jsonb)
    into v_entries
    from public.log_entries le
    join public.challenge_participants cp
      on cp.challenge_id = p_challenge_id and cp.user_id = le.user_id and cp.status = 'accepted'
    join auth.users u on u.id = le.user_id
    left join public.profiles pr on pr.id = le.user_id
    where le.metric_key = any(v_metric_keys)
      and le.user_id <> v_uid
      and le.logged_at > now() - interval '48 hours'
      and not (v_blind and not v_caller_logged_today and le.log_date = v_caller_today);

  return jsonb_build_object('entries', v_entries);
end;
$$;

grant execute on function public.challenge_recent_entries(uuid) to authenticated;
