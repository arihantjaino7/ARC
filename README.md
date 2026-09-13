# Gym-Shym

Two people compete on fitness goals scored as a **percentage of their own target**, not
raw numbers — so a cutter on a calorie ceiling and a bulker on a calorie floor can
genuinely compete against each other, each scored against a number that's fair for them.

<!-- TODO: replace with a real demo GIF once one is recorded -->
![demo](docs/demo.gif)

## Stack

Next.js 16 (App Router) · TypeScript · Tailwind CSS v4 · Supabase (Postgres + Row-Level
Security + Auth) · Vitest · Cloudflare Workers via the OpenNext adapter

## Why this is harder than it looks

- **Anti-cheat lives in the database, not the client.** Day locks, rule immutability,
  and row-level security are enforced by Postgres triggers and policies, because any
  client can call Supabase directly with its own key and skip a server action entirely.
- **An append-only audit trail.** Every edit to a logged day is recorded in a table with
  no update or delete policy — history can't be quietly rewritten.
- **Immutable rule versioning.** Changing a challenge's rule never edits it in place; it
  closes the old rule and inserts a replacement that starts the next day, so nobody can
  see a losing score and retroactively lower their target.
- **Timezone-correct day locking.** "Today" is computed from each user's own IANA
  timezone, not a UTC string slice — the same instant is a different calendar day for
  two people in different timezones.
- **Blind mode.** A buddy's score for *today* is hidden until you've logged your own day,
  enforced by what a database function returns, not by UI hiding.
- **Fair scoring across different goals.** The scoring engine is percentage-of-your-own-
  target, capped at 100, so target size never advantages either side — proven directly in
  the test suite with a 10-unit target and a 10,000-unit target scoring identically at
  the same percentage.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for how it's built and
[docs/DECISIONS.md](docs/DECISIONS.md) for the reasoning behind the non-obvious calls.

## Local setup

**Prerequisites:** Node 20+, a Supabase project (free tier is enough).

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy `.env.local.example` to `.env.local` and fill in your Supabase project's URL and
   anon key. `SUPABASE_SERVICE_ROLE_KEY` is optional — only needed for the migration
   scripts below — and must never be exposed client-side or committed.

3. Apply the database schema. There's no Supabase CLI/migrations set up for this project;
   every schema file under `supabase/` is applied by hand, in numeric order:

   ```bash
   node scripts/run-sql.mjs supabase/schema.sql
   node scripts/run-sql.mjs supabase/step5_targets.sql
   # ...continue through the numbered step*.sql files in order
   ```

   (Requires `SUPABASE_SERVICE_ROLE_KEY` in `.env.local`. Without it, paste each file's
   contents into the Supabase dashboard's SQL Editor instead, in the same order.)

4. Run the dev server:

   ```bash
   npm run dev
   ```

See [docs/DEPLOY.md](docs/DEPLOY.md) for deploying to Cloudflare Workers.

## Project structure

```
src/
  app/
    (app)/            # the five-tab authenticated shell: Buddies, Community, Home, Progress, Settings
    join/[token]/      community/join/[token]/   # public invite-acceptance routes
    login/ signup/ welcome/ forgot-password/      # signed-out flows
  components/          # Screen/Card/EmptyState shell + the ui/ primitive library (Surface, Bar, Ring, Sheet, ...)
  lib/
    scoring/           # pure scoring engine (scoreGoal, calculateDayScore, scoreDay) — no DB, no React
    challenges/        # rollup math (rollupChallenge, dailyScores, groupAggregate) + challenge/change-request actions
    communities/        # community creation, discovery, join, leaderboard actions
    logs/ goals/ metrics/ profile/ friends/ notifications/  # feature-scoped types + server actions
    time/              # timezone-aware day-boundary math
    supabase/          # browser/server Supabase clients + session refresh
supabase/              # numbered SQL migrations, applied in order (see Local setup)
scripts/               # run-sql.mjs (apply a migration), verify.mjs (read-only checks), dev tooling
```

## Testing

56 tests (`vitest`), all pure-logic unit tests — no database or network involved:

- `src/lib/scoring/engine.test.ts` — every goal shape's scoring rules, including the
  fairness proof (different targets score identically at the same percentage).
- `src/lib/scoring/scoreDay.test.ts` — wiring goals to a logged day, including the
  unlogged-vs-zero distinction.
- `src/lib/challenges/rollup.test.ts` — weekly/daily period scoring, rest-day exclusion,
  grace-day exclusion, suspicious-streak detection, group aggregation.
- `src/lib/time/day.test.ts` — timezone-aware day boundaries and edit windows.

```bash
npm test
```

## Known limitations

- No per-participant gym schedules — a challenge's gym rule uses one shared schedule for
  every participant.
- No proof photos or device/wearable sync; logging is manual entry only.
- A community's `scope='own'` rules (each member sets their own number) can't be edited
  once the challenge is live.
- See [docs/DECISIONS.md](docs/DECISIONS.md#known-limitations) for more, including a
  documented gap in how thoroughly plain row-level-security policies could be
  verification-tested.

This is a working, deployed personal project, not a finished product — see the
limitations above and the decisions doc for what's deliberately out of scope.
