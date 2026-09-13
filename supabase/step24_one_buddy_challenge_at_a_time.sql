-- Step 24 — product decision: one live buddy challenge per pair at a time,
-- not several in parallel — simpler to follow than juggling multiple stakes
-- with the same person. Community challenges are unaffected; this only
-- restricts kind = 'buddy'.
--
-- "Live" means status in ('pending','active') AND end_date hasn't passed —
-- a challenge's status is never flipped to 'completed' once its end_date
-- passes (rematchChallenge in src/lib/challenges/actions.ts relies on being
-- able to create a fresh challenge with the same buddy the moment the old
-- one ends), so the date check is what actually lets a rematch through
-- rather than being permanently blocked by its own predecessor.
--
-- Enforced in two places:
--   1. challenge_invite_preview — lets /join/[token] show a dedicated
--      "you're already busy with them" screen instead of a wasted click.
--   2. accept_challenge_invite — the actual gate. This is the one path every
--      route to an active buddy challenge goes through (both "pick an
--      existing buddy" and "link-only" creation end here), so it's enough
--      on its own even without the createChallenge-side check added
--      alongside this migration in the same commit.
--
-- Run once via `node scripts/run-sql.mjs supabase/step24_one_buddy_challenge_at_a_time.sql`.

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
  v_buddy_already_busy boolean;
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

  -- One live buddy challenge per pair — see this file's header comment.
  v_buddy_already_busy := auth.uid() is not null and v_challenge.kind = 'buddy' and exists (
    select 1
    from public.challenge_participants cp1
    join public.challenge_participants cp2 on cp2.challenge_id = cp1.challenge_id
    join public.challenges c on c.id = cp1.challenge_id
    where cp1.user_id = auth.uid()
      and cp2.user_id = v_challenge.created_by
      and c.kind = 'buddy'
      and c.status in ('pending', 'active')
      and c.end_date >= current_date
      and c.id <> v_challenge.id
  );

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
    ),
    'buddyAlreadyBusy', v_buddy_already_busy
  );
end;
$$;

grant execute on function public.challenge_invite_preview(text) to authenticated;

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
  v_uid_email text;
  v_creator_email text;
  v_existing_friend_id uuid;
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

  -- One live buddy challenge per pair (docs decision, this migration's
  -- header comment) — the actual gate; challenge_invite_preview's
  -- `buddyAlreadyBusy` just lets the UI avoid a wasted click before this.
  if v_challenge.kind = 'buddy' and exists (
    select 1
    from public.challenge_participants cp1
    join public.challenge_participants cp2 on cp2.challenge_id = cp1.challenge_id
    join public.challenges c on c.id = cp1.challenge_id
    where cp1.user_id = v_uid
      and cp2.user_id = v_challenge.created_by
      and c.kind = 'buddy'
      and c.status in ('pending', 'active')
      and c.end_date >= current_date
      and c.id <> v_challenge.id
  ) then
    raise exception 'You already have a challenge running with them. Let it finish first.' using errcode = 'P0001';
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

  -- Make the two of them buddies (step23) — see that file for why.
  select email into v_uid_email from auth.users where id = v_uid;
  select email into v_creator_email from auth.users where id = v_challenge.created_by;

  select id into v_existing_friend_id
    from public.friend_requests
    where (requester_id = v_challenge.created_by and lower(addressee_email) = lower(v_uid_email))
       or (requester_id = v_uid and lower(addressee_email) = lower(v_creator_email))
    limit 1;

  if v_existing_friend_id is not null then
    update public.friend_requests
    set status = 'accepted', addressee_id = coalesce(addressee_id, v_uid, v_challenge.created_by), responded_at = now()
    where id = v_existing_friend_id and status <> 'accepted';
  else
    insert into public.friend_requests
      (requester_id, requester_email, addressee_email, addressee_id, status, responded_at)
    values
      (v_challenge.created_by, v_creator_email, v_uid_email, v_uid, 'accepted', now());
  end if;

  return v_challenge.id;
end;
$$;

grant execute on function public.accept_challenge_invite(text, jsonb) to authenticated;
