-- Step 10: friends (invite + accept).
-- Run this once in the Supabase dashboard -> SQL Editor -> New query -> Run.
--
-- One row per invite, identified by email rather than a user id, since the
-- app has no directory to search other users by. `requester_email` and
-- `addressee_email` are stored directly so both sides of a request can be
-- displayed without needing to look up the other user's auth.users row
-- (which RLS wouldn't allow anyway). Once accepted, `addressee_id` gets
-- filled in and the row itself doubles as the "friendship" record — no
-- separate friendships table.

create extension if not exists pgcrypto;

create table if not exists public.friend_requests (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references auth.users (id) on delete cascade,
  requester_email text not null,
  addressee_email text not null,
  addressee_id uuid references auth.users (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  check (lower(requester_email) <> lower(addressee_email))
);

-- Only one pending invite per (requester, addressee) at a time — a new
-- invite can still be sent after a decline, since this only applies while
-- status = 'pending'.
create unique index if not exists friend_requests_pending_pair
  on public.friend_requests (requester_id, lower(addressee_email))
  where status = 'pending';

alter table public.friend_requests enable row level security;

-- auth.jwt() ->> 'email' is how a row addressed to you (by email, before you
-- necessarily have an addressee_id) is matched against your own session.
create policy "View requests you sent or received"
  on public.friend_requests for select
  using (
    auth.uid() = requester_id
    or lower(addressee_email) = lower(auth.jwt() ->> 'email')
  );

create policy "Send a request as yourself"
  on public.friend_requests for insert
  with check (
    auth.uid() = requester_id
    and lower(requester_email) = lower(auth.jwt() ->> 'email')
  );

create policy "Respond to a request addressed to you"
  on public.friend_requests for update
  using (lower(addressee_email) = lower(auth.jwt() ->> 'email'))
  with check (lower(addressee_email) = lower(auth.jwt() ->> 'email'));

create policy "Cancel a request you sent"
  on public.friend_requests for delete
  using (auth.uid() = requester_id and status = 'pending');
