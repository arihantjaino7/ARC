# Architecture

How ARC is put together: the data model, the trust boundary between Postgres and
TypeScript, the scoring math, and the anti-cheat layers that make the scoring trustworthy
enough for two people to bet on.

## Data model

Postgres (Supabase), all tables under `public.` with row-level security enabled. Schema
files live in `supabase/*.sql`, applied in numeric order (see the README for how).

| Table | Holds |
|---|---|
| `profiles` | Body stats, activity level, aim (cut/bulk/maintain), computed nutrition/sleep targets, timezone, display name. One row per user. |
| `metrics` | The catalog of things that can be logged — built-ins (calories, protein, water, sleep, steps, weight, gym done, workout minutes) plus private custom metrics per user, each with a unit, value type, default shape, and a plausibility ceiling. |
| `log_entries` | One row per (user, day, metric) — the actual logged numbers/booleans. Generic by design: adding a new trackable thing is a `metrics` row, not a schema migration. |
| `log_edits` | Append-only history of edits to `log_entries`. No update/delete policy exists on this table, so a day's edit history can't be rewritten. |
| `goals` | A user's personal targets (shape, target/min/max, weight, which metric it scores against). |
| `challenges` | A buddy (`kind='buddy'`) or community (`kind='community'`) competition — name, dates, status, stake text, settings (e.g. blind mode). |
| `challenge_rules` | The scoring rules attached to a challenge: shape, target/min/max, weight, scope (`shared` or `own`), period (`daily`/`weekly`), gym schedule, and an `effective_from`/`effective_to` window. |
| `challenge_rule_targets` | Per-participant numbers for `scope='own'` rules — lets two people with different personal goals (a cutter and a bulker) compete on the same rule. |
| `challenge_participants` | Who's in a challenge, their role, and their status (invited/accepted/left). |
| `challenge_invites` | Token-based invite links for joining a buddy or community challenge. |
| `challenge_change_requests` | Proposed mid-challenge rule changes (add/edit/remove) awaiting the other participant's approval. |
| `challenge_grace_days` | One excused day per 30-day period per challenge, self-declared before the day ends. |
| `challenge_stakes` | The winner/loser (or tie) of a finished challenge and each side's settlement state. |
| `verifications` | A buddy's confirm/dispute on another participant's log entry, within a 48-hour window. |
| `communities` | A group challenge container — visibility (public/private), admin, and a pointer at its template `challenges` row. |
| `community_members` | Membership, role (admin/member), and status (member/requested/removed). |
| `community_invites` | Reusable, admin-revocable invite links for joining a community. |
| `friend_requests` | Buddy relationships, matched by email; doubles as the "friendship" record once accepted. |
| `notifications` | A generic per-user inbox for challenge and community events (change proposals, join requests, approvals). |

## The trust boundary: Postgres vs. TypeScript

Every client talks to Supabase with its own session and its own anon key. A server action
running in Next.js is not a trusted intermediary — anyone can skip it and call the same
Supabase REST/RPC endpoints directly with their own key. So the rule this app follows is:

**Anything that must not be gameable lives in Postgres, enforced by RLS, triggers, and
security-definer functions — independent of which client asks. Anything that's just
arithmetic over data the caller is already allowed to read lives in TypeScript.**

Concretely:

- **In Postgres:** the day-lock and edit-window trigger on `log_entries`, the rule
  immutability trigger on `challenge_rules`, row-level security on every table, and a
  small set of `security definer` RPCs for operations that need a controlled cross-user
  read or write RLS can't express safely on its own (accepting an invite, proposing a
  rule change, reading a scoreboard that includes someone else's data).
- **In TypeScript:** all scoring — `scoreGoal`, `calculateDayScore`, `scoreDay`,
  `rollupRule`, `rollupChallenge`, `dailyScores`, `groupAggregate`,
  `findSuspiciousStreaks` (`src/lib/scoring/`, `src/lib/challenges/rollup.ts`). This code
  only ever runs over data already fetched under RLS, so there's no security reason to
  duplicate it in PL/pgSQL — doing so would just be a second, harder-to-test
  implementation to keep in sync with the first. Every scoring function is pure (no DB,
  no React) and unit-tested directly.

`security definer` functions are the one deliberate exception to "RLS decides
everything," used narrowly: `is_challenge_participant` / `is_community_admin` /
`is_community_member` sidestep the classic self-referencing-RLS trap (see
[DECISIONS.md](./DECISIONS.md)); `challenge_scoreboard` / `community_leaderboard` are the
only paths that read another participant's logged values, and only return derived
scores/badge counts, never raw rows.

## The scoring model

Defined in `src/lib/scoring/engine.ts` and extended by `src/lib/challenges/rollup.ts`.
Every goal shape resolves to a score from 0-100:

