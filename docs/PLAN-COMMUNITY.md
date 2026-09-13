# Gym-Shym — Community, split into one-chat steps

## Context

Buddies is finished: `docs/PLAN-V2.md` §3-§5 shipped as V2 Steps 1-13. This file is the
build order for **Community** (`docs/PLAN-V2.md` §6). It lives in the repo, next to the
spec it implements, rather than in a separate planning location.

The spec, in one paragraph: one **admin** authors a challenge template, members join it
read-only, `visibility='public'` joins instantly while `'private'` lands as a request the
admin approves, and the group view is a **leaderboard of member scores plus a single group
aggregate bar** so the community competes as a unit too.

### What Community gets for free

Community is mostly new UI plus an access-control layer, because the hard parts already
exist and were built kind-agnostic on purpose:

- **`challenges.kind` is already `'buddy'|'community'`** (step12). Communities reuse
  `challenges`, `challenge_participants`, `challenge_rules` and `challenge_rule_targets`
  unchanged — there is no parallel schema.
- **The scoring rollup is already N-participant.** `rollupRule` / `rollupChallenge` /
  `dailyScores` (`src/lib/challenges/rollup.ts`) know nothing about "two people"; they score
  one participant at a time. Nothing in them needs to change.
- **`scope='own'` already works for N people.** `challenge_rule_targets` is keyed
  `(rule_id, user_id)`, so "individual member targets where the admin allows it, otherwise a
  shared number for everyone" is already representable.
- **`getMyActiveChallenges()` has no `kind` filter** (verified), so community challenges will
  flow into the Personal Dashboard's metric union and challenge cards the moment they exist —
  Step 12's payoff applies to communities for free. Step C6 confirms this rather than assumes.
- **`notifications` + the tab-bar unread dot** (step15) are generic; join requests and
  approvals just add new `kind` values.
- **The day lock, late/edited/flagged badges, and grace tokens** are all user-scoped and
  behave identically inside a community.

### What genuinely has to be built or decided

- `communities` + `community_members` tables, and the RLS that makes an admin's template
  uneditable by members *at the database level, not just in the UI* (`docs/PLAN-V2.md` §6).
- A **self-join** path. `challenge_participants`' existing insert policy is
  "Creator can add participants", and `accept_challenge_invite` hard-caps at two people
  (`'This challenge already has its two participants.'`). Neither works for communities.
- A **leaderboard** view and a **group aggregate**. The buddy screen's `Scoreboard`
  component does `participants.find(p => !p.isCaller)!` — that shape does not generalize.
- **Two behaviour decisions** that only exist once groups do: how blind mode behaves with N
  people, and who is allowed to flag whose entries (see Step C1's second half — this one is
  a live exposure, not a hypothetical).

---

## How to use this file

Each step is scoped to be small and independently verifiable. Every step ends with
something you can see or run.

Read `docs/PLAN-V2.md` §6 alongside this file's step. Project conventions that bite if
forgotten:

- Schema changes are `.sql` files under `supabase/`, applied with
  `node scripts/run-sql.mjs supabase/<file>.sql` (service-role key from `.env.local`).
  `node scripts/verify.mjs <table> "<query>"` confirms one landed.
- A `"use server"` file may only export async functions. Shared constants/types go in a
  plain `types.ts` — see the Step 5 bugfix note in `PROGRESS.md`.
- Cross-user reads/writes go through a `security definer` RPC, never a broad RLS policy —
  the pattern set by `is_challenge_participant`, `challenge_invite_preview`,
  `challenge_scoreboard`, `propose_challenge_change`.
- **Scoring stays in TypeScript.** SQL fetches values; `rollup.ts` turns them into scores.
  Do not reimplement scoring in PL/pgSQL — `challenge_scoreboard`'s header comment explains
  why at length.
- This is Next.js 16: the middleware file is `src/proxy.ts`, exporting `proxy`, and route
  matching must be segment-aware (`matchesRoute`).
- Next 16 refuses a second `next dev` in the same folder. If a server is already running on
  :3000, drive that one instead of starting another.
- Verification pattern for DB work: a throwaway `do $$ ... $$` block run via `run-sql.mjs`
  that builds fixtures, asserts with `raise exception`, and deletes everything it created.
  `auth.uid()` is simulated with
  `perform set_config('request.jwt.claims', '{"sub":"<uuid>"}', true)`.
  **`SET ROLE` does not work in that harness** — everything runs inside `exec_sql`, itself
  `security definer`, and Postgres refuses role switching there. So plain-RLS policies can't
  be exercised as a non-bypassing role from a script; `security definer` RPCs can be tested
  fully. Say which of the two you actually verified.

---

## Step C1 — Community tables, and closing the verification hole (SQL only, no UI)

**Say this:** *"Gym-Shym Community step 1: the community tables."*

Create `supabase/step18_communities.sql`:

