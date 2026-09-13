-- Step 23 — bugfix found via live two-account testing on the deployed app:
-- accepting a buddy-challenge invite link (accept_challenge_invite, from
-- step13_challenge_invites.sql) only ever wrote to challenge_participants /
-- challenge_rule_targets. It never touched friend_requests — the table
-- src/app/(app)/buddies/page.tsx's whole "Your buddies" UI is built on. So
-- two people could accept a real, active challenge together and still show
-- up to each other as complete strangers on /buddies: no name, no card, and
-- (since `hasAnything` in that page is friends.length + incoming + outgoing)
-- the page falls back to the "No buddies yet" empty state, hiding the
-- challenge entirely — even though /progress correctly shows it, since that
-- page reads challenge_participants directly and never went through the
-- friends table at all.
--
-- Fix: accept_challenge_invite now also upserts an *already-accepted*
-- friend_requests row between the challenge's creator and the acceptor, so
-- the two people who just agreed to compete against each other are
-- immediately real buddies too — matching what anyone using the app would
-- assume "accepting a challenge from someone" already meant.
--
-- Run once via `node scripts/run-sql.mjs supabase/step23_challenge_accept_creates_friendship.sql`.

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

  -- New: make the two of them buddies, same as if either had sent the other
  -- a friend request and it got accepted. Checked in both directions since
  -- friend_requests has no direction-agnostic uniqueness of its own.
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
