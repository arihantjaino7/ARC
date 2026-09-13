-- Step 25: fix a real bug in buddy verification (confirm/dispute).
--
-- The insert/update policies on verifications (step16, tightened in step18)
-- each embed a correlated subquery against log_entries to check the target
-- entry: owned by someone else, logged within 48 hours, and shared with the
-- verifier on a buddy challenge. But log_entries' own select policy (step11)
-- is "own rows only" — and a policy's subquery against another table is
-- still bound by that table's own RLS. So "select 1 from log_entries le
-- where le.id = entry_id and le.user_id <> auth.uid() ..." always sees zero
-- rows for anyone else's entry: that row is invisible to the verifier under
-- log_entries' own policy before the verifications policy's conditions are
-- even reached. Every insert into verifications has therefore always failed
-- with a generic RLS violation, for every user, unconditionally — nobody
-- has ever been able to confirm or flag a buddy's entry.
--
-- This was never caught because this project's own verification harness
-- (scripts/run-sql.mjs's exec_sql RPC) runs as security definer and bypasses
-- RLS entirely, so every prior "verified functionally against the real
-- database" check for this feature ran in a context where the broken policy
-- could never actually fire.
--
-- Fix: the same pattern already used for accept_challenge_invite,
-- propose_challenge_change, and every other cross-user write plain RLS
-- can't express safely — a security-definer RPC. submit_verification()
-- re-checks the same three conditions itself (with RLS bypassed, so the
-- log_entries read actually sees the row) and performs the upsert. The old
-- insert/update policies are dropped: they can never succeed, so leaving
-- them in place would just be dead, misleading code. The select policy is
-- untouched — it only ever needs to check the CALLER's own row ownership,
-- which log_entries' RLS does not hide from them.

drop policy if exists "A buddy (never a community member) can verify the other side's entry within 48h" on public.verifications;
drop policy if exists "Verifier can change their call within the window" on public.verifications;

create or replace function public.submit_verification(p_entry_id uuid, p_state text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_entry public.log_entries%rowtype;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;
  if p_state not in ('ok', 'disputed') then
    raise exception 'Invalid verification state.' using errcode = 'P0001';
  end if;

  select * into v_entry from public.log_entries where id = p_entry_id;
  if not found then
    raise exception 'That entry no longer exists.' using errcode = 'P0002';
  end if;
  if v_entry.user_id = v_uid then
    raise exception 'You cannot verify your own entry.' using errcode = 'P0001';
  end if;
  if v_entry.logged_at <= now() - interval '48 hours' then
    raise exception 'This entry is outside the 48-hour verification window.' using errcode = 'P0001';
  end if;

  if not exists (
    select 1
    from public.challenge_participants mine
    join public.challenge_participants theirs on theirs.challenge_id = mine.challenge_id
    join public.challenges c on c.id = mine.challenge_id
    where mine.user_id = v_uid
      and theirs.user_id = v_entry.user_id
      and c.kind = 'buddy'
  ) then
    raise exception 'You can only verify a buddy''s entry.' using errcode = 'P0001';
  end if;

  insert into public.verifications (entry_id, verifier_id, state)
  values (p_entry_id, v_uid, p_state)
  on conflict (entry_id, verifier_id) do update set state = excluded.state;
end;
$$;

grant execute on function public.submit_verification(uuid, text) to authenticated;
