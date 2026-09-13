# Gym-Shym

A fitness competition app where two people compete on percentage of their own goal,
rather than raw numbers — so a cutter on a calorie ceiling and a bulker on a calorie
floor can compete fairly, each scored against a target that fits them.

<!-- TODO: replace with a real demo GIF once one is recorded -->
![demo](docs/demo.gif)

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router), TypeScript |
| Styling | Tailwind CSS v4 |
| Backend | Supabase (Postgres, Row-Level Security, Auth) |
| Testing | Vitest |
| Deployment | Cloudflare Workers, via the OpenNext adapter |

## Engineering Highlights

- **Anti-cheat enforced in the database, not the client.** Day locks, rule immutability,
  and access control are implemented as Postgres triggers and row-level security
  policies, since any client can call Supabase directly with its own key and bypass a
  server action entirely.
- **Append-only audit trail.** Edits to a logged day are recorded in a table with no
  update or delete policy, so history cannot be rewritten.
- **Immutable rule versioning.** Changing a challenge's rule never edits it in place. The
  old rule is closed and a replacement is inserted that takes effect the next day, so a
  losing score can never be fixed retroactively.
- **Timezone-correct day boundaries.** "Today" is computed from each user's own IANA
  timezone rather than a UTC string slice, so the same instant resolves to different
  calendar days for users in different timezones.
- **Blind mode.** A competitor's score for the current day is withheld until the viewer
  has logged their own day, enforced at the database layer rather than in the UI.
- **Fairness-tested scoring.** The engine scores as a percentage of each participant's
  own target, capped at 100, so target size never advantages either side. Verified in the
  test suite with a 10-unit target and a 10,000-unit target scoring identically.

Further reading: [Architecture](docs/ARCHITECTURE.md) documents how the system is built;
[Decisions](docs/DECISIONS.md) documents the reasoning behind the non-obvious choices.

## Getting Started

### Prerequisites

- Node.js 20+
- A Supabase project (the free tier is sufficient)

### Installation

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy `.env.local.example` to `.env.local` and fill in your Supabase project URL and
   anon key. `SUPABASE_SERVICE_ROLE_KEY` is optional and only required for the migration
   scripts below; it must never be exposed client-side or committed.

3. Apply the database schema. This project has no Supabase CLI migrations set up; each
   file under `supabase/` is applied by hand, in numeric order:

   ```bash
   node scripts/run-sql.mjs supabase/schema.sql
   node scripts/run-sql.mjs supabase/step5_targets.sql
   # continue through the remaining numbered step*.sql files, in order
   ```

   This requires `SUPABASE_SERVICE_ROLE_KEY` in `.env.local`. Without it, paste each
   file's contents into the Supabase dashboard's SQL Editor instead, in the same order.

4. Start the development server:

   ```bash
   npm run dev
   ```

For deployment to Cloudflare Workers, see [docs/DEPLOY.md](docs/DEPLOY.md).

## Project Structure

```
src/
  app/
    (app)/                 # Authenticated shell — Buddies, Community, Home, Progress, Settings
    join/[token]/
    community/join/[token]/  # Public invite-acceptance routes
    login/ signup/ welcome/ forgot-password/  # Signed-out flows
  components/              # Screen/Card/EmptyState shell and the shared ui/ primitive library
  lib/
    scoring/               # Pure scoring engine — no database, no React
    challenges/            # Rollup math and challenge/change-request actions
    communities/           # Community creation, discovery, join, and leaderboard actions
    logs/ goals/ metrics/ profile/ friends/ notifications/  # Feature-scoped types and server actions
    time/                  # Timezone-aware day-boundary math
    supabase/              # Browser/server Supabase clients and session refresh
supabase/                  # Numbered SQL migrations, applied in order
scripts/                   # Migration runner, verification, and dev tooling
```

## Testing

56 unit tests (Vitest), covering pure scoring and time logic only — no database or
network dependency:

| File | Covers |
|---|---|
| `src/lib/scoring/engine.test.ts` | Every goal shape's scoring rules, including the fairness proof across different target sizes |
| `src/lib/scoring/scoreDay.test.ts` | Wiring goals to a logged day, including the unlogged-vs-zero distinction |
| `src/lib/challenges/rollup.test.ts` | Weekly/daily period scoring, rest-day exclusion, grace-day exclusion, suspicious-streak detection, group aggregation |
| `src/lib/time/day.test.ts` | Timezone-aware day boundaries and edit windows |

```bash
npm test
```

## Known Limitations

- Gym schedules are shared across a challenge; per-participant schedules are not
  supported.
- Logging is manual entry only — no proof photos or device/wearable sync.
- A community's `scope='own'` rules, where each member sets their own number, cannot be
  edited once the challenge is live.

See [docs/DECISIONS.md](docs/DECISIONS.md#known-limitations) for the complete list,
including a documented gap in row-level-security verification coverage.

## Documentation

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — data model, trust boundary, scoring
  model, and anti-cheat layers
- [docs/DECISIONS.md](docs/DECISIONS.md) — key design decisions and their tradeoffs
- [docs/DEPLOY.md](docs/DEPLOY.md) — Cloudflare Workers deployment guide
