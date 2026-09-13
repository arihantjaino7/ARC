# Decisions

The non-obvious calls made while building ARC, and the reasoning behind each. See
[ARCHITECTURE.md](./ARCHITECTURE.md) for how the pieces fit together.

### Security-definer helper functions instead of self-referencing RLS policies

**Decision:** `is_challenge_participant()`, `is_community_admin()`, and
`is_community_member()` are `security definer` functions, used inside RLS policies
instead of writing the membership check as a subquery directly on the table it's
protecting.

**Why:** A policy on `challenge_participants` that queries `challenge_participants` to
decide whether the current row is visible is a self-referencing RLS check — Postgres
evaluates the policy for every row the subquery itself touches, which is both a correctness
trap (easy to write a policy that quietly excludes rows it should include) and a
recursion risk. A `security definer` function runs with RLS bypassed internally, does the
one specific check it exists for, and returns a boolean the outer policy can trust.

**Tradeoff:** Every use of these functions is a deliberate, narrow exception to "RLS
decides everything," so each one needs its own read to make sure it isn't leaking more
than the boolean it returns.

---

### Rules are close-and-replace, never edited in place

**Decision:** `challenge_rules` rows are immutable except for `effective_to`. Changing a
rule means closing the old row and inserting a replacement that starts the **next** day.

**Why:** If a rule could be edited in place, a participant who saw they were losing could
lower their own target retroactively and improve a score that already happened. Anti-cheat
rule #1: nobody can see a bad score and fix it after the fact, including through the
admin-edit and change-request paths added later.

**Tradeoff:** Every rule change leaves a permanent row behind, and any code that reads
"the rules" has to filter for `effective_to is null` (or explicitly want history) rather
than assuming one row per rule.

---

### Unlogged and a real zero score differently

**Decision:** An emptied or never-logged numeric metric is deleted from `log_entries`,
not stored as `0`.

**Why:** For an `at_most` goal (e.g. "under 1800 calories"), a bare `0` reads as "well
under the ceiling" and would score 100% for a day nobody logged anything at all — the
false-100 trap. Treating "unlogged" as absent and scoring it 0 (via `scoreDay`'s explicit
handling) closes that hole for every goal shape at once.

**Tradeoff:** Every read path has to treat a missing key as "unlogged," not "zero," which
has to be remembered at each new call site.

---

### Fixed gym days are excluded from the denominator, not scored zero

**Decision:** A `fixed_days` gym schedule (e.g. Mon/Wed/Fri only) removes non-scheduled
days from the scoring window entirely, rather than scoring them as a miss.

**Why:** Scoring a rest day as 0 caps every real score around 57% for a 3-day/week
schedule regardless of actual consistency — the math would punish the very schedule the
user chose. Grace days and days before a rule's `effective_from` get the identical
treatment for the same reason.

**Tradeoff:** The rollup needs the gym schedule threaded through every scoring call, and
a bug here is easy to miss because it only shows up as a suspiciously-capped score, not a
crash.

---

### Timezone-aware day boundaries instead of `toISOString().slice(0, 10)`

**Decision:** "Today" is computed per-user from their stored IANA timezone
(`src/lib/time/day.ts`), not from `new Date().toISOString().slice(0, 10)`.

**Why:** The same instant is two different calendar days for two users in different
timezones. A UTC-sliced date silently gets this wrong near midnight — the exact bug this
app shipped once (an earlier iteration used `logs` with UTC-based "today") and fixed by
switching every day-boundary computation to a per-user local date.

**Tradeoff:** Every day-lock, log, and scoring computation needs a timezone in hand, and
a user who never sets theirs defaults to UTC.

---

### Week anchoring is derived from `start_date`, not stored

**Decision:** A weekly rule's week boundaries are computed from the challenge's
`start_date` at read time, not stored as a separate `week_anchor` column.

**Why:** It's fully derivable from data that already exists. Storing it separately would
be a second source of truth that could drift from `start_date` if either were ever
updated independently.

**Tradeoff:** Every rollup call recomputes the anchor instead of reading a column —
negligible cost for the data volumes here, but it means the anchoring logic has to be
correct in one shared function rather than checkable by inspecting a stored value.

---

### Community size is capped at 20 members

**Decision:** `join_community` and `respond_to_join_request` reject a join once a
community has 20 accepted members.

**Why:** `community_leaderboard` returns each member's full per-metric history for the
scoring window — reasonable for a handful of people, wasteful and slow for a large group.
Rather than windowing the response or precomputing scores server-side, the simplest fix
for a personal-scale app is capping group size.

**Tradeoff:** This app doesn't scale to large groups by design. Supporting more members
would need the leaderboard RPC rebuilt around precomputed or paginated scores.

---

### Buddy verification is restricted to `kind='buddy'` challenges

**Decision:** The `verifications` insert policy only lets someone flag an entry belonging
to a fellow *buddy*-challenge participant, not a fellow community member.

