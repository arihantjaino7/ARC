-- Step 14 (V2 Step 8): the challenge scoreboard RPC (docs/PLAN-V2.md §3.5,
-- rippling-leaping-pie.md Step 8).
-- Run once via `node scripts/run-sql.mjs supabase/step14_scoreboard.sql`.
--
-- The buddy comparison view needs BOTH participants' logged values, but
-- log_entries RLS (step11) is "own rows only" and stays that way — a broad
-- read policy would let either side quietly read the other's entire history
-- any time, which is exactly what blind mode (docs/PLAN-V2.md §4, layer 7)
-- exists to prevent. Instead this is one security-definer function, same
-- pattern as is_challenge_participant/challenge_invite_preview: it runs with
-- RLS bypassed, does the one specific cross-user read the feature needs, and
-- nothing else.
--
-- Design boundary: this function returns each rule's resolved window/targets
-- and each participant's logged VALUES (numbers/booleans by date) — not full
-- log_entries rows (no id, source, logged_at, per-entry is_late/edit_count/
-- implausible). Per-entry metadata about the *other* participant never leaves
-- the database; only aggregate badge counts do. The actual score computation
-- (weekly grouping anchored to the challenge start, fixed-day rest-day
-- exclusion, weighted averaging) deliberately stays in TypeScript —
-- src/lib/challenges/rollup.ts is already written and unit-tested for
-- exactly this, and duplicating that logic in PL/pgSQL would just be a
-- second, untested implementation to keep in sync. src/lib/challenges/
-- actions.ts's getScoreboard() is the only caller of this RPC and is what
-- actually hands the UI "only scores and badge counts" — this function is
-- the private data-fetching half of that boundary, not the public one.
--
-- Blind mode (settings->>'blind_mode'): the caller's own values are always
-- returned in full. The OTHER participant's value for the caller's current
-- day (their stored timezone applied to the server clock, same rule as
-- log_entry_guard()) is withheld entirely — not even zeroed, just absent
-- from the JSON — until the caller has logged at least one of this
-- challenge's metrics for that same day.

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

  -- Every rule version this challenge has ever had (not just the currently
  -- live one) — a closed-out edited rule (V2 Step 10) still needs to be
  -- scored for the days it was actually live, and rollupRule already clips
  -- each version to its own effective_from/effective_to window.
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
