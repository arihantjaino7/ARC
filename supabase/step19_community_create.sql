-- Step 19 (Community Step C2): the one RLS gap step18 left, that createCommunity
-- needs to close before it can run.
-- Run once via `node scripts/run-sql.mjs supabase/step19_community_create.sql`.
--
-- step18_communities.sql deliberately shipped community_members with NO
-- insert/update policy: ordinary joining (Step C3) and approval (Step C4)
-- both need to touch community_members AND challenge_participants together,
-- which belongs behind a security-definer RPC, not a plain policy that could
-- only ever do half that job.
--
-- createCommunity() (this step) is different: it needs exactly one narrow,
-- single-table, single-user write RLS CAN express safely — the community's
-- own admin inserting THEMSELVES as its first member, right after they
-- created it. That's the admin acting on their own community and their own
-- row, never a cross-user write, so it doesn't reopen the reasoning C1 was
-- protecting against. Scoped tightly: user_id must be the caller, and the
-- community they're joining must already have them as its admin_id.

create policy "Admin can add themselves as their own community's first member"
  on public.community_members for insert
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.communities c
      where c.id = community_id and c.admin_id = auth.uid()
    )
  );