**Why:** The original policy let anyone sharing any `challenge_participants` row flag any
other participant's entry — harmless for a two-person buddy challenge, but the moment
community challenges existed, that same join meant every member of a group could flag
every other member's entries, and a flagged entry scores 0 until resolved. Buddy
verification is a two-person trust mechanic by design; a community has no single "other
side" to vouch for you.

**Tradeoff:** Communities have no peer-moderation mechanism at all right now — only an
admin editing rules, nothing for flagging suspicious entries.

---

### No database transaction wraps challenge creation

**Decision:** `createChallenge()` inserts a challenge, participant rows, rule rows,
per-participant targets, and an invite as a sequence of separate calls, not inside a
single transaction.

**Why:** The Supabase JS client doesn't expose a multi-statement transaction for plain
table inserts (only single RPC calls run atomically). Wrapping this properly would mean
moving challenge creation into its own `security definer` RPC.

**Tradeoff:** A failure partway through the sequence can leave a partial draft challenge
behind with no automatic cleanup. Accepted here as a low-blast-radius risk — a partial
draft is inert and never reaches other users — rather than justifying the RPC rewrite.

---

### The `SET ROLE` limitation on plain-RLS verification

**Decision:** Plain row-level-security policies (not wrapped in a `security definer`
function) are documented and reviewed by inspection rather than exercised end-to-end as a
genuinely non-bypassing role in this project's own verification scripts.

**Why:** The scripted verification harness (`scripts/run-sql.mjs` / `verify.mjs`) runs
through a `security definer` helper function itself, and Postgres refuses `SET ROLE`
inside a security-definer function — a real Postgres restriction, not a workaround-able
bug. Every `security definer` RPC (which is most of the write surface that matters —
accepting invites, proposing changes, reading scoreboards) was fully exercisable, since
those read `auth.uid()` from the JWT claims regardless of the calling role. What couldn't
be exercised this way were the plain-RLS insert policies on tables like
`challenge_grace_days`, `community_members`, and `challenge_stakes`.

**Tradeoff:** Those specific policies are correct by inspection and cross-checked against
the intended logic, not proven by a live, non-bypassing test run. Recorded here rather
than glossed over, because an honest gap is more useful than a false "fully tested" claim.

---

### A generic metrics/log_entries model instead of fixed logging columns

**Decision:** Logging is built around a `metrics` catalog and a generic `log_entries`
table (one row per user/day/metric), rather than a fixed set of columns on a `logs`
table.

**Why:** The fixed-column version couldn't add a new trackable thing without a schema
migration, and every goal/rule/challenge needed to be rewired to it individually. The
generic model means adding "steps" or a private custom metric is a catalog row, and
every goal, challenge rule, and scoring function already knows how to consume it.

**Tradeoff:** Paid for with a one-time migration off the old fixed-column table and an
extra join (`metrics`) on every read that needs a unit or label.

---

### Invite tokens use two concatenated `gen_random_uuid()`s, not pgcrypto

**Decision:** Challenge and community invite tokens are built from two concatenated
`gen_random_uuid()` calls (64 hex characters) instead of pgcrypto's
`gen_random_bytes()`.

**Why:** `gen_random_bytes()` failed under the migration-runner RPC's restricted
`search_path`, where pgcrypto wasn't resolving. `gen_random_uuid()` is core Postgres
(13+) and needs no extension, with plenty of entropy for an invite link.

**Tradeoff:** None of real consequence — the resulting token is longer than strictly
necessary, which only helps.

---

### Blind mode defaults differently for buddy challenges and communities

**Decision:** A new buddy challenge defaults to blind mode on; a new community defaults
it off.

**Why:** A buddy challenge is a head-to-head bet — seeing your opponent's running total
mid-week invites sandbagging or copying. A community's whole point is the leaderboard;
hiding it by default would undercut the feature. Both still honor the same withholding
rule when the toggle is flipped, so the mechanism isn't different, just the default.

**Tradeoff:** A community admin who wants buddy-style privacy has to know to turn it on;
it isn't discoverable from the leaderboard screen itself.

## Known limitations

Not hidden, not planned to be fixed before anyone reasonable would call this "done" for a
personal project:

- **No per-participant gym schedules.** `challenge_rule_targets` has no schedule column,
  only `target`/`min`/`max`, so a gym rule with `scope='own'` (e.g. a 6-day split vs. a
  3-day full-body routine) isn't representable — gym-schedule rules are locked to one
  shared schedule for both/all participants.
- **No proof photos, no device/wearable sync.** Logging is manual entry only; the
  `requires_proof` flag exists on rules but nothing currently enforces or collects a
  photo.
- **Community `scope='own'` rules can't be edited mid-challenge.** An admin can add,
  edit, or remove a `scope='shared'` rule after a community challenge starts
  (`admin_edit_community_rule`), but a `scope='own'` rule has no re-collection flow for
  every existing member's new personal number, so editing one is not supported once the
  challenge is live.