- **`at_least`** (hit at least this number): `score = actual / target`, capped at 100 —
  overshooting earns nothing extra.
- **`at_most`** (stay under this number): scored as the *inverse* ratio,
  `target / actual`, so hitting the ceiling exactly is 100% and going under it is still
  100%. This mirrors `at_least` instead of needing a separate penalty curve.
- **`range`**: `at_least` below the window, `at_most` above it, 100 inside it.
- **`boolean`**: did you or didn't you, no target.

A day's goals combine via a **weighted average** (`calculateDayScore`), so a "sleep"
weight-1 rule doesn't count as much as a "calories" weight-2 rule.

Two goals with completely different targets — a cutter's 1800-calorie ceiling and a
bulker's 3200-calorie floor — both score 100 when each hits their own number. This
percentage-of-your-own-target model is what lets two people with different bodies and
different goals compete fairly on the same challenge.

Rollups (`rollupRule`) branch on **period**:
- **`daily`** rules score every day in range through `scoreGoal`.
- **`weekly`** rules (e.g. "gym 4x/week, whichever days you like") group days into weeks
  anchored to the challenge's own start date — not the ISO Monday — and score
  `min(sessions done / sessions required, 1)` per week, averaged.

**Rest-day exclusion**: a `fixed_days` gym schedule (e.g. "Mon/Wed/Fri only") excludes
non-scheduled days from the denominator entirely rather than scoring them 0 — scoring a
rest day as a miss caps every score around 57% regardless of actual consistency. Graced
days (`challenge_grace_days`) and days before a rule's `effective_from` get the same
treatment.

**Unlogged vs. real zero**: an empty/never-logged numeric field is deleted from
`log_entries`, not stored as `0`. This matters specifically for `at_most` goals, where a
bare `0` reads as "under the ceiling" and would otherwise silently score 100 for a day
that was never logged at all.

## Anti-cheat layers

Numbered in the order they were built; each lives at the layer noted.

1. **Rule immutability** (Postgres trigger) — `challenge_rule_immutable_guard()` rejects
   any update to a live `challenge_rules` row except closing it (`effective_to`). An
   "edit" is always close-and-replace, and a replacement always starts **tomorrow**
   (`effective_from = current_date + 1`), never today — so nobody can see a bad score and
   retroactively fix their target.
2. **Day lock and edit window** (Postgres trigger) — `log_entry_guard()` on
   `log_entries`: server clock only (no client-supplied timestamps), no logging future
   days, and only today and yesterday-until-10:00 are editable. Entries written after
   their day closed are stamped `is_late`.
3. **Plausibility flags** (Postgres) — each metric carries a `max_plausible` bound; an
   entry over it is flagged `implausible` rather than rejected outright.
4. **Suspicious-streak detection** (TypeScript) — `findSuspiciousStreaks` flags a numeric
   metric held at the exact same value for 14+ consecutive days. Deliberately
   TypeScript, not SQL, since it's read-side analysis over data already fetched under RLS.
5. **Buddy verification** (Postgres RLS + trigger) — a buddy can confirm or dispute the
   other side's entry within 48 hours of `logged_at`. A disputed entry is excluded from
   scoring (worth 0) until resolved. Restricted to `kind='buddy'` challenges only — a
   50-person community has no single "other side" to vouch for you, and a broad policy
   would let any member flag any other member's entries.
6. **Append-only audit trail** (Postgres) — `log_edits` has a select policy and
   deliberately no update/delete policy. `edit_count` only increments on a real value
   change.
7. **Blind mode** (Postgres RPC boundary) — see below.
8. **Trust score** — a rolling count of consecutive verified-clean days, computed
   server-side and shown on the buddy comparison screen.

### Blind mode: what the scoreboard will and won't return

`challenge_scoreboard` and `community_leaderboard` are `security definer` functions —
the only code paths that read another participant's `log_entries`. They return each
rule's resolved window/targets and each participant's logged **values** by date, plus
aggregate badge counts (late/edited/flagged/disputed/suspicious) and a trust score.
They never return raw `log_entries` rows — no id, source, `logged_at`, per-entry
`is_late`/`edit_count`/`implausible`. That metadata about another participant never
leaves the database.

When a challenge has blind mode on, the caller's own values are always returned in full.
The **other** participant's value for the caller's current day — in the caller's own
timezone — is withheld entirely (absent from the response, not zeroed) until the caller
has logged at least one of the challenge's tracked metrics for that same day. This is a
day-level rule, not per-metric: logging anything the challenge tracks unlocks the
buddy's whole day, not just that one field. Community leaderboards default blind mode
**off** ("the leaderboard is the point") but honor the same withholding rule if an admin
turns it on.

## Related docs

- [DECISIONS.md](./DECISIONS.md) — the non-obvious calls behind the above, and why.
- [README.md](../README.md) — setup, stack, and known limitations.