- `communities` — `id`, `name`, `description`, `visibility ('public'|'private')`, `admin_id`,
  `template_challenge_id` (references `challenges`, the admin-authored template), `created_at`.
- `community_members` — `(community_id, user_id)` composite PK, `role ('admin'|'member')`,
  `status ('member'|'requested'|'removed')`, `joined_at`.
- Two `security definer` helpers mirroring `is_challenge_participant`:
  `is_community_member(community_id)` and `is_community_admin(community_id)`. Use them in
  policies rather than self-referencing subqueries on `community_members`.
- RLS: a **public** community is readable by any authenticated user (that read *is* the
  discovery feature in Step C3); a **private** one only by its members and its admin. Only
  the admin may update the community row. `community_members` is readable by fellow members;
  inserts go through the RPC in Step C3, not a policy.

Then the part that is not optional and is easy to miss:

**Tighten the `verifications` insert policy.** It currently allows a flag from anyone who
shares *any* `challenge_participants` row with the entry's owner:

```sql
select 1 from public.challenge_participants mine
join public.challenge_participants theirs on theirs.challenge_id = mine.challenge_id
where mine.user_id = auth.uid() and theirs.user_id = le.user_id
```

That was written when the only challenges were two-person. The day communities ship, it
silently means **every member of a 50-person group can flag every other member's entries**,
and a flagged entry is worth 0 until resolved. Restrict the join to
`challenges.kind = 'buddy'` (recommended — buddy verification is a two-person trust
mechanic), or make it community-admin-only if group verification is genuinely wanted. Decide
deliberately and write the reason in the file. Do it in *this* migration, before communities
can create the exposure.

**Done when:** the file exists, `run-sql.mjs` applied it, a throwaway `do $$` block proved
the helpers and the tightened verification policy behave, and `PROGRESS.md` records it.
No UI yet — same "pure schema step" shape as V2 Step 3.

---

## Step C2 — Create a community (the admin authors the template)

**Say this:** *"Gym-Shym Community step 2: creating a community."*

`src/app/(app)/community/new/` — a short form, not a six-screen wizard: name, description,
public/private, then the challenge template's rules and dates.

- **Reuse, don't copy.** The per-rule editing UI (scope toggle, target/min/max, weight, gym
  schedule, "+ Add a rule") already exists twice — in `NewChallengeWizard.tsx` (V2 Steps 5-6)
  and in a cut-down form in `ChangeRequestPanel.tsx`'s `RuleFields` (V2 Step 10). Lift the
  shared piece into `src/components/` and have all three use it, the same way `EntryBadges`
  was lifted in V2 Step 9. This is the step to pay that debt, not later.
- `createCommunity()` in a new `src/lib/communities/actions.ts` (+ `types.ts` for the plain
  types) writes, in order: the `challenges` row (`kind='community'`, `status='draft'`), its
  `challenge_rules` (the existing "creator can add rules while draft" policy covers this
  unchanged), the admin's own `challenge_participants` and `challenge_rule_targets` rows,
  then flips the challenge to `'active'`, then the `communities` row pointing at it and the
  admin's `community_members` row.
- No invite token: discovery replaces it. Private communities are found and requested, not
  linked. (An invite link for private groups is a reasonable phase-2 addition — see the end
  of this file.)

**Done when:** an admin can create a community from the UI and see the `communities`,
`community_members`, `challenges` and `challenge_rules` rows it produced.

---

## Step C3 — Discovery and joining

**Say this:** *"Gym-Shym Community step 3: browsing and joining communities."*

`src/app/(app)/community/page.tsx` stops being a placeholder: your communities at the top,
then a browsable list of public ones you're not in.

The join itself needs a `security definer` RPC, `join_community(community_id, own_targets)`,
for two reasons worth writing down in the SQL file: `challenge_participants`' insert policy
is creator-only, so a member can't add themselves; and a private join must record a request
*without* creating a participant row at all.

- `visibility='public'` → `community_members` row as `status='member'` **and** a
  `challenge_participants` row as `status='accepted'`, in one transaction.
- `visibility='private'` → `community_members` row as `status='requested'` only. No
  participant row, so they don't appear on the leaderboard or in scoring until approved.
- Any `scope='own'` rule gets an inline number input on the join screen, pre-filled from
  *this* user's own recommended targets — `src/app/join/[token]/page.tsx` already does
  exactly this for buddy invites; follow it, including writing `challenge_rule_targets` from
  the RPC rather than a second client round trip.
- Guard the obvious: already a member, already requested, community deleted, and the admin
  trying to join their own community.

**Done when:** a second real account can find a public community, join it, and immediately
see its rules — and can request a private one and see "waiting for approval".

---

## Step C4 — Approvals and membership management

**Say this:** *"Gym-Shym Community step 4: join requests and member management."*

- Admin view of pending requests, with approve/decline. `respond_to_join_request(...)` RPC:
  approval flips `community_members.status` to `'member'` **and** inserts the
  `challenge_participants` row (that second half is the bit that makes them start being
  scored); decline just records it.
