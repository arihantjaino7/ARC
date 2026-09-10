-- Step 22 (Community feature request): invite anyone to a community through
-- a shareable link, bypassing search/request entirely.
-- Run once via `node scripts/run-sql.mjs supabase/step22_community_invite.sql`.
--
-- Modeled on challenge_invites/step13_challenge_invites.sql, with two
-- deliberate differences suited to a group instead of a two-person pair:
--
-- 1. REUSABLE, not single-accept. A buddy invite is consumed by the one
--    person who accepts it; a community invite is meant to be shared with a
--    whole group ("join our running club"), so it has no `accepted_by` and
--    stays valid for anyone until the admin revokes it. `revoked_at` (not a
--    delete) is how an admin retires a link, keeping history for anyone who
--    used to be able to join via it.
-- 2. ACCEPTING BYPASSES the private-community request/approval step entirely
--    (Step C3/C4's join_community still asks a private community's stranger
--    to wait for approval — this is the opposite path: the admin already
--    chose to send this exact person the link, which IS the approval). No
--    scope='own' target collection is needed here — communities have no
--    scope='own' rules any more (the admin's template is one shared number
--    for everyone, per this feature's other change), so there's nothing per-
--    member to collect at accept time.

create table if not exists public.community_invites (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities (id) on delete cascade,
  token text not null unique
    default (replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')),
  created_by uuid not null references auth.users (id) on delete cascade,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists community_invites_community on public.community_invites (community_id);

alter table public.community_invites enable row level security;

-- Plain RLS suffices here (unlike joining itself, which needs a
-- security-definer RPC to touch two tables at once): creating and revoking a
-- link only ever touches this one row, and only the community's own admin
-- may do either.
create policy "Admin can view their community's invites"
  on public.community_invites for select
  using (public.is_community_admin(community_id));

create policy "Admin can create an invite for their community"
  on public.community_invites for insert
  with check (created_by = auth.uid() and public.is_community_admin(community_id));

create policy "Admin can revoke their community's invites"
  on public.community_invites for update
  using (public.is_community_admin(community_id))
  with check (public.is_community_admin(community_id));

-- ---------------------------------------------------------------------------
-- 1. community_invite_preview — read-only, what the join screen renders.
-- ---------------------------------------------------------------------------
-- Same reasoning as challenge_invite_preview/community_detail: a visitor who
-- isn't a member yet needs to read the community's name/rules before
-- deciding to accept, which plain RLS on communities/challenge_rules won't
-- allow for a private community's stranger.

create or replace function public.community_invite_preview(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_invite public.community_invites%rowtype;
  v_community public.communities%rowtype;
  v_admin_label text;
  v_rules jsonb;
  v_my_status text;
begin
  select * into v_invite from public.community_invites where token = p_token;
  if not found then
    return jsonb_build_object('error', 'not_found');
  end if;

  select * into v_community from public.communities where id = v_invite.community_id;

  select coalesce(p.display_name, split_part(u.email, '@', 1))
    into v_admin_label
    from auth.users u
    left join public.profiles p on p.id = u.id
    where u.id = v_community.admin_id;

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

  select cm.status into v_my_status
    from public.community_members cm
    where cm.community_id = v_community.id and cm.user_id = auth.uid();

  return jsonb_build_object(
    'communityId', v_community.id,
    'name', v_community.name,
    'description', v_community.description,
    'visibility', v_community.visibility,
    'adminLabel', v_admin_label,
    'rules', v_rules,
    'revoked', v_invite.revoked_at is not null,
    'isOwnInvite', v_community.admin_id = auth.uid(),
    'alreadyMember', v_my_status = 'member'
  );
end;
$$;

grant execute on function public.community_invite_preview(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. accept_community_invite
-- ---------------------------------------------------------------------------

create or replace function public.accept_community_invite(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite public.community_invites%rowtype;
  v_community public.communities%rowtype;
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  select * into v_invite from public.community_invites where token = p_token;
  if not found then
    raise exception 'This invite link is not valid.' using errcode = 'P0002';
  end if;
  if v_invite.revoked_at is not null then
    raise exception 'This invite link has been revoked.' using errcode = 'P0001';
  end if;

  select * into v_community from public.communities where id = v_invite.community_id;
  if v_community.admin_id = v_uid then
    raise exception 'You run this community.' using errcode = 'P0001';
  end if;
  if v_community.template_challenge_id is null then
    raise exception 'This community has no challenge yet.' using errcode = 'P0001';
  end if;

  -- Same 20-member cap as join_community/respond_to_join_request
  -- (step21_leaderboard.sql) — an invite link is another door into the same
  -- room, so it gets the same limit.
  if (
    select count(*) from public.community_members cm2
    where cm2.community_id = v_community.id and cm2.status = 'member'
  ) >= 20 then
    raise exception 'This community is full.' using errcode = 'P0001';
  end if;

  -- Bypasses the private-community request/approval step entirely: sending
  -- the link IS the admin's approval. Both rows land as accepted directly.
  insert into public.community_members (community_id, user_id, role, status, joined_at)
  values (v_community.id, v_uid, 'member', 'member', now())
  on conflict (community_id, user_id)
  do update set status = 'member', role = 'member', joined_at = now();

  insert into public.challenge_participants (challenge_id, user_id, role, status, joined_at)
  values (v_community.template_challenge_id, v_uid, 'member', 'accepted', now())
  on conflict (challenge_id, user_id)
  do update set status = 'accepted', joined_at = now();

  return jsonb_build_object('communityId', v_community.id);
end;
$$;

grant execute on function public.accept_community_invite(text) to authenticated;
