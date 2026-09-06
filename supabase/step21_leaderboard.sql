-- Step 21 (Community Step C5 + C6): the leaderboard RPC, a community size
-- cap, and admin-direct rule edits (docs/PLAN-COMMUNITY.md Steps C5/C6,
-- docs/PLAN-V2.md §6).
-- Run once via `node scripts/run-sql.mjs supabase/step21_leaderboard.sql`.
--
-- ---------------------------------------------------------------------------
-- SCALE decision (Step C5's own question)
-- ---------------------------------------------------------------------------
-- challenge_scoreboard (step14/16/17) returns every participant's full
-- per-metric history for the whole challenge range — nothing for two people,
-- wasteful for fifty. Options were: cap community size, narrow the returned
-- window to what the leaderboard actually renders, or precompute per-member
-- daily scores on write. Chosen: CAP COMMUNITY SIZE at 20 accepted members
-- (simplest, and honest for a personal app that was never going to run
-- fifty-person communities) rather than adding a second, more complex
-- mechanism. join_community and respond_to_join_request are both
-- `create or replace`d below with that cap added at the one moment each of
-- them turns a request into an accepted member. Revisit if this app ever
-- needs bigger groups.
--
-- ---------------------------------------------------------------------------
-- BLIND MODE decision
-- ---------------------------------------------------------------------------
-- Defaults OFF for kind='community' — already baked into
-- communities/actions.ts's createCommunity (the leaderboard IS the point,
-- per docs/PLAN-COMMUNITY.md Step C5's own recommendation). community_
-- leaderboard below still honors the per-challenge toggle exactly like
-- challenge_scoreboard does (withhold a non-caller member's value for the
-- caller's current day until the caller has logged today), in case an admin
-- ever turns it on anyway — a default and a copy decision, not a code one.

-- ---------------------------------------------------------------------------
-- 1. Community size cap (20 accepted members) — join_community, re-replaced
-- ---------------------------------------------------------------------------

create or replace function public.join_community(
  p_community_id uuid,
  p_own_targets jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_community public.communities%rowtype;
  v_status text;
  t jsonb;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  select * into v_community from public.communities where id = p_community_id;
  if not found then
    raise exception 'Community not found.' using errcode = 'P0002';
  end if;

  if v_community.admin_id = v_uid then
    raise exception 'You already run this community.' using errcode = 'P0001';
  end if;
  if v_community.template_challenge_id is null then
    raise exception 'This community has no challenge yet.' using errcode = 'P0001';
  end if;

  select cm.status into v_status
    from public.community_members cm
    where cm.community_id = p_community_id and cm.user_id = v_uid;

  if v_status = 'member' then
    raise exception 'You are already a member.' using errcode = 'P0001';
  end if;
  if v_status = 'requested' then
    raise exception 'Your request is already pending.' using errcode = 'P0001';
  end if;

  for t in select * from jsonb_array_elements(coalesce(p_own_targets, '[]'::jsonb))
  loop
    insert into public.challenge_rule_targets (rule_id, user_id, target, min, max)
    values (
      (t ->> 'ruleId')::uuid,
      v_uid,
      nullif(t ->> 'target', '')::numeric,
      nullif(t ->> 'min', '')::numeric,
      nullif(t ->> 'max', '')::numeric
    )
    on conflict (rule_id, user_id)
    do update set target = excluded.target, min = excluded.min, max = excluded.max;
  end loop;

  if v_community.visibility = 'public' then
    -- Size cap (see this file's header): checked here, the one moment a
    -- public join actually turns into an accepted member.
    if (
      select count(*) from public.community_members cm2
      where cm2.community_id = p_community_id and cm2.status = 'member'
    ) >= 20 then
      raise exception 'This community is full.' using errcode = 'P0001';
    end if;

    insert into public.community_members (community_id, user_id, role, status, joined_at)
    values (p_community_id, v_uid, 'member', 'member', now())
    on conflict (community_id, user_id)
    do update set status = 'member', role = 'member', joined_at = now();

    insert into public.challenge_participants (challenge_id, user_id, role, status, joined_at)
    values (v_community.template_challenge_id, v_uid, 'member', 'accepted', now())
    on conflict (challenge_id, user_id)
    do update set status = 'accepted', joined_at = now();

    return jsonb_build_object('status', 'joined');
  else
    insert into public.community_members (community_id, user_id, role, status, joined_at)
    values (p_community_id, v_uid, 'member', 'requested', null)
    on conflict (community_id, user_id)
    do update set status = 'requested', joined_at = null;

    insert into public.notifications (user_id, kind, payload)
    values (
      v_community.admin_id,
      'community_join_requested',
      jsonb_build_object('communityId', p_community_id, 'communityName', v_community.name, 'requesterId', v_uid)
    );

    return jsonb_build_object('status', 'requested');
  end if;
end;
$$;

grant execute on function public.join_community(uuid, jsonb) to authenticated;

create or replace function public.respond_to_join_request(
  p_community_id uuid,
  p_user_id uuid,
  p_approve boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_community public.communities%rowtype;
  v_status text;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  select * into v_community from public.communities where id = p_community_id;
  if not found then
    raise exception 'Community not found.' using errcode = 'P0002';
  end if;
  if v_community.admin_id <> v_uid then
    raise exception 'Only the admin can respond to requests.' using errcode = '42501';
  end if;

  select cm.status into v_status
    from public.community_members cm
    where cm.community_id = p_community_id and cm.user_id = p_user_id;
  if v_status is distinct from 'requested' then
    raise exception 'No pending request from that user.' using errcode = 'P0001';
  end if;

  if p_approve then
    -- Size cap (see this file's header): checked here too, since an
    -- approval is the other moment a request turns into an accepted member.
    if (
      select count(*) from public.community_members cm2
      where cm2.community_id = p_community_id and cm2.status = 'member'
    ) >= 20 then
      raise exception 'This community is full.' using errcode = 'P0001';
    end if;

    update public.community_members
      set status = 'member', joined_at = now()
      where community_id = p_community_id and user_id = p_user_id;

    insert into public.challenge_participants (challenge_id, user_id, role, status, joined_at)
    values (v_community.template_challenge_id, p_user_id, 'member', 'accepted', now())
    on conflict (challenge_id, user_id)
    do update set status = 'accepted', joined_at = now();

    insert into public.notifications (user_id, kind, payload)
    values (p_user_id, 'community_join_approved', jsonb_build_object('communityId', p_community_id, 'communityName', v_community.name));

    return jsonb_build_object('status', 'approved');
  else
    update public.community_members
      set status = 'removed'
      where community_id = p_community_id and user_id = p_user_id;

    insert into public.notifications (user_id, kind, payload)
    values (p_user_id, 'community_join_declined', jsonb_build_object('communityId', p_community_id, 'communityName', v_community.name));

    return jsonb_build_object('status', 'declined');
  end if;
end;
$$;

grant execute on function public.respond_to_join_request(uuid, uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. community_leaderboard — the read side of Step C5.
-- ---------------------------------------------------------------------------
-- Same cross-user-read problem step14_scoreboard.sql solved for buddies:
-- log_entries RLS stays "own rows only", so reading every member's logged
-- values needs one security-definer function, not a broadened policy.
-- Modeled directly on challenge_scoreboard, including its design boundary:
-- this returns resolved rules/targets and logged VALUES, never raw
-- log_entries rows (no id, source, logged_at, per-entry is_late/edit_count/
-- implausible) — only aggregate badge counts leave the database. Scoring
-- itself stays in TypeScript: getCommunityLeaderboard() in
-- src/lib/communities/actions.ts reshapes this JSON into ResolvedRule[]/
-- RuleLog per member (via the same resolveRule() challenges/types.ts already
-- exports) and calls the existing, unchanged rollupChallenge/groupAggregate —
-- nothing about scoring is duplicated in PL/pgSQL.
--
-- Restricted to a member or the admin (public.is_community_member /
-- communities.admin_id), same as community_detail's roster section — a
-- stranger who only found the community via search never sees scores.

create or replace function public.community_leaderboard(p_community_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_uid uuid := auth.uid();
  v_community public.communities%rowtype;
  v_challenge public.challenges%rowtype;
  v_blind boolean;
  v_caller_tz text;
  v_caller_today date;
  v_metric_keys text[];
  v_caller_logged_today boolean;
  v_rules jsonb;
  v_members jsonb;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  select * into v_community from public.communities where id = p_community_id;
  if not found then
    return jsonb_build_object('error', 'not_found');
  end if;

  if not (v_community.admin_id = v_uid or public.is_community_member(p_community_id)) then
    return jsonb_build_object('error', 'not_member');
  end if;

  if v_community.template_challenge_id is null then
    return jsonb_build_object('error', 'no_challenge');
  end if;

  select * into v_challenge from public.challenges where id = v_community.template_challenge_id;

  v_blind := coalesce((v_challenge.settings ->> 'blind_mode')::boolean, false);

  select coalesce(p.timezone, 'UTC') into v_caller_tz
  from public.profiles p where p.id = v_uid;
  v_caller_tz := coalesce(v_caller_tz, 'UTC');
  v_caller_today := (now() at time zone v_caller_tz)::date;

  select coalesce(array_agg(distinct r.metric_key), array[]::text[])
    into v_metric_keys
    from public.challenge_rules r
    where r.challenge_id = v_challenge.id;

  v_caller_logged_today := exists (
    select 1 from public.log_entries le
    where le.user_id = v_uid
      and le.log_date = v_caller_today
      and le.metric_key = any(v_metric_keys)
  );

  -- Every rule version this challenge has ever had, same reason
  -- challenge_scoreboard keeps them all — an admin-edited rule (Step C6)
  -- still needs to be scored for the days it was actually live.
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
    where r.challenge_id = v_challenge.id;

  select coalesce(jsonb_agg(jsonb_build_object(
      'userId', cm.user_id,
      'label', coalesce(pr.display_name, split_part(u.email, '@', 1)),
      'role', cm.role,
      'isCaller', cm.user_id = v_uid,
      'todayLogged', exists (
        select 1 from public.log_entries le
        where le.user_id = cm.user_id
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
          where le.user_id = cm.user_id
            and le.metric_key = any(v_metric_keys)
            and not (
              v_blind
              and cm.user_id <> v_uid
              and not v_caller_logged_today
              and le.log_date = v_caller_today
            )
          group by le.metric_key
        ) m
      ),
      'badges', jsonb_build_object(
        'late', (
          select count(*) from public.log_entries le
          where le.user_id = cm.user_id and le.metric_key = any(v_metric_keys) and le.is_late
        ),
        'edited', (
          select count(*) from public.log_entries le
          where le.user_id = cm.user_id and le.metric_key = any(v_metric_keys) and le.edit_count > 0
        ),
        'flagged', (
          select count(*) from public.log_entries le
          where le.user_id = cm.user_id and le.metric_key = any(v_metric_keys) and le.implausible
        )
      ),
      'trustScore', public.trust_score(cm.user_id)
    ) order by cm.role, cm.joined_at), '[]'::jsonb)
    into v_members
    from public.community_members cm
    join public.challenge_participants cp
      on cp.challenge_id = v_challenge.id and cp.user_id = cm.user_id and cp.status = 'accepted'
    join auth.users u on u.id = cm.user_id
    left join public.profiles pr on pr.id = cm.user_id
    where cm.community_id = p_community_id and cm.status = 'member';

  return jsonb_build_object(
    'communityId', v_community.id,
    'challengeId', v_challenge.id,
    'name', v_community.name,
    'startDate', v_challenge.start_date,
    'endDate', v_challenge.end_date,
    'blindMode', v_blind,
    'callerToday', v_caller_today,
    'rules', v_rules,
    'members', v_members
  );
end;
$$;

grant execute on function public.community_leaderboard(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. admin_edit_community_rule — Step C6's "admin edits directly, no
--    approval flow" decision.
-- ---------------------------------------------------------------------------
-- docs/PLAN-COMMUNITY.md Step C6 asks whether change requests (V2 Step 10)
-- apply to communities: "members join a template read-only, so the honest
-- answer is probably the admin edits it directly, no approval flow." That's
-- what this function is. But the immutable-rule guard (step12's
-- challenge_rule_immutable_guard trigger) still applies unconditionally to
-- challenge_rules regardless of who's editing, so an "edit" here is the same
-- close-and-replace shape respond_challenge_change already uses for buddies:
-- the old rule's effective_to is set to today (it stays live through today,
-- exactly as scored), and any replacement starts tomorrow, never today —
-- anti-cheat rule #1 holding for admin edits too, not just buddy proposals.
--
-- Deliberate limitation, written down rather than silently half-built:
-- add/edit only supports scope='shared' here. A community's scope='own'
-- rules (docs/PLAN-COMMUNITY.md: "individual member targets still use
-- scope='own' where the admin allows it") are set once, per member, at join
-- time (join_community/respond_to_join_request writing
-- challenge_rule_targets) — there's no re-entry flow yet for an admin's
-- mid-challenge edit to collect every existing member's own new number, the
-- same way a two-person buddy change request can. Enforced in TypeScript
-- (communities/actions.ts's editCommunityRule), not here, per this project's
-- own convention of keeping business validation out of PL/pgSQL — this
-- function trusts its caller to have already checked that.

create or replace function public.admin_edit_community_rule(
  p_community_id uuid,
  p_kind text, -- 'add' | 'edit' | 'remove'
  p_rule_id uuid, -- required for edit/remove; ignored for add
  p_metric_key text default null, -- required for add/edit
  p_shape text default null,
  p_target numeric default null,
  p_min numeric default null,
  p_max numeric default null,
  p_weight int default null,
  p_period text default null,
  p_schedule jsonb default null,
  p_requires_proof boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_community public.communities%rowtype;
  v_new_id uuid;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;
  if p_kind not in ('add', 'edit', 'remove') then
    raise exception 'Invalid kind.' using errcode = 'P0001';
  end if;

  select * into v_community from public.communities where id = p_community_id;
  if not found then
    raise exception 'Community not found.' using errcode = 'P0002';
  end if;
  if v_community.admin_id <> v_uid then
    raise exception 'Only the admin can edit this community''s rules.' using errcode = '42501';
  end if;
  if v_community.template_challenge_id is null then
    raise exception 'This community has no challenge yet.' using errcode = 'P0001';
  end if;

  if p_kind in ('edit', 'remove') then
    -- greatest(current_date, effective_from): a rule already live closes at
    -- today, same as respond_challenge_change. A rule added earlier today
    -- but not yet live (effective_from is tomorrow, from a same-day add)
    -- closes at its own effective_from instead — closing it at today would
    -- violate the table's own "effective_to >= effective_from" check and,
    -- worse, would be wrong anyway: a not-yet-started rule has no live days
    -- to preserve, so this just ends it before it ever begins.
    update public.challenge_rules
      set effective_to = greatest(current_date, effective_from)
      where id = p_rule_id
        and challenge_id = v_community.template_challenge_id
        and effective_to is null;
    if not found then
      raise exception 'That rule is not currently live.' using errcode = 'P0001';
    end if;
  end if;

  if p_kind in ('add', 'edit') then
    insert into public.challenge_rules (
      challenge_id, metric_key, shape, scope, target, min, max, weight, period, schedule,
      requires_proof, effective_from, created_by
    ) values (
      v_community.template_challenge_id, p_metric_key, p_shape, 'shared', p_target, p_min, p_max,
      p_weight, p_period, p_schedule, coalesce(p_requires_proof, false), current_date + 1, v_uid
    )
    returning id into v_new_id;
  end if;

  return jsonb_build_object('status', 'ok', 'newRuleId', v_new_id);
end;
$$;

grant execute on function public.admin_edit_community_rule(
  uuid, text, uuid, text, text, numeric, numeric, numeric, int, text, jsonb, boolean
) to authenticated;