- Notifications reuse the existing table and the tab-bar dot from V2 Step 10 — add kinds like
  `community_join_requested` (to the admin) and `community_join_approved` / `_declined` (to
  the requester). Nothing new is needed on the client: `getUnreadCount()` and the dot already
  work, though the dot currently renders on **Buddies** only — move it to whichever tab the
  notification's payload points at.
- Admin can remove a member: `community_members.status='removed'` **and**
  `challenge_participants.status='left'`, so their scores stop counting without deleting the
  history they already logged.
- A member can leave, with the same two-row effect.

**Done when:** account B requests a private community, account A sees a dot and the request,
approves it, and B appears as a member on the leaderboard.

---

## Step C5 — The leaderboard and the group aggregate

**Say this:** *"Gym-Shym Community step 5: the leaderboard."*

The scoring half. Two things to build and two to decide.

Build:

- `groupAggregate(scores)` — a pure function in `src/lib/challenges/rollup.ts` (mean of
  member scores, the "community competes as a unit" bar from `docs/PLAN-V2.md` §6), with
  tests, same as every other pure addition to that file.
- `community_leaderboard(community_id)` — a `security definer` RPC returning each accepted
  member's label and their logged values for the challenge's metrics, which
  `getCommunityLeaderboard()` then rolls up with the **existing, unchanged**
  `rollupChallenge`. Model it on `challenge_scoreboard` (step14/16/17), including its
  design-boundary comment: values and badge counts leave the database, raw `log_entries` rows
  do not.

Decide, and write the reasoning into the SQL file's header the way step14 does:

- **Scale.** `challenge_scoreboard` returns *every* participant's full per-metric history for
  the challenge range. That is nothing for two people and wasteful for fifty. Options: cap
  community size (simplest, honest for a personal app), narrow the returned window to what the
  leaderboard actually renders, or precompute per-member daily scores on write. Pick one
  knowingly rather than discovering it at 50 members.
- **Blind mode with N people.** "You can't see your buddy's number until you log your own"
  is a clean two-person mechanic; against a whole leaderboard it's a different proposition.
  Recommendation: default it **off** for `kind='community'` (the leaderboard is the point)
  and leave the per-challenge toggle honest about what it does. The existing SQL already
  generalises (`cp.user_id <> v_uid`), so this is a default and a copy decision, not a code one.

**Done when:** the community screen ranks every member, shows the group aggregate bar
alongside them, and `npx vitest run` covers `groupAggregate`.

---

## Step C6 — Wiring Community into the rest of the app

**Say this:** *"Gym-Shym Community step 6: make communities show up everywhere they should."*

The integration pass. Most of this is verification rather than construction, which is the
point — the app was built kind-agnostic.

- `src/app/(app)/community/[id]/page.tsx` — the detail screen: the leaderboard from C5, the
  rules the admin set, your own progress against them, and the admin-only controls from C4.
- **Confirm** (don't assume) that `getMyActiveChallenges()`'s missing `kind` filter does what
  it looks like it does: community metrics join `/progress`'s tracked-fields union and get
  their own challenge card, with the "Feeds …" chips naming the community. That is Step 12's
  payoff arriving for free.
- **Fix Home.** `getTodayMatchups()` in `src/app/(app)/page.tsx` is two-person shaped —
  `participants.find(p => !p.isCaller)`. With a twenty-member community it would silently pick
  an arbitrary opponent. Either skip `kind='community'` challenges there, or show
  "you vs the group average", which is the more interesting line.
- **Confirm the buddy-only paths stay buddy-only:** `getMyChallengesByBuddy()` and
  `getStakeLedger()` both already filter `.eq("kind", "buddy")` (verified), so communities
  cannot leak into the buddy comparison screen or the stake ledger. Re-check after the fact.
- Decide whether change requests (V2 Step 10) apply to communities at all. The spec says
  members join a template **read-only**, so the honest answer is probably "the admin edits it
  directly, no approval flow" — but the immutable-rule guard still applies, so an admin edit
  must still close the old rule and start the replacement tomorrow. Never make a community
  rule change retroactive; that's the same anti-cheat rule #1.

**Done when:** logging protein once visibly moves a buddy challenge *and* a community
challenge, Home renders sensibly with a community in play, and the buddy screens are
provably unaffected.

---

## Later (phase 2, not part of this plan)

Deliberately out of scope, in rough order of how much they'd add:

- **Invite links for private communities** — reuse `challenge_invites`' token pattern.
- **More than one challenge per community** — `communities.template_challenge_id` becomes a
  join table; seasons ("March cut") fall out of this naturally.
- **Community change requests** — if members should get a say after all.
- **Community chat / a feed** — the thing that makes a group sticky, and a large build.
- **Proof photos and device sync** — still phase 2 for Buddies too (`docs/PLAN-V2.md` §4).
