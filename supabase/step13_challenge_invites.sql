-- Step 13 (V2 Step 7): invite-link RPCs (docs/PLAN-V2.md §3.3).
-- Run once via `node scripts/run-sql.mjs supabase/step13_challenge_invites.sql`.
--
-- The /join/[token] screen needs a signed-in-but-not-yet-a-participant visitor
-- to read a challenge's name/dates/rules and then accept it. RLS on
-- challenges/challenge_rules only allows participants to read them
-- (is_challenge_participant), which by definition this visitor isn't yet.
-- step12_challenges.sql's own comment deferred exactly this to a
-- security-definer RPC rather than a broad policy — same pattern as
-- is_challenge_participant/exec_sql. These three functions are that RPC.

-- ---------------------------------------------------------------------------
-- 1. challenge_invite_preview — read-only, what the join screen renders.
-- ---------------------------------------------------------------------------

create or replace function public.challenge_invite_preview(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_invite public.challenge_invites%rowtype;
  v_challenge public.challenges%rowtype;
  v_inviter_label text;
  v_rules jsonb;
  v_accepted_count int;
begin
  select * into v_invite from public.challenge_invites where token = p_token;
  if not found then
    return jsonb_build_object('error', 'not_found');
  end if;

  select * into v_challenge from public.challenges where id = v_invite.challenge_id;

  select count(*) into v_accepted_count
    from public.challenge_participants
    where challenge_id = v_challenge.id and status = 'accepted';

  select coalesce(p.display_name, split_part(u.email, '@', 1))
    into v_inviter_label
    from auth.users u
    left join public.profiles p on p.id = u.id
    where u.id = v_challenge.created_by;

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
      'requiresProof', r.requires_proof
    ) order by r.created_at), '[]'::jsonb)
    into v_rules
    from public.challenge_rules r
    where r.challenge_id = v_challenge.id and r.effective_to is null;

  return jsonb_build_object(
    'challengeId', v_challenge.id,
    'name', v_challenge.name,
    'status', v_challenge.status,
    'startDate', v_challenge.start_date,
    'endDate', v_challenge.end_date,
    'stakeText', v_challenge.stake_text,
    'settings', v_challenge.settings,
    'inviterLabel', v_inviter_label,
    'rules', v_rules,
    'expired', v_invite.expires_at < now(),
    'full', v_accepted_count >= 2,
    'isOwnInvite', v_challenge.created_by = auth.uid(),
    'alreadyJoined', exists (
      select 1 from public.challenge_participants cp
      where cp.challenge_id = v_challenge.id and cp.user_id = auth.uid()
    )
  );
end;
$$;

grant execute on function public.challenge_invite_preview(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. accept_challenge_invite
-- ---------------------------------------------------------------------------
-- p_own_targets: [{"ruleId": "...", "target": 1800}, ...] — one entry per
-- scope='own' live rule, the accepting user's own number for it (mirrors what
-- challenge_rule_targets already stores for the creator, written directly by
-- createChallenge in src/lib/challenges/actions.ts).

create or replace function public.accept_challenge_invite(
  p_token text,
  p_own_targets jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite public.challenge_invites%rowtype;
  v_challenge public.challenges%rowtype;
  v_uid uuid := auth.uid();
  v_other_count int;
  t jsonb;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  select * into v_invite from public.challenge_invites where token = p_token;
  if not found then
    raise exception 'This invite link is not valid.' using errcode = 'P0002';
  end if;
  if v_invite.expires_at < now() then
    raise exception 'This invite link has expired.' using errcode = 'P0001';
  end if;

  select * into v_challenge from public.challenges where id = v_invite.challenge_id;
  if v_challenge.created_by = v_uid then
    raise exception 'You created this challenge.' using errcode = 'P0001';
  end if;
  if v_challenge.status not in ('pending', 'active') then
    raise exception 'This challenge is no longer open to join.' using errcode = 'P0001';
  end if;

  select count(*) into v_other_count
    from public.challenge_participants
    where challenge_id = v_challenge.id and status = 'accepted' and user_id <> v_uid;
  if v_other_count >= 2 then
    raise exception 'This challenge already has its two participants.' using errcode = 'P0001';
  end if;

  insert into public.challenge_participants (challenge_id, user_id, role, status, joined_at)
  values (v_challenge.id, v_uid, 'member', 'accepted', now())
  on conflict (challenge_id, user_id)
  do update set status = 'accepted', joined_at = now();

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

  update public.challenge_invites set accepted_by = v_uid where id = v_invite.id and accepted_by is null;
  update public.challenges set status = 'active' where id = v_challenge.id and status = 'pending';

  return v_challenge.id;
end;
$$;

grant execute on function public.accept_challenge_invite(text, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. decline_challenge_invite
-- ---------------------------------------------------------------------------
-- The invitee never became a participant, so there's no row of theirs to
-- update — declining just cancels the (still-pending) challenge outright.

create or replace function public.decline_challenge_invite(p_token text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite public.challenge_invites%rowtype;
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  select * into v_invite from public.challenge_invites where token = p_token;
  if not found then
    return false;
  end if;

  update public.challenges
    set status = 'cancelled'
    where id = v_invite.challenge_id and created_by <> v_uid and status = 'pending';

  return true;
end;
$$;

grant execute on function public.decline_challenge_invite(text) to authenticated;
