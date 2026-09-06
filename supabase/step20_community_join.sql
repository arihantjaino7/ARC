-- Step 20 (Community Steps C3 + C4): discovery, joining, approvals, and
-- membership management (docs/PLAN-COMMUNITY.md).
-- Run once via `node scripts/run-sql.mjs supabase/step20_community_join.sql`.
--
-- Nothing existing is touched (only new functions), so this is safe to run
-- alongside real data.
--
-- Five security-definer RPCs, same pattern as accept_challenge_invite /
-- propose_challenge_change / respond_challenge_change: every one of these is
-- a cross-table (community_members AND challenge_participants) or
-- cross-user write, which step18_communities.sql deliberately left with no
-- plain RLS policy to cover.
--
-- community_detail is the read-side counterpart of challenge_invite_preview:
-- a visitor who isn't a member yet needs to read a community's rules (which
-- live on challenge_rules, gated to participants only) before deciding to
-- join. It deliberately does NOT re-apply communities' own private/member-only
-- SELECT policy: docs/PLAN-COMMUNITY.md's own Step C2 note says private
-- communities are "found and requested, not linked" (an invite link is
-- explicitly deferred to phase 2), and search_communities (below) already
-- surfaces a private community's name to anyone who searches for it — so
-- gating the detail screen behind membership would strand a searcher with a
-- name and nothing else. What stays gated to admin/member here is the
-- roster and the pending-requests list, never the rules or existence.

create or replace function public.search_communities(p_query text)
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', c.id,
      'name', c.name,
      'description', c.description,
      'visibility', c.visibility
    ) order by c.name), '[]'::jsonb)
  from public.communities c
  where c.name ilike '%' || p_query || '%'
    and c.admin_id <> auth.uid()
    and not exists (
      select 1 from public.community_members cm
      where cm.community_id = c.id and cm.user_id = auth.uid() and cm.status in ('member', 'requested')
    )
  limit 20;
$$;

grant execute on function public.search_communities(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 1. community_detail — read-only, what the community screen renders.
-- ---------------------------------------------------------------------------

create or replace function public.community_detail(p_community_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_uid uuid := auth.uid();
  v_community public.communities%rowtype;
  v_is_admin boolean;
  v_my_status text;
  v_rules jsonb;
  v_members jsonb := '[]'::jsonb;
  v_pending jsonb := '[]'::jsonb;
begin
  select * into v_community from public.communities where id = p_community_id;
  if not found then
    return jsonb_build_object('error', 'not_found');
  end if;

  v_is_admin := v_community.admin_id = v_uid;

  select cm.status into v_my_status
    from public.community_members cm
    where cm.community_id = p_community_id and cm.user_id = v_uid;

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
    where r.challenge_id = v_community.template_challenge_id and r.effective_to is null;

  if v_is_admin or v_my_status = 'member' then
    select coalesce(jsonb_agg(jsonb_build_object(
        'userId', cm.user_id,
        'label', coalesce(p.display_name, split_part(u.email, '@', 1)),
        'role', cm.role
      ) order by cm.joined_at), '[]'::jsonb)
      into v_members
      from public.community_members cm
      join auth.users u on u.id = cm.user_id
      left join public.profiles p on p.id = cm.user_id
      where cm.community_id = p_community_id and cm.status = 'member';
  end if;

  if v_is_admin then
    select coalesce(jsonb_agg(jsonb_build_object(
        'userId', cm.user_id,
        'label', coalesce(p.display_name, split_part(u.email, '@', 1))
      )), '[]'::jsonb)
      into v_pending
      from public.community_members cm
      join auth.users u on u.id = cm.user_id
      left join public.profiles p on p.id = cm.user_id
      where cm.community_id = p_community_id and cm.status = 'requested';
  end if;

  return jsonb_build_object(
    'id', v_community.id,
    'name', v_community.name,
    'description', v_community.description,
    'visibility', v_community.visibility,
    'adminId', v_community.admin_id,
    'isAdmin', v_is_admin,
    'myStatus', case when v_is_admin then 'admin' else coalesce(v_my_status, 'none') end,
    'rules', v_rules,
    'members', v_members,
    'pendingRequests', v_pending
  );
end;
$$;

grant execute on function public.community_detail(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. join_community
-- ---------------------------------------------------------------------------
-- visibility='public' -> a community_members row AND a challenge_participants
-- row, both in one call (docs/PLAN-COMMUNITY.md Step C3).
-- visibility='private' -> a community_members row with status='requested'
-- only. No participant row, so a requester doesn't score or appear on the
-- leaderboard until Step C4's respond_to_join_request approves them.
--
-- p_own_targets is written in BOTH branches, up front, exactly like
-- accept_challenge_invite does for buddy invites — so a later approval never
-- needs a second client round trip to collect the requester's own numbers.

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

-- ---------------------------------------------------------------------------
-- 3. respond_to_join_request (Step C4)
-- ---------------------------------------------------------------------------
-- Approval flips community_members.status to 'member' AND inserts the
-- challenge_participants row — that second half is what makes them start
-- being scored. Decline just records it (community_members.status='removed',
-- same "never in" state a removed member ends up in, since there's nothing
-- else to distinguish a declined request from).

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
-- 4. remove_community_member (Step C4, admin-initiated)
-- ---------------------------------------------------------------------------
-- Stops a member's scores from counting without destroying the history they
-- already logged, same "don't destroy history" pattern challenge_participants
-- already uses elsewhere in this app.

create or replace function public.remove_community_member(
  p_community_id uuid,
  p_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_community public.communities%rowtype;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  select * into v_community from public.communities where id = p_community_id;
  if not found then
    raise exception 'Community not found.' using errcode = 'P0002';
  end if;
  if v_community.admin_id <> v_uid then
    raise exception 'Only the admin can remove a member.' using errcode = '42501';
  end if;
  if p_user_id = v_uid then
    raise exception 'The admin cannot remove themselves.' using errcode = 'P0001';
  end if;

  update public.community_members
    set status = 'removed'
    where community_id = p_community_id and user_id = p_user_id and status = 'member';
  if not found then
    raise exception 'That user is not a member.' using errcode = 'P0001';
  end if;

  update public.challenge_participants
    set status = 'left'
    where challenge_id = v_community.template_challenge_id and user_id = p_user_id;

  return jsonb_build_object('status', 'removed');
end;
$$;

grant execute on function public.remove_community_member(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. leave_community (Step C4, self-initiated)
-- ---------------------------------------------------------------------------
-- The admin can't use this — leaving their own community would strand it
-- with no admin. Deleting/handing off a community is out of scope for now.

create or replace function public.leave_community(p_community_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_community public.communities%rowtype;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  select * into v_community from public.communities where id = p_community_id;
  if not found then
    raise exception 'Community not found.' using errcode = 'P0002';
  end if;
  if v_community.admin_id = v_uid then
    raise exception 'The admin cannot leave their own community.' using errcode = 'P0001';
  end if;

  update public.community_members
    set status = 'removed'
    where community_id = p_community_id and user_id = v_uid and status = 'member';
  if not found then
    raise exception 'You are not a member of this community.' using errcode = 'P0001';
  end if;

  update public.challenge_participants
    set status = 'left'
    where challenge_id = v_community.template_challenge_id and user_id = v_uid;

  return jsonb_build_object('status', 'left');
end;
$$;

grant execute on function public.leave_community(uuid) to authenticated;
