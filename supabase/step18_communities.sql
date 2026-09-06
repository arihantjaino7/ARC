-- Step 18 (Community Step C1): communities + community_members tables and
-- RLS (docs/PLAN-COMMUNITY.md Step C1, docs/PLAN-V2.md §6).
-- Run once via `node scripts/run-sql.mjs supabase/step18_communities.sql`.
--
-- Reuses `challenges`/`challenge_participants`/`challenge_rules` unchanged
-- (kind='community', already supported since step12) — this file only adds
-- the group-membership layer on top: who's in a community, who's its admin,
-- and (public vs. private) how you get in. Joining itself (the RPC that
-- actually inserts a community_members row) is Step C3's job, not this one —
-- this step is schema + read/admin-update RLS only.
--
-- SQL only, no UI yet — same "pure schema step" shape as V2 Step 3.

-- ---------------------------------------------------------------------------
-- 1. communities
-- ---------------------------------------------------------------------------

create table if not exists public.communities (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 60),
  description text check (description is null or char_length(description) <= 500),
  visibility text not null check (visibility in ('public', 'private')),
  admin_id uuid not null references auth.users (id) on delete cascade,
  -- The admin-authored challenge template (kind='community') this community
  -- scores against. Nullable so Step C2 can insert the community row after
  -- the challenge exists, or before, without a chicken-and-egg constraint —
  -- but every community that's actually joinable will have one by the time
  -- Step C3 runs.
  template_challenge_id uuid references public.challenges (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists communities_admin on public.communities (admin_id);

-- ---------------------------------------------------------------------------
-- 2. community_members
-- ---------------------------------------------------------------------------
-- 'requested' is a private-community join request that hasn't been approved
-- yet (Step C4) — it deliberately does NOT get a challenge_participants row,
-- so a requester never appears on the leaderboard or counts toward scoring
-- until approved. 'removed' keeps the row (and the history the person
-- already logged) rather than deleting it, same "don't destroy history"
-- pattern as challenge_participants.status='left'.

create table if not exists public.community_members (
  community_id uuid not null references public.communities (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'member' check (role in ('admin', 'member')),
  status text not null default 'member' check (status in ('member', 'requested', 'removed')),
  joined_at timestamptz,
  primary key (community_id, user_id)
);

create index if not exists community_members_user on public.community_members (user_id);

-- ---------------------------------------------------------------------------
-- 3. security-definer helpers, mirroring is_challenge_participant
-- ---------------------------------------------------------------------------
-- Same reasoning as step12's is_challenge_participant: a plain "select from
-- community_members inside its own policy" is the classic self-referencing-
-- RLS footgun. These run with RLS bypassed and get reused across every
-- table's policies instead.

create or replace function public.is_community_member(p_community_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.community_members cm
    where cm.community_id = p_community_id
      and cm.user_id = auth.uid()
      and cm.status = 'member'
  );
$$;

create or replace function public.is_community_admin(p_community_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.communities c
    where c.id = p_community_id and c.admin_id = auth.uid()
  );
$$;

grant execute on function public.is_community_member(uuid) to authenticated;
grant execute on function public.is_community_admin(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. RLS
-- ---------------------------------------------------------------------------

alter table public.communities enable row level security;

-- A public community is readable by any authenticated user — that read IS
-- the discovery feature (Step C3), not a privacy leak: only the name,
-- description and visibility itself are public, never member lists or
-- scores (those stay gated behind is_community_member on community_members
-- and the future leaderboard RPC). A private community is readable only by
-- its members and its admin.
create policy "Public communities are visible to anyone signed in; private ones to members"
  on public.communities for select
  using (
    visibility = 'public'
    or admin_id = auth.uid()
    or public.is_community_member(id)
  );

create policy "Users can create a community as its admin"
  on public.communities for insert
  with check (admin_id = auth.uid());

create policy "Only the admin can update their community"
  on public.communities for update
  using (admin_id = auth.uid())
  with check (admin_id = auth.uid());

alter table public.community_members enable row level security;

-- Readable by fellow members (so the roster/leaderboard can be built) and by
-- the admin (who needs to see 'requested' rows to approve them in Step C4),
-- plus always your own row so you can see your own pending request.
create policy "Members, the admin, and yourself can view membership rows"
  on public.community_members for select
  using (
    user_id = auth.uid()
    or public.is_community_admin(community_id)
    or public.is_community_member(community_id)
  );

-- No insert/update policy here on purpose: joining (Step C3's
-- join_community RPC), approving (Step C4's respond_to_join_request RPC),
-- and removal all need to touch community_members AND
-- challenge_participants together, which is exactly the "cross-user write,
-- goes through a security-definer RPC" pattern this project already uses for
-- accept_challenge_invite / propose_challenge_change — not a broad RLS
-- policy that only half of the job could safely live behind anyway.

-- ---------------------------------------------------------------------------
-- 5. Tighten the verifications insert policy (not optional — see
--    docs/PLAN-COMMUNITY.md Step C1)
-- ---------------------------------------------------------------------------
-- step16_verifications.sql's insert policy lets anyone who shares ANY
-- challenge_participants row with the entry's owner flag that entry. That
-- was fine when every challenge was two-person; the moment a 50-person
-- community challenge exists, the same join means every member of that
-- community can flag every other member's entries, and a flagged entry
-- scores 0 until resolved (step16's challenge_scoreboard exclusion) — a real
-- exposure, not a hypothetical one.
--
-- Decision (written down deliberately, per the plan's own instruction):
-- restrict verification to `challenges.kind = 'buddy'`. Buddy verification
-- is a two-person trust mechanic by design (docs/PLAN-V2.md §4, layer 5) —
-- "the other person you're racing against vouches for your day." A
-- 50-person leaderboard has no single "the other side"; group-level
-- moderation, if ever wanted, belongs to the community admin specifically
-- (a different, not-yet-built feature), not to every member transitively.
-- So: recreate the policy with the challenge_participants self-join scoped
-- to challenges of kind='buddy' only. A community's `verifications` reads
-- (select policy, untouched) are unaffected — this only restricts who may
-- INSERT a new verification.

drop policy if exists "A buddy can verify the other side's entry within 48h" on public.verifications;

create policy "A buddy (never a community member) can verify the other side's entry within 48h"
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
          join public.challenges c on c.id = mine.challenge_id
          where mine.user_id = auth.uid()
            and theirs.user_id = le.user_id
            and c.kind = 'buddy'
        )
    )
  );
