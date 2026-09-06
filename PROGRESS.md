# Gym-Shym — Progress

**If you're a fresh Claude Code chat picking this up:** read this file first, then read the
full plan at `C:\Users\Ariha\.claude\plans\give-me-a-text-cuddly-galaxy.md` for the full
20-step build plan and the reasoning behind the scoring design. The user will say something
like "continue Gym-Shym from step N" — start exactly at that step, don't redo earlier ones.

## What this app is

Two gym friends compete weekly, scored not on raw numbers but on how much of *their own*
goal each hit (0-100%, capped at 100 so overshooting earns nothing extra). Loser buys a
treat. See the plan file for full feature list and the fairness reasoning.

## Current status: Step 10 built, needs the SQL run + a real end-to-end check

- Next.js 16 (App Router) + TypeScript + Tailwind CSS v4 scaffolded via `create-next-app`
  (had to scaffold into a temp subfolder and move up, because the parent folder name
  "Gym-Shym" has capital letters, which npm package names disallow — not an issue going
  forward, just a one-time quirk).
- Dev server confirmed working at `http://localhost:3000`.
- Homepage (`src/app/page.tsx`) replaced with a simple placeholder showing the app name
  and one-line pitch — proof the scaffold works, nothing functional yet.
- Page title/description set in `src/app/layout.tsx`.
- Git repo initialized by `create-next-app` (not yet configured with a remote — local only).
- Supabase project created (free tier). Connected via `@supabase/supabase-js` +
  `@supabase/ssr`:
  - `src/lib/supabase/client.ts` — browser client
  - `src/lib/supabase/server.ts` — server client (Server Components/Actions, uses `cookies()`)
  - `src/lib/supabase/proxy.ts` + `src/proxy.ts` — refreshes the auth session cookie on every
    request. Named `proxy.ts`, not `middleware.ts` — Next.js 16 deprecated and renamed the
    convention (see `node_modules/next/dist/docs/.../proxy.md`).
  - `src/app/api/db-check/route.ts` — health-check route, hits Supabase's
    `/auth/v1/health` endpoint (the `/rest/v1/` root now requires the `service_role` key on
    new projects, so don't use that one for a plain connectivity check).
  - `.env.local` holds `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`
    (gitignored, not committed). `.env.local.example` documents the two required keys.
  - Verified live: `curl http://localhost:3000/api/db-check` → `{"connected":true,"status":200}`.

- **Step 3 — Login and signup** built:
  - `src/lib/auth/actions.ts` — `'use server'` actions `login`, `signup`, `logout` using the
    Supabase clients from Step 2. Use `useActionState`-style `(prevState, formData) => AuthState`
    signatures. `signup` handles the "email confirmation required" case (no session returned)
    by showing a message instead of assuming an immediate login.
  - `src/app/login/page.tsx` and `src/app/signup/page.tsx` — client components with forms wired
    to those actions via `useActionState`, showing inline errors/messages and a pending state.
  - `src/app/dashboard/page.tsx` — a minimal protected page (proves route protection): reads
    the current user server-side, bounces to `/login` if there isn't one, shows the user's email
    and a logout button (form posting to the `logout` action).
  - `src/lib/supabase/proxy.ts` — `updateSession` now also returns the current `user` (not just
    the refreshed `response`), so the top-level proxy can make redirect decisions.
  - `src/proxy.ts` — redirects unauthenticated requests to `/dashboard` (protected) to `/login`,
    and redirects already-authenticated requests to `/login` or `/signup` (auth routes) to
    `/dashboard`.
  - `src/app/page.tsx` — homepage now checks auth server-side and shows "Log in / Sign up" or a
    "Go to dashboard" link accordingly.
  - Verified live in the browser: signup with an invalid email shows Supabase's inline error;
    signup with a real-looking address succeeds and shows the "check your email to confirm"
    message (the Supabase project has email confirmation ON, so a session isn't created until
    the user clicks the email link); visiting `/dashboard` while logged out redirects to
    `/login`; logging in with a wrong password shows "Invalid login credentials" inline.
  - `.claude/launch.json` gained `"autoPort": true` on the `gym-shym-dev` config, since another
    session had the dev server open on 3000 already — harmless going forward, just lets a
    second preview pick a free port instead of failing.

- **Step 4 — Your profile** built:
  - There's no Supabase CLI/migrations set up for this project (only the anon key lives in
    `.env.local` — no DB password or service-role key), so schema changes can't be applied by
    a tool call. `supabase/schema.sql` holds the SQL for the new table; **you need to run it
    once**: Supabase dashboard → SQL Editor → paste the contents of `supabase/schema.sql` → Run.
    It creates `public.profiles` (`id` references `auth.users`, `age`, `height_cm`, `weight_kg`,
    `activity_level` — sedentary/light/moderate/active/very_active, `aim` — cut/bulk/maintain,
    `updated_at`) with row-level security so each user can only read/write their own row.
  - `src/lib/profile/actions.ts` — `getProfile` (reads the current user's row, `null` if none
    yet) and `saveProfile` (a `'use server'` action, same `useActionState` shape as the auth
    actions) which validates ranges server-side and upserts by `id`.
  - `src/app/profile/page.tsx` + `src/app/profile/ProfileForm.tsx` — server page fetches the
    existing profile (or `null`) and passes it to a client form pre-filled with `defaultValue`s;
    dropdowns for activity level and aim, number inputs for age/height/weight.
  - `/profile` added to `PROTECTED_ROUTES` in `src/proxy.ts` — same bounce-to-`/login` behavior
    as `/dashboard`. Verified: an unauthenticated request to `/profile` redirects to `/login`,
    same as it already did for `/dashboard` in Step 3.
  - Dashboard now links to `/profile`.
  - Verified: `npx tsc --noEmit` and `npx eslint` both clean, dev server compiles with no errors.
    **Not yet verified end-to-end with a real logged-in user** — that needs the SQL above run
    first, then log in and fill the form yourself (or ask me to once the table exists).

- **Step 5 — The recommendation calculator** built:
  - Decided the columns-vs-table question from Step 4: added four nullable target columns
    (`target_calories`, `target_protein_g`, `target_water_ml`, `target_sleep_hours`) directly on
    `public.profiles`, plus a `sex` column (needed for the BMR formula — the profile schema
    didn't have one). `supabase/step5_targets.sql` holds the `ALTER TABLE`; **you need to run it
    once** the same way as `schema.sql` in Step 4 (Supabase dashboard → SQL Editor → paste → Run).
    Existing rows are unaffected since the new columns are nullable.
  - `src/lib/profile/recommendations.ts` — pure function `calculateRecommendations` (no DB, no
    React). Mifflin-St Jeor BMR × an activity multiplier for TDEE, then a percentage adjustment
    for the aim (cut -20%, bulk +15%, maintain unchanged) — percentage rather than a flat
    calorie offset so it scales fairly across very different body sizes, matching this app's
    whole "score on your own target" philosophy. Protein scales with bodyweight and aim (higher
    on a cut, to protect muscle in a deficit). Water is 35ml/kg plus an activity bonus. Sleep is
    8h, nudged to 8.5/9 for active/very_active.
  - **Found and fixed a latent bug from Step 3/4**: `src/lib/profile/actions.ts` has
    `"use server"` at the top, and Next.js requires every export from such a file to be an async
    function — a client component importing a plain constant from it (like `ACTIVITY_LEVELS`)
    gets a silently broken value at runtime instead of a build error. `ProfileForm.tsx` had been
    doing exactly that since Step 3, just never surfaced because nobody had reached a logged-in
    `/profile` render yet. Fixed by moving the shared enums/types (`ACTIVITY_LEVELS`, `AIMS`,
    `SEXES`, `ActivityLevel`, `Aim`, `Sex`, `Profile`) into a new plain module,
    `src/lib/profile/types.ts`, imported by both `actions.ts` and client components. `actions.ts`
    now only exports async functions (`getProfile`, `saveProfile`) and the `ProfileState` type
    (type-only exports are erased at compile time, so they're fine).
  - `ProfileForm.tsx` is now a controlled form: stats fields (age/height/weight/sex/activity/aim)
    are `useState`, and `useMemo` recomputes the suggestion live as you type. The four target
    inputs mirror the live suggestion until you edit one directly, at which point they become
    yours to keep (a "Use suggested" link resets back to auto-sync). Whatever's showing gets
    submitted and saved either way, so targets always persist as explicit numbers.
  - Verified live in the browser (via a temporary unauthenticated route, since a real login needs
    email confirmation this session couldn't complete — same limitation noted in Step 4): typed
    in age 25 / height 180cm / weight 80kg / male / moderate / cut and got exactly the hand-computed
    numbers (2240 kcal, 176g protein, 3300ml water, 8h sleep); editing the calorie field showed
    "Use suggested" and kept the typed value; clicking it snapped back to 2240. The temporary route
    was removed after verifying — not part of the app.
  - `npx tsc --noEmit` and `npx eslint src` both clean.
  - **Verified end-to-end by the user**: ran `step5_targets.sql` in the Supabase dashboard, then
    logged in and saved a real profile with targets — got the "Profile saved." message, confirming
    the new `sex`/target columns and the upsert both work against the live database.

- **Step 6 — The scoring engine** built:
  - Installed Vitest as the project's first test runner. Pinned to `^3` (not latest `^5`) because
    v5 requires `@types/node` `^22`/`>=24` as a peer, and this project is on `^20` to match
    Next.js's own types — v3 has no such conflict. `npm test` runs `vitest run`.
  - `src/lib/scoring/types.ts` — `Goal` is a discriminated union on `shape`: `at_least` /
    `at_most` (each with a `target`), `range` (`min`/`max`), and `boolean` (no target — it's a
    did-you-or-didn't-you). `ScoredGoal` (`{ score, weight }`) is the shape a day's already-scored
    goals take before being combined into a total.
  - `src/lib/scoring/engine.ts` — pure functions, no DB, no React, same style as Step 5's
    `recommendations.ts`:
    - `scoreGoal(goal, actual)` — overloaded so a `boolean` goal takes a `boolean` actual and
      every other shape takes a `number`. `at_least` scores `actual/target`; `at_most` scores the
      *inverse* ratio `target/actual` so hitting the ceiling exactly is 100% and going under it is
      still 100% (you didn't exceed it) — this mirrors `at_least` instead of needing a separate
      penalty curve. Both are clamped to `[0, 100]`, which is where the "no extra credit for
      overdoing it" rule actually lives. `range` is just `at_least` below the window and `at_most`
      above it, 100 inside it.
    - `calculateDayScore(goals)` — weighted average of a day's `ScoredGoal[]`, rounded; returns 0
      instead of dividing by zero when the list is empty or every weight is 0.
  - `src/lib/scoring/engine.test.ts` — 17 tests. Covers each shape's exact/under/over/inside/outside
    cases, `calculateDayScore`'s equal- and unequal-weight averaging and its zero-weight/empty-list
    guard, and **the fairness proof**: a cutter with an `at_most` calorie target of 1800 and a
    bulker with an `at_least` calorie target of 3200 both score exactly 100 when they hit their own
    number — proven again with a tiny target (10) vs a huge one (10000) to show target size doesn't
    matter, only how close you got to your own number.
  - Verified: `npx vitest run` → 17/17 passing. `npx tsc --noEmit` and `npx eslint src` both clean.
  - Nothing on screen for this step, as planned — it's pure logic that Steps 7-9 will wire up to
    real goals and real logged numbers.

- **Step 7 — Setting your goals** built:
  - `supabase/step7_goals.sql` holds the new `goals` table; **you need to run it once** the same
    way as Steps 4/5 (Supabase dashboard → SQL Editor → paste → Run). One row per goal: `name`,
    `shape` (the four from Step 6's `Goal` union), `target` (for `at_least`/`at_most`), `min`/`max`
    (for `range`), `weight` (1-5, what it's worth to that person), owned by `user_id` with RLS so
    everyone only sees/edits their own. A table-level `check` constraint enforces that a row only
    has the fields its own shape uses (e.g. a `range` row can't also have a `target`) — the DB
    enforces the same discipline the `Goal` discriminated union enforces in TypeScript.
  - `src/lib/goals/types.ts` — `SavedGoal`: the Step 6 `Goal` shapes plus `id`/`name`/`weight`.
    Deliberately a superset, so a `SavedGoal` can be passed straight into `scoreGoal` once Step 9
    wires logging up to scoring.
  - `src/lib/goals/actions.ts` — `getGoals` (current user's goals, oldest first), `createGoal`
    (`"use server"`, `useActionState` shape like `saveProfile`; validates the name, shape, weight,
    and whichever of target/min+max the chosen shape needs, before inserting), `deleteGoal(id)`
    (scoped to `user_id` so you can't delete someone else's row even by guessing an id). Same rule
    from Step 5 applied again: `GOAL_SHAPES`/`GoalShape` live in `types.ts`, not re-exported from
    this `"use server"` file.
  - `src/app/goals/page.tsx` + `GoalsForm.tsx` — server page fetches the user's goals and passes
    them to a client component: existing goals listed with a "Remove" button each (a per-row form
    bound to `deleteGoal` via `.bind(null, goal.id)`), then an "Add a goal" form below it. The
    shape `<select>` conditionally reveals a Target field (`at_least`/`at_most`), Min+Max fields
    (`range`), or nothing further (`boolean`) — plain `useState` on the selected shape, no library.
  - `/goals` added to `PROTECTED_ROUTES` in `src/proxy.ts`; dashboard now links to it alongside
    `/profile`.
  - Verified live in the browser: a temporary unauthenticated route (`src/app/temp-goals-preview/`
    — **not** `_temp_goals_preview`, since Next's App Router treats a leading-underscore folder as
    a private, non-routable folder and 404s it; removed after verifying, not part of the app) render
    four fake goals of each shape correctly, and selecting "range" in the Shape dropdown correctly
    swapped in the Min/Max inputs in place of the single Target input.
  - `npx tsc --noEmit`, `npx eslint src`, and `npx vitest run` (still 17/17 from Step 6) all clean.
  - **Not yet verified end-to-end with a real logged-in user** — same gap as Step 4: needs
    `step7_goals.sql` run in the Supabase dashboard first, then log in and add/remove real goals at
    `/goals` (or ask me to once the table exists).

- **Step 8 — Logging your day (by hand)** built:
  - `supabase/step8_logs.sql` holds the new `logs` table; **you need to run it once** the same way
    as Steps 4/5/7 (Supabase dashboard → SQL Editor → paste → Run). One row per user per calendar
    day (`user_id` + `log_date`, unique together) rather than per-goal — the same logged number can
    count toward more than one goal or challenge later. Columns mirror the four `target_*` fields
    on `profiles` with the `target_` prefix dropped (`calories`, `protein_g`, `water_ml`,
    `sleep_hours`, all nullable numerics) plus `gym_done` (boolean, defaults false). RLS scopes
    select/insert/update to the owning `user_id`, same pattern as `goals`.
  - `src/lib/logs/types.ts` — `DailyLog`, the plain type shared between the action and the form
    (same reason as `profile/types.ts` and `goals/types.ts`: a `"use server"` file can only export
    async functions).
  - `src/lib/logs/actions.ts` — `getTodayLog()` (today's row for the current user, `null` if none
    yet — "today" is computed server-side via `new Date().toISOString().slice(0, 10)`, UTC-based
    for now; no timezone handling or backdating yet, that's Step 19's midnight-lock territory) and
    `saveLog` (a `"use server"` action, same `useActionState` shape as the other features'
    actions) which validates each provided numeric field is non-negative, leaves unfilled ones
    `null`, and upserts on the `(user_id, log_date)` unique constraint — calling it again the same
    day overwrites that day's row instead of creating a second one.
  - `src/app/log/page.tsx` + `LogForm.tsx` — server page fetches today's log (or `null`) and passes
    it to a client form pre-filled with today's numbers if any exist. The four numeric fields are
    plain number inputs; `gym_done` is a tap-to-toggle button (green "Done ✓" / neutral "Not yet")
    backed by a hidden input, matching the plan's "tap-buttons" language for yes/no entries.
  - `/log` added to `PROTECTED_ROUTES` in `src/proxy.ts`; dashboard now links to it alongside
    `/profile` and `/goals`.
  - Verified live in the browser: a temporary unauthenticated route (`src/app/temp-log-preview/`,
    removed after verifying — same throwaway-route pattern as Steps 5 and 7) rendered the form
    pre-filled with fake numbers, the gym toggle switched from "Not yet" to green "Done ✓" on
    click, and submitting correctly hit the real `saveLog` action and surfaced its
    "You're not logged in" error inline (proving the wiring end-to-end short of an actual session).
  - `npx tsc --noEmit`, `npx eslint src`, and `npx vitest run` (still 17/17 from Step 6) all clean.
  - **Not yet verified end-to-end with a real logged-in user** — same gap as Steps 4 and 7: needs
    `step8_logs.sql` run in the Supabase dashboard first, then log in and save a real day at `/log`
    (or ask me to once the table exists).

- **Step 9 — See your score** built:
  - Answered the open question from before this step: added a `metric` column to `goals` —
    `supabase/step9_goal_metric.sql` holds the migration; **you need to run it once** the same
    way as Steps 4/5/7/8 (Supabase dashboard → SQL Editor → paste → Run). It backfills existing
    rows (`gym_done` for boolean-shaped goals, `calories` for everything else, so it's safe to run
    even if real goal rows already exist) then locks the column down with two check constraints:
    one restricting it to the five real log columns, one pairing `boolean` shape exclusively with
    `gym_done` (the only boolean log field) and every other shape with one of the four numeric
    fields.
  - `src/lib/goals/types.ts` — added `Metric`/`NumericMetric` types, `NUMERIC_METRICS`, and
    `METRIC_LABELS`; `SavedGoal` now carries `metric`, typed per-variant so a `boolean` goal's
    metric is always literally `"gym_done"` and every other shape's is a `NumericMetric` — the
    same DB-level pairing rule, enforced again in TypeScript.
  - `src/lib/goals/actions.ts` — `createGoal` sets `metric` to `"gym_done"` automatically for
    boolean goals, otherwise reads and validates it from the form against `NUMERIC_METRICS`;
    `getGoals`/`toSavedGoal` select and map the new column.
  - `src/app/goals/GoalsForm.tsx` — a new "Counts toward" dropdown (Calories/Protein/Water/Sleep)
    appears once any non-boolean shape is picked, sitting alongside the existing Target/Min/Max
    fields; hidden entirely for `boolean` since it only ever means `gym_done`. The saved-goals list
    now shows the metric name too (e.g. "At least 150 Protein").
  - `src/lib/scoring/scoreDay.ts` — new pure function (no DB, no React, same style as Step 6's
    `engine.ts`) that's the actual answer to "wire 6, 7 and 8 together": `scoreDay(goals, log)`
    looks up each goal's `metric` in the day's log, runs it through Step 6's `scoreGoal`, and
    combines the results with `calculateDayScore` into a per-goal breakdown plus a total. The one
    subtlety it handles that a naive wire-up wouldn't: an unlogged numeric metric scores 0, not
    whatever `scoreGoal` would compute from a bare `0` — matters specifically for `at_most` goals,
    where `actual <= 0` is treated as "under the ceiling" and would otherwise silently score 100
    for a day you never logged at all. A boolean goal with no log for the day reads as `gym_done:
    false` (a real "not done", not an unknown), matching how Step 8's own log defaults it.
  - `src/lib/scoring/scoreDay.test.ts` — 6 tests: scoring against the right log field, the
    unlogged-metric-scores-0 case explicitly (with the false-100 trap spelled out in a comment),
    an entirely missing day (`log === null`) scoring every goal 0, the boolean/gym_done default,
    an in-range goal, and a multi-goal weighted total.
  - `src/app/score/page.tsx` — new protected page: fetches the user's goals and today's log,
    calls `scoreDay`, and shows a big total-out-of-100 plus a per-goal list (name, logged value vs.
    its target, per-goal score). Prompts to add goals if there are none yet, and to log today if
    there's no log row yet. `/score` added to `PROTECTED_ROUTES` in `src/proxy.ts`; dashboard links
    to it alongside the other three feature pages (and its stale "Step 4 of 20" label — wrong since
    Step 5 — is now "Step 9 of 20").
  - Verified live in the browser: a temporary unauthenticated route rendered `scoreDay` against
    four fake goals (protein at_least 150 logged at 75, calories at_most 1800 logged at 1750,
    sleep range 7-9 logged at 8, gym boolean done) and produced exactly the hand-computed
    breakdown (scores 50/100/100/100, weighted total 80). A second temporary route rendered
    `GoalsForm` directly and confirmed the new "Counts toward" dropdown appears with the right
    four options when a numeric shape is picked and disappears entirely for `boolean`. Both
    temporary routes removed after verifying — same throwaway-route pattern as Steps 5/7/8.
  - `npx tsc --noEmit`, `npx eslint src`, and `npx vitest run` (23/23 — the 17 from Step 6 plus 6
    new) all clean.
  - **Not yet verified end-to-end with a real logged-in user** — same gap as Steps 4/7/8: needs
    `step9_goal_metric.sql` run in the Supabase dashboard first, then add a goal with a metric,
    log today's numbers, and check `/score` shows the right breakdown (or ask me to once the
    column exists).

## Fixes made after Step 9, before starting Step 10

- **Bug: `/login` redirect loop.** `src/proxy.ts`'s route matching used plain `pathname.startsWith(route)`,
  and `"/login".startsWith("/log")` is `true` in JS — `/log` (added as a protected route in Step 8) is a
  string prefix of `/login`, not just a path-segment prefix. So visiting `/login` while logged out matched
  the `/log` protected-route check, got redirected to `/login`, matched again, and looped forever — an
  infinite redirect the browser reports as a broken/non-working server. Fixed with a segment-aware
  `matchesRoute(pathname, route)` helper (`pathname === route || pathname.startsWith(route + "/")`) used
  for both `PROTECTED_ROUTES` and `AUTH_ROUTES` checks. Verified via `curl -D -` on every route
  (`/login`, `/signup`, `/goals`, `/log`, `/score`, `/dashboard`, `/profile`) showing the right status
  and, where relevant, the right `Location` header.

- **Added: real "Forgot password" flow** (not in the original 20-step plan, added because the user got
  locked out of their own test account):
  - `src/lib/auth/actions.ts` — `requestPasswordReset` (calls Supabase's `resetPasswordForEmail`, always
    returns the same message regardless of whether the email has an account, to avoid leaking who's
    registered) and `updatePassword` (calls `auth.updateUser({ password })` against whatever session is
    active, then redirects to `/dashboard`). Added a small `siteOrigin()` helper (reads the `host` /
    `x-forwarded-proto` request headers) since server actions have no `window.location` to build the
    email's redirect URL from.
  - `src/app/auth/confirm/route.ts` — a GET route handler that exchanges/verifies a Supabase email
    link server-side and redirects to `next` on success. Handles both `?code=...` (this project's
    Supabase clients default to the PKCE flow, so this is the param the default email template
    actually produces — via `exchangeCodeForSession`) and `?token_hash=...&type=...` (kept as a
    fallback for a manually customized template — via `verifyOtp`). Either way the session cookie is
    set entirely server-side, before the browser ever lands on the reset-password page — no client-side
    URL-fragment parsing involved.
  - **Bug found and fixed the same day**: the first version of `requestPasswordReset` pointed
    `redirectTo` straight at `/reset-password`, skipping `/auth/confirm` entirely. Supabase still
    appended `?code=...` to that URL, but nothing on `/reset-password` ever read or exchanged it, so no
    session was ever set — the page just saw a logged-out visitor and bounced to `/login`. This is
    exactly what real-world testing surfaced: clicking the emailed reset link landed on `/login` with
    nothing to do next. Fixed by pointing `redirectTo` at `/auth/confirm?next=/reset-password` instead,
    so the code exchange actually happens before the redirect to the reset form. No Supabase dashboard
    configuration is needed for this — it works against the default email template as-is.
  - `src/app/forgot-password/page.tsx` — email-only form, added to `AUTH_ROUTES` (bounces a logged-in
    user to `/dashboard`, same as `/login`/`/signup`).
  - `src/app/reset-password/page.tsx` + `ResetPasswordForm.tsx` — new-password form; the page itself
    just checks for a session (set by `/auth/confirm` before redirecting here) and bounces to `/login`
    if there isn't one. Added to `PROTECTED_ROUTES`.
  - `/login` now links to `/forgot-password` ("Forgot it?" next to the password field).
  - Verified live in the browser: `/forgot-password` renders and submitting it (with a made-up email)
    returns the generic "reset link is on its way" message with no error, proving the action call to
    Supabase succeeds. Verified via `curl` that `/auth/confirm` with a bogus `?code=` correctly falls
    through to `/login` (proving the exchange is actually attempted and its failure handled) rather than
    silently redirecting to the reset form.
  - `npx tsc --noEmit`, `npx eslint src`, and `npx vitest run` (still 23/23) all clean.
  - **Not yet verified with a real email** — needs an actual reset link clicked end-to-end, which this
    session can't do itself (same email-access limitation as every other real-login gap in this file).
    User: try `/forgot-password` again now and confirm the link lands you on `/reset-password` with a
    working form instead of `/login`.

- **Step 10 — Friends** built:
  - `supabase/step10_friends.sql` holds the new `friend_requests` table; **you need to run it once**
    the same way as Steps 4/5/7/8/9 (Supabase dashboard → SQL Editor → paste → Run). One row per
    invite, matched by **email** rather than user id, since the app has no directory to search other
    users by — `requester_email` and `addressee_email` are both stored directly on the row so either
    side can be displayed without a lookup RLS wouldn't allow anyway. Once accepted, `addressee_id`
    gets filled in and the same row doubles as the "friendship" record — no separate friendships
    table. A partial unique index blocks a second *pending* invite to the same email (a new one can
    still be sent after a decline). RLS uses `auth.jwt() ->> 'email'` (a Supabase-provided JWT claim)
    to match a row against "you" before you necessarily have an `addressee_id` on it yet.
  - `src/lib/friends/types.ts` — `FriendRequestStatus` (`pending`/`accepted`/`declined`) and
    `FriendRequest`.
  - `src/lib/friends/actions.ts` — `getFriendData()` (one query, then split client-side into
    `incoming`/`outgoing`/`friends` by status and which side of the row the current user is on),
    `sendFriendRequest` (`"use server"`, validates the email and rejects self-invites, maps a unique-
    constraint violation from the DB to a friendly "already invited" message instead of a raw
    Postgres error), `respondToFriendRequest(id, "accepted" | "declined")` and
    `cancelFriendRequest(id)` — both plain async functions (not `useActionState` forms) bound with
    `.bind(null, id, ...)` the same way Step 7's `deleteGoal` is, since they're just one-click actions
    with no fields to fill in.
  - `src/app/friends/page.tsx` — server page rendering three lists (friends, invites for you with
    Accept/Decline, invites you sent with Cancel) directly from server-bound action forms, plus
    `SendInviteForm.tsx` (the one part that needs `useActionState` for its own pending/error/message
    state) below them. `/friends` added to `PROTECTED_ROUTES`; dashboard links to it alongside the
    other feature pages (which now wrap onto a second row — six buttons plus logout no longer fit one
    line) and its step label bumped to "Step 10 of 20".
  - Verified live in the browser: a temporary unauthenticated route rendered the friends list logic
    against three fake rows (one accepted, one incoming, one outgoing) and correctly showed the
    *other* party's email in each case — including picking `addresseeEmail` vs. `requesterEmail`
    correctly depending on which side of the row "you" are on. Verified via `curl` that `/friends`
    redirects to `/login` when logged out, same as the other protected routes.
  - `npx tsc --noEmit`, `npx eslint src`, and `npx vitest run` (still 23/23 — nothing here needed new
    pure-logic tests, it's all data plumbing) all clean.
  - **Not yet verified end-to-end with two real logged-in users** — same gap as every DB-backed step
    so far: needs `step10_friends.sql` run first, then two real accounts sending/accepting an invite
    to each other at `/friends` (or ask me to once the table exists).

## V2 — the app got bigger than the 20-step plan

The user specified five sections (Buddies / Community / Home / Personal / Settings) with a
bottom tab bar, buddy-to-buddy challenge templates, an approve-a-proposed-challenge flow,
group communities with public/private joining, and anti-cheat. **The full design lives in
`docs/PLAN-V2.md` — read that before continuing.** It supersedes the old plan from Step 11
onward. The build order for the Buddies half (which the user asked for first) is split into
one-chat-sized steps in `C:\Users\Ariha\.claude\plans\rippling-leaping-pie.md` — start any
new chat by reading that file's next unstarted step.

Two decisions the user confirmed up front:
- **Generic logging, rewritten now** rather than shipping Buddies on the five fixed columns.
- **Balanced anti-cheat** as the default (server time, day lock, late/edit badges,
  plausibility flags, blind mode on; buddy verification optional).

### V2 Step 1 — the shell (done)

- `src/app/(app)/` route group holds the five tabs behind one auth-gated layout
  (`(app)/layout.tsx` redirects to `/welcome` when signed out) with `src/components/TabBar.tsx`
  pinned to the bottom: Buddies | Community | **Home** | Progress | Settings, in that order.
  Icons are inline SVG (five icons isn't worth a dependency) and inherit `currentColor`.
- `src/components/Screen.tsx` — the shared frame (`Screen`, `Card`, `EmptyState`) every tab
  screen uses, so the six pages don't each re-invent padding and headings.
- Routes moved, nothing lost: `/friends` → `/buddies`, `/log` + `/score` → `/progress`,
  `/profile` → `/settings/profile`, `/goals` → `/goals` (inside the group, reached from
  Progress), `/dashboard` → `/`. The old paths are kept working by `redirects()` in
  `next.config.ts`.
- The old public `/` landing moved to `src/app/welcome/page.tsx`; `/` is now the Home tab.
- `src/proxy.ts` — `PROTECTED_ROUTES` is now the five sections; `"/"` is protected but
  `matchesRoute` special-cases it (`pathname === "/"`), otherwise `startsWith("/")` would
  match every path in the app. An anonymous `/` goes to `/welcome`, every other protected
  route to `/login`. Post-login redirects in `src/lib/auth/actions.ts` now go to `/`.
- Verified over HTTP against the running dev server, logged out:
  `/`→307 `/welcome`, `/welcome`→200, `/buddies` `/community` `/progress` `/settings`
  `/goals`→307 `/login`, `/dashboard`→307 `/`, `/log` `/score`→307 `/progress`,
  `/friends`→307 `/buddies`, `/profile`→307 `/settings/profile`, `/login`→200.

### V2 Step 2 — generic metrics and log entries (done, migration applied)

- `supabase/step11_metrics_entries.sql` — **applied**. Nothing dropped, so it was safe to
  run on a database with real rows. It:
  - added `timezone` (default `'UTC'`) and `display_name` to `profiles`;
  - created `metrics`, the vocabulary — eight built-ins seeded (calories, protein_g,
    water_ml, sleep_hours, gym_done, steps, weight_kg, workout_minutes), each with a unit,
    `value_type`, `default_shape`, input `step`, and a `max_plausible` bound. Users can add
    private custom metrics; RLS shows you built-ins plus your own;
  - created `log_entries` — one row per (user, day, metric), replacing the five fixed
    columns on `logs`. `logs` is kept and was the source the migration backfilled from;
  - created `log_edits`, append-only, with a select policy and deliberately **no** update or
    delete policy, so nobody can rewrite their own history;
  - installed `log_entry_guard()` (before insert/update/delete) and `log_entry_audit()`
    (after update). Order mattered and is commented in the file: the backfill ran *before*
    the triggers existed, because the guard rejects writes to past days and would otherwise
    have blocked the backfill itself.
- The guard is where anti-cheat layers 1-4 actually live, in the database rather than in a
  server action, so they hold even against someone calling the REST API directly with their
  own anon-key session: server clock only, no future days, today + yesterday-until-10:00
  editable and nothing else, `is_late` stamped on entries written after their day closed,
  `edit_count` bumped only when a value really changed, and `implausible` set from the
  metric's `max_plausible`.
- **Verified applied**: `metrics` has all 8 built-in rows; the existing `logs` rows were
  copied into `log_entries` (checked via `scripts/verify.mjs`, a read-only REST helper —
  see the SQL-automation note below); `profiles` has `timezone`/`display_name`.
- `src/lib/time/day.ts` — the pure half of the same rules (`localDate`, `localMinutes`,
  `shiftDate`, `daysBetween`, `dayEditState`, `isEditable`), so the UI can show the right
  state without a round trip and the window is unit-testable. `src/lib/time/day.test.ts` has
  14 tests, including the case that matters: `2026-03-10T20:30:00Z` is the 10th in UTC but
  already the 11th in Asia/Kolkata, so the same instant gives two users different "today" —
  which is exactly what a `toISOString().slice(0, 10)` would get wrong (Step 8 did).
- `src/lib/metrics/types.ts` + `actions.ts` — `MetricDef`, the `BUILTIN_METRICS` fallback
  (so the logging screen still renders if step11 hadn't been run yet), and `getMetrics()`.
- `src/lib/logs/types.ts` rewritten: `LogEntry`, `DayLog` (date + tz + `editState` +
  entries keyed by metric), `DayValues`, `toDayValues`, and `FIELD_PREFIX` (`"m:"`).
- `src/lib/logs/actions.ts` rewritten: `getDayLog(date?)` defaults to *the user's* today,
  not the server's; `saveDayLog` reads its metric fields back out of the FormData by prefix
  (so it never needs to be told which metrics were rendered), validates each against the
  catalog, and **deletes** an emptied numeric field rather than storing 0 — zero and
  unlogged score differently.
- `src/lib/scoring/scoreDay.ts` now takes a flat `DayValues` map instead of the old
  five-column `DailyLog`. Same behavior, same 6 tests (the test's `log()` helper just builds
  a `DayValues` now).
- `src/lib/profile/actions.ts` — added `saveTimezone`, deliberately an `UPDATE` not an
  upsert: a `profiles` row can't be created without the body stats the table requires, so an
  unset profile is told to fill itself in first instead of failing on a NOT NULL violation.
- Screens: `(app)/progress` is the new logging + scoring screen (`LogForm.tsx` renders the
  metrics your goals require, hides the rest behind "Track something else", shows the
  late/edited/flagged badges, and disables itself on a locked day);
  `(app)/settings` has the time-zone picker (`TimezoneForm.tsx`, built from
  `Intl.supportedValuesOf("timeZone")` with a "use this device's zone" shortcut) and a plain
  -English "Fair play" summary of the day-lock rules; `(app)/buddies` is the old friends
  screen plus the empty state; `(app)/community` is an honest placeholder.
- Verified live in the browser at mobile width, via a temporary unauthenticated route
  (`src/app/temp-shell-preview/`, removed after checking — same throwaway pattern as Steps
  5/7/8/9/10): the tab bar renders all five tabs and measures to exactly the viewport bottom
  with nothing clipped (`navBottom === innerHeight`, 63.3px tall); the three anti-cheat
  badges render (`flagged` on a 9200 kcal entry, `edited 3×`, `late`); "Track something
  else" expands from 3 required fields to all 8, every one named `m:<metric_key>` as
  `saveDayLog` expects; light and dark both render; no console errors.
- `npx tsc --noEmit`, `npx eslint src`, and `npx vitest run` (37/37 — the 23 from before
  plus 14 new time tests) all clean.

### SQL automation set up (new capability, not a build step)

This project had no Supabase CLI/migrations — every schema change up to Step 10 was a
`.sql` file the user pasted into the dashboard's SQL Editor by hand. That changed:

- User added `SUPABASE_SERVICE_ROLE_KEY` to `.env.local` (Settings → API → Secret keys on
  the newer Supabase dashboard, labeled `service_role` on older ones). Documented as
  optional in `.env.local.example`. **Server-only, bypasses RLS entirely — never commit,
  never expose client-side.**
- `supabase/_bootstrap_exec_sql.sql` — a one-time-only paste (already run). Creates
  `public.exec_sql(query text)`, `security definer`, with `execute` revoked from
  `public`/`anon`/`authenticated` and granted only to `service_role` — so this doesn't open
  any privilege-escalation path for real signed-in users, only for someone holding the
  service-role key itself (who already has full read/write on every table regardless; the
  new thing this adds is schema-level changes too — noted as a tradeoff in the file, with a
  one-line `drop function` to remove it later if wanted).
- `scripts/run-sql.mjs` — `node scripts/run-sql.mjs supabase/<file>.sql` applies a migration
  by calling that RPC with the service-role key. This is how `step11_metrics_entries.sql`
  was applied.
- `scripts/verify.mjs` — read-only REST helper for confirming a migration landed
  (`node scripts/verify.mjs <table> "<query-string>"`), same credentials.
- **Going forward:** new migrations under `supabase/` get applied via `run-sql.mjs`, not
  pasted by hand. Auto mode's classifier prompts for approval on each `run-sql.mjs` call
  (it's a network call carrying a secret) — that's expected, just approve it when asked.

### V2 Step 3 — challenge tables (done, migration applied)

- `supabase/step12_challenges.sql` — **applied** via `scripts/run-sql.mjs`. Nothing existing
  touched, so it was safe to run alongside real data. Creates `challenges` (`kind`
  `'buddy'|'community'` so Community later reuses this same table), `challenge_participants`
  (`(challenge_id, user_id)` composite PK, `role`, `status`), `challenge_rules` (same
  `{shape, target, min, max, weight}` fields as `goals` on purpose — Step 4 reuses `scoreGoal`/
  `calculateDayScore` unchanged — plus `scope` `'shared'|'own'`, `period`, `schedule jsonb` for
  gym scheduling, `requires_proof`, `effective_from`/`effective_to`), `challenge_rule_targets`
  (per-participant numbers for `scope='own'` rules), and `challenge_invites` (random token,
  `expires_at`, `accepted_by`).
- Two rules enforced in SQL, not just the UI (anti-cheat #1 lives here): `challenge_rule_immutable_guard()`
  is a `before update` trigger that rejects any change to a rule row except `effective_to` — an
  "edit" is always close-this-row-and-insert-a-replacement, never an in-place change, so nobody
  can see a bad score and retroactively lower their target. A partial unique index
  (`challenge_rules_one_live_per_metric`, `where effective_to is null`) blocks a challenge from
  ever having two live rules for the same metric.
- `week_anchor` from the `docs/PLAN-V2.md` §2 sketch was deliberately **not** added as a column
  — it's fully derivable from `challenges.start_date`, and storing it separately would just be a
  second source of truth that could drift (V2 Step 4 derives it in TypeScript instead).
- RLS uses a `security definer` helper `is_challenge_participant(challenge_id)` (bypasses RLS
  internally) rather than a self-referencing policy on `challenge_participants`, to sidestep the
  classic self-referencing-RLS reasoning trap. Rule inserts are restricted to
  `created_by = auth.uid()` while `status = 'draft'`, exactly as asked — once a challenge is
  active, a replacement rule only gets written through the (later) change-request approval flow.
  `challenge_invites` has no public-by-token policy yet; that's `/join/[token]` territory
  (V2 Step 7), deliberately deferred to a security-definer RPC rather than a broad policy now.
- **Found and fixed while applying it**: the first version used pgcrypto's `gen_random_bytes()`
  for the invite token, which failed with `function gen_random_bytes(integer) does not exist`
  under `exec_sql`'s `set search_path = public` — pgcrypto wasn't resolving on that restricted
  path, unlike `gen_random_uuid()` (core Postgres 13+, not pgcrypto-dependent). Fixed by building
  the token from two concatenated `gen_random_uuid()`s instead (64 hex chars, plenty of entropy),
  removing the pgcrypto dependency entirely.
- **Verified functionally** (not just "table exists"): a throwaway `do $$ ... $$` block (run via
  `run-sql.mjs`, cleaned up in the same transaction) against a real user id proved, on live data:
  an in-place `update ... set target` is rejected (`check_violation`) while an `effective_to`-only
  update succeeds; a `scope='own'` row with a `target` set is rejected; a second live rule for a
  metric that already has one is rejected (`unique_violation`). All four passed.
- No UI yet, as planned — that's V2 Step 5.

### V2 Step 4 — the scoring rollup (done)

- `src/lib/challenges/types.ts` (plain module) — `RuleScope`, `RulePeriod`, `GymSchedule`
  (`flexible` + `sessionsPerWeek`, or `fixed_days` + weekday numbers), `ResolvedRule` (`Goal` from
  `src/lib/scoring/types.ts` intersected with `id`/`metricKey`/`weight`/`period`/`schedule`/
  `effectiveFrom`/`effectiveTo` — deliberately a superset the same way `SavedGoal` is, so
  `scoreGoal` keeps working unchanged), and `RuleLog` (one rule's logged values by date).
  `scope='own'` resolution (joining `challenge_rule_targets`) is a DB-layer concern for a later
  step — by the time a `ResolvedRule` exists it's already one participant's own numbers, which is
  what keeps this module pure.
- `src/lib/challenges/rollup.ts` — pure, no DB, no React, same style as `src/lib/scoring/engine.ts`:
  `rollupRule(rule, log, challengeStart, rangeStart, rangeEnd)` clips the scoring window to the
  rule's own `effective_from`/`effective_to` (a not-yet-active rule contributes `{score: 0, weight:
  0}`, i.e. is excluded from the total rather than scored as a failure), then branches on `period`:
  `weekly` groups days into weeks anchored to `challengeStart`'s weekday (not ISO Monday) and scores
  each week `min(done/sessionsPerWeek, 1)`, averaged; `daily` scores every day in range via the
  existing `scoreGoal`, except a `fixed_days` gym schedule skips non-scheduled days entirely
  (excluded from the denominator, not scored 0 — getting this wrong caps every score around 57%).
  An unlogged numeric day scores 0, same unlogged-vs-real-zero distinction `scoreDay.ts` makes.
  `rollupChallenge(rules, logsByMetric, ...)` runs `rollupRule` per rule and combines the results
  with the unchanged `calculateDayScore` for the overall total.
- `src/lib/challenges/rollup.test.ts` — 5 tests: the `scope='own'` fairness proof extended to the
  rollup layer (a 150g-protein cutter-equivalent and a 220g bulker-equivalent both score 100 on
  their own number), the fixed-days rest-day exclusion (4 gym days/week logged perfectly over 2
  weeks scores 100, not the ~57% a rest-day-as-miss bug would produce), the flexible
  N-sessions-per-week weekly average, a rule whose `effective_from` is mid-range scoring only from
  that date, and a rule not yet effective for the whole range contributing zero weight.
- **Found and fixed a latent bug this step surfaced**: `vitest` had no alias configuration, so
  `@/...` only ever resolved in *type-only* imports (erased before runtime — every existing
  `@/lib/...` import in a `.test.ts` file happened to be `import type`) or under `next dev`/build
  (Next's own resolver understands `tsconfig.json` paths). `rollup.ts` is the first pure module to
  *value*-import across the alias (`calculateDayScore`, `scoreGoal`, `daysBetween`, `shiftDate`),
  which surfaced it immediately as `Cannot find package '@/lib/scoring/engine'`. Fixed by adding
  `vitest.config.ts` with a `resolve.alias` mirroring `tsconfig.json`'s `"@/*": "./src/*"` — fixes
  it for every future pure module, not just this one.
- `npx tsc --noEmit`, `npx eslint src`, and `npx vitest run` (42/42 — the 37 from before plus 5
  new) all clean.
- Nothing on screen for this step, as planned — it's pure logic V2 Step 5 (the challenge builder
  UI) will wire up to real rules and real logged data.

### V2 Steps 5-7 — the challenge builder, saving a draft, and invite links (done)

Built as one pass, since Steps 5/6/7 are really one feature (a wizard that doesn't write
anything until Step 7's link exists to send).

- `src/lib/challenges/types.ts` — added the builder's plain types: `RuleDraft` (a rule as
  edited, before it's a `challenge_rules` row), `ChallengePreset`/`CHALLENGE_PRESETS`
  (*Consistency 30*, *Cut Together*, *Step War*, *Custom*, per `docs/PLAN-V2.md` §3.2),
  `findPreset`, and `newCustomRule` for the "+ Add a rule" picker. Presets' numeric rules
  call `buildRules(recommendations)` so they pre-fill from the user's Step 5 targets, exactly
  the "already personal and correct" requirement.
- `src/app/(app)/buddies/new/page.tsx` + `NewChallengeWizard.tsx` — all six screens (Who /
  What kind / How long / Rules / Stake / Review) as one client component holding the wizard
  state; nothing is written to the database until the final "Create challenge" button on
  screen 6. Screen 4's rule cards toggle `Same number for both` vs `Each sets their own`
  per rule (hidden for gym rules — see the schema gap noted below), and a single
  **Advanced** disclosure reveals weight, requires-proof, the flexible-vs-fixed-days gym
  schedule switch, and challenge-level blind mode, matching the plan's "single disclosure"
  rule. `?buddy=<userId>` preselects screen 1 from the Buddies page's new "Start a
  challenge" link.
- **Known schema gap, deliberately deferred**: `challenge_rule_targets` only has
  `target`/`min`/`max` columns, not a schedule column, so a gym rule's `own`-scope
  ("6-day PPL split vs 3-day full-body", `docs/PLAN-V2.md` §2) isn't representable yet —
  the UI locks gym-schedule rules to `scope: 'shared'` (one schedule, shown as "Same
  schedule for both") rather than silently producing a rule the rollup can't score
  correctly. Revisit if/when per-participant schedules are actually needed.
- `src/lib/challenges/actions.ts` (new) — `createChallenge(input)`, called directly from
  the client component (not `useActionState`/`FormData` — the wizard's state doesn't live
  in one `<form>`). Validates everything server-side again (mirrors the Step 7 `goals`
  validation, generalized per rule), confirms `buddyUserId` is really an accepted friend
  before inserting a participant row for them, then inserts in this order: `challenges`
  (`status='draft'` — inserting as `'pending'` immediately would fail step12's own RLS,
  which only allows rule inserts while a challenge is a draft), the owner's
  `challenge_participants` row (+ the buddy's `invited` row if one was picked),
  `challenge_rules` (one insert per rule; `scope='own'` rules get `target/min/max` nulled
  on the rule row itself, per the schema's check constraint), the owner's own
  `challenge_rule_targets` row for each `scope='own'` rule, a `challenge_invites` row, then
  finally flips `challenges.status` to `'pending'`. **Not wrapped in a DB transaction** (the
  Supabase JS client doesn't offer one for plain table inserts) — a mid-sequence failure
  can leave a partial draft row behind; acceptable for a personal project, flagged here in
  case it ever matters.
- `supabase/step13_challenge_invites.sql` — **applied** via `scripts/run-sql.mjs`. Three
  `security definer` RPCs, same pattern as `is_challenge_participant`/`exec_sql`, because
  the invite flow fundamentally needs a user who *isn't* a participant yet to read a
  challenge (RLS says only participants can) and then become one:
  - `challenge_invite_preview(token)` — read-only: name, dates, stake, settings, the
    inviter's display label (`profiles.display_name` falling back to the email's local
    part — the only place this app reads `auth.users` directly, and only inside a
    security-definer function), the live rules, and status flags (`expired`, `full`,
    `isOwnInvite`, `alreadyJoined`) the join screen branches on.
  - `accept_challenge_invite(token, own_targets)` — upserts the caller's
    `challenge_participants` row, writes their `challenge_rule_targets` for each
    `scope='own'` rule from the join screen's inline inputs, stamps `accepted_by`, and
    flips the challenge to `'active'`. Rejects the challenge's own creator, an expired
    token, and a third participant (buddy challenges are strictly two people).
  - `decline_challenge_invite(token)` — the invitee was never a participant, so there's
    nothing of theirs to update; declining just cancels the still-pending challenge.
  - All three `grant execute ... to authenticated` only (no `anon` access) — a signed-out
    visitor never reaches the point of calling these; see the proxy change below.
- `src/app/join/[token]/page.tsx` + `JoinActions.tsx` — public route (outside the `(app)`
  tab-bar group, styled like `/login`/`/welcome`). Server component renders the static
  preview and branches on the RPC's status flags (not found / your own invite / already
  joined / expired / full) before showing the real screen: rule list, stake, and — the
  part that needed its own component — inline number inputs for `scope='own'` rules,
  pre-filled from *this* user's own recommended targets (not the inviter's), matching
  §3.3. `JoinActions` (client) wires Accept/Decline to the two RPC-backed actions and
  redirects to `/buddies` on success. **"Suggest changes" from `docs/PLAN-V2.md` §3.3 is
  not built** — it needs `challenge_change_requests`, which is V2 Step 10's table; only
  Accept/Decline exist for now, which is enough to satisfy this step's "two accounts reach
  a shared `active` challenge" requirement.
- `src/proxy.ts` — a signed-out visitor to `/join/<token>` now goes to
  `/signup?next=<pathname>` instead of the generic protected-route bounce to `/login`.
- `src/lib/auth/actions.ts` + `login`/`signup` pages — added `next` support so that
  round trip actually lands back on the invite: a hidden `next` field (read via
  `useSearchParams`, each page now wrapped in `<Suspense>` since that hook requires one)
  carries the path through the form; `login`/`signup` redirect there instead of always to
  `/` (validated to be a same-site path — `/` prefix, not `//`, the same rule
  `/auth/confirm`'s existing `next` param already followed for password resets).
  `signup`'s `emailRedirectTo` now points at `/auth/confirm?next=<next>` too, reusing that
  route's existing generic `next` handling rather than adding a second mechanism.
- `src/app/(app)/buddies/page.tsx` — the "Soon" chip is gone. Each buddy card now has a
  "Start a challenge" link (`/buddies/new?buddy=<id>`) and lists any real buddy challenges
  between the two of you (name + status), via the new `getMyChallengesByBuddy()` — two
  plain client-safe queries against `challenge_participants`/`challenges` under the
  *existing* RLS (no new RPC needed here, unlike the invite-preview flow, because both
  sides are already participants by the time this is read). A header-level "New
  challenge" button and the empty state's CTA both link to `/buddies/new` directly, for
  the link-only flow when there are no buddies yet.
- Verified live in the browser (via temporary unauthenticated preview routes rendering
  `NewChallengeWizard` and `JoinActions` directly with mock data — the usual pattern from
  Steps 5/7/8/9/10, removed after checking) at mobile width: walked all six wizard screens
  choosing "Cut Together", confirmed calorie/protein targets came back exactly as the
  mocked recommendations (2240/176), confirmed the gym rule's Advanced
  flexible-vs-fixed-days switch correctly swapped the sessions-per-week input for weekday
  chips and back, confirmed the Review screen's summary matched every choice made, and
  confirmed clicking "Create challenge" round-tripped to the real `createChallenge` server
  action and surfaced its "You're not logged in" error inline (same proof-of-wiring
  pattern as every other unauthenticated verification in this file). Separately verified
  the join screen renders the stake/rules/inviter copy and pre-fills `scope='own'` inputs
  from mock recommendations, and that Decline round-trips to the real
  `decline_challenge_invite` RPC action the same way.
- `npx tsc --noEmit` and `npx eslint src` both clean; `npx vitest run` still 42/42 (no new
  pure-logic to test this step — it's DB wiring and UI, like Steps 7/8/9/10 before it).
  Also ran `npx next build` as an extra check, since this session's own `next dev` couldn't
  bind a port (another chat already had one running against this same folder, and Next 16
  refuses a second instance even with `autoPort`) — build succeeded, including the new
  `/buddies/new` and `/join/[token]` routes.
- **Not yet verified end-to-end with two real logged-in users** — same gap as every
  DB-backed step so far: needs two real accounts, one sending an invite from `/buddies/new`
  and the other accepting it at the resulting `/join/<token>` link (or ask me to once
  that's possible).

### V2 Steps 8-9 — the scoreboard RPC and the buddy comparison screen (done)

Built as one pass, since Step 9 has nothing to render without Step 8's data.

- `supabase/step14_scoreboard.sql` — **applied** via `scripts/run-sql.mjs`. A `security
  definer` function `challenge_scoreboard(p_challenge_id uuid)`, same pattern as
  `is_challenge_participant`/`challenge_invite_preview`: `log_entries` RLS stays "own rows
  only" (untouched), because a broad read policy would let either side quietly read the
  other's entire history any time — exactly what blind mode exists to prevent. This
  function is the one deliberate, narrow exception.
  - **Design boundary, spelled out in the file's header comment**: the RPC returns each
    rule's resolved window/targets and each participant's logged *values* (numbers/booleans
    by date) — never full `log_entries` rows (no id, source, per-entry `is_late`/
    `edit_count`/`implausible`, `logged_at`). Only aggregate badge *counts* leave the
    database for the other participant. The actual score math (weekly grouping anchored to
    the challenge start, fixed-day rest-day exclusion, weighted averaging) deliberately
    stays in TypeScript — `src/lib/challenges/rollup.ts` is already written and unit-tested
    for exactly this, and reimplementing it in PL/pgSQL would just be a second, untested
    copy to keep in sync. `getScoreboard()` in `actions.ts` is the only caller and is what
    actually hands the UI "only scores and badge counts" (per the plan's own wording) — the
    SQL function is the private data-fetching half of that boundary, not the public one.
  - Blind mode: the caller's own values always come back in full. The *other* participant's
    value for the caller's current day (their stored timezone applied to the server clock —
    same rule `log_entry_guard()` uses) is withheld entirely — absent from the JSON, not
    zeroed — until the caller has logged at least one of the challenge's own metrics for
    that same day. Day-level, not per-metric: "logged today" means *anything* the challenge
    tracks, matching the plan's "you cannot see your buddy's number for today until you've
    logged your own" (not "that one field").
  - Every rule *version* the challenge has ever had is returned (not just the live one) —
    future-proofing for V2 Step 10's edit flow, which will close a rule's `effective_to` and
    insert a replacement; `rollupRule` already clips each version to its own window, so nothing
    extra was needed on the TypeScript side for this.
- `src/lib/challenges/rollup.ts` — added `dailyScores(rules, logsByMetric, rangeStart,
  rangeEnd)`, a new pure function (no DB, same style as everything else in the file) for the
  heat strip: one score per day, built only from `daily`-period rules (a `weekly` rule like
  flexible gym has no single day it "happened on", so it's left out rather than smeared
  across days). A day is `null` — a neutral notch, not a 0 — when no daily rule actually
  applied to it (fixed-days rest day, before `effective_from`, or no daily rules at all).
  Also exported `datesInRange` (was file-private) for reuse. 4 new tests in
  `rollup.test.ts` cover each of those `null` cases plus the ordinary per-day scoring case.
- `src/lib/challenges/types.ts` — added the scoreboard's own result types
  (`ScoreboardRuleSummary`, `ScoreboardParticipant`, `ScoreboardResult`), documented as
  carrying only scores/heat-strip/badge-counts, matching the SQL file's boundary comment.
- `src/lib/challenges/actions.ts` — `getScoreboard(challengeId)`: calls the RPC, reshapes
  its JSON into `ResolvedRule[]`/`RuleLog` per participant (a `scope='own'` rule with no
  target on file yet for that participant — e.g. they haven't reached the join screen's
  own-target inputs — gets pinned to a far-future `effective_from` so it's excluded rather
  than scored against a fabricated target of 0, the same "not yet effective" treatment a
  real future rule already gets), then calls the existing `rollupChallenge`/`dailyScores`
  unchanged. Also added `getChallengesWithBuddy(buddyUserId)`, a thin wrapper over the
  existing `getMyChallengesByBuddy()` for one buddy.
- `src/components/EntryBadges.tsx` — the late/edited/flagged badge rendering, lifted out of
  `(app)/progress/LogForm.tsx` (now just a thin prop-based component) so the buddy screen
  could reuse it instead of rewriting it, per the step's own instruction.
- `src/app/(app)/buddies/[id]/page.tsx` — the comparison screen: overall you-vs-them bars,
  one bar pair per rule, a Today section (your status always shown; theirs shows "Hidden
  until you log today" when blind mode is withholding it), a 30-day (or shorter, clipped to
  the challenge's range) heat strip with rest days as a neutral notch and the buddy's
  today-cell distinctly greyed out (not colored) when hidden, and an aggregate badge-count
  line per person ("1 late, 2 edited" / "clean so far"). Picks the most relevant challenge
  when a buddy has more than one on file (active > pending > completed > other, newest
  first) via `getChallengesWithBuddy`; shows a "waiting on them" empty state if the
  challenge isn't at two accepted participants yet, or a "start a challenge" empty state if
  there's no challenge with that buddy at all.
- `src/app/(app)/buddies/page.tsx` — each buddy's name is now a link to `/buddies/<id>`
  (previously just static text).
- **Verified functionally against the real database**, not just via mock data — a
  throwaway script (same pattern as V2 Step 3's verification) built a real challenge with a
  `shared` at_least rule, an `own` at_most rule with different targets per side, and a
  `weekly` gym rule, against this project's two real accounts; temporarily disabled
  `log_entry_guard_trigger` only to backdate the test fixture's history (re-enabled
  immediately after, confirmed via `pg_trigger.tgenabled = 'O'` afterward), then called
  `challenge_scoreboard` as each side by setting the `request.jwt.claims` GUC. Confirmed:
  badge counts matched exactly what was inserted; each side's `isCaller` flipped correctly;
  and blind-mode redaction responded correctly to whether the caller had already logged
  today (it had, via a pre-existing *real* log entry from actual personal use of the app on
  the current date — which itself incidentally proved the metric-union behavior: a
  challenge's scoreboard picks up a user's real logged values for shared metrics like
  `calories`/`gym_done`, not just synthetic test data). All test rows deleted afterward
  (exact tuple matches only — never touched the two accounts' real log history); confirmed
  clean via `verify.mjs`.
- Verified live in the browser (temporary unauthenticated route rendering the page's
  exported `Scoreboard` component directly with mock data — same pattern as every other
  step, removed after checking) at mobile width, light and dark: bars, per-rule cards,
  the Today section's hidden-state copy, the heat strip's three-tier color scale plus
  distinct grey rest-day and hidden-today cells, and the badge summary line all rendered
  correctly with no console errors.
- `npx tsc --noEmit`, `npx eslint src`, and `npx vitest run` (46/46 — the 42 from before
  plus 4 new `dailyScores` tests) all clean. `npx next build` succeeded, including the new
  `/buddies/[id]` route. Confirmed via `curl` that `/buddies/<id>` redirects to `/login`
  when logged out, same as every other protected route.
- **Not yet verified end-to-end with two real logged-in users tapping through the actual
  UI** — same gap as every prior buddy-flow step: needs two real accounts with a real
  active challenge between them, then opening `/buddies/<id>` for real (or ask me to once
  that's set up).

### V2 Step 10 — propose and approve a change (done, migration applied)

- `supabase/step15_change_requests.sql` — **applied** via `scripts/run-sql.mjs`. Two new
  tables: `challenge_change_requests` (`kind` `'add'|'edit'|'remove'`, `rule_id` for
  edit/remove, `payload jsonb` holding the proposed `RuleInput` plus the proposer's own
  number when `scope='own'`, `status` `'pending'|'approved'|'rejected'`, `effective_from`
  set only on approval) and the generic `notifications` inbox from `docs/PLAN-V2.md` §2
  (`user_id`, `kind`, `payload`, `read_at`). Both have `select`-only RLS for participants/
  the owning user — every write goes through two new `security definer` RPCs, the same
  pattern as `accept_challenge_invite`, because `challenge_rules`' own RLS only lets
  `created_by` insert while `status='draft'` (step12), so nothing else can legally write a
  post-activation rule change without going through here:
  - `propose_challenge_change(challenge_id, kind, rule_id, rule, own_target)` — validates
    the challenge is `active`, the caller is a participant, and (for edit/remove) that the
    target rule is currently live; inserts the request and a `change_proposed` notification
    for the other side.
  - `respond_challenge_change(request_id, approve, own_target)` — rejects outright if the
    responder is the proposer (errcode check, "You cannot respond to your own proposal").
    On approval: closes the old rule (`effective_to = current_date`, the guard trigger only
    allows this one field to change) for edit/remove, and for add/edit inserts the
    replacement with `effective_from = current_date + 1` — anti-cheat rule #1 holding even
    for changes made mid-challenge. A `scope='own'` add/edit needs both sides' numbers: the
    proposer's came in with the proposal, the responder's is either passed as `own_target`
    here or (edit only) carried forward from the old rule's `challenge_rule_targets` row;
    missing entirely raises "This rule needs your own number." Either branch inserts a
    `change_approved`/`change_rejected` notification back to the proposer.
- `src/lib/challenges/types.ts` — `ChangeRequestKind`, `ChangeRequestStatus`, `RuleTarget`,
  `ChangeRequest`. `src/lib/notifications/types.ts` + `actions.ts` (new module) —
  `Notification`, `getNotifications`, `getUnreadCount`, `markNotificationRead`,
  `markChallengeNotificationsRead` (called when a challenge's screen is opened — there's no
  separate inbox page yet, so opening `/buddies/[id]` *is* "reading" its notifications).
- `src/lib/challenges/actions.ts` — `proposeChange`/`respondToChange` (thin wrappers over the
  two RPCs, reusing Step 6's `validateRule` on the proposed rule), `getChangeRequestsForChallenge`,
  `getPendingChangeCounts` (per challenge, for the Buddies list badge).
- `src/components/TabBar.tsx` — takes a `hasUnread` prop and renders a small red dot on the
  Buddies icon specifically (every notification kind so far is buddy-challenge-related);
  `(app)/layout.tsx` fetches `getUnreadCount()` once and passes it down.
- `src/app/(app)/buddies/[id]/ChangeRequestPanel.tsx` (new, client) — a smaller editor than
  the challenge builder wizard: "edit" doesn't prefill from the old rule's numbers (the
  scoreboard never exposes a `scope='own'` rule's target for privacy reasons anyway), it
  just collects fresh numbers for whichever shape was picked. Shows any pending request
  addressed to the other side ("waiting on them") or to you (Approve/Reject, with an inline
  own-number input when the change needs one), plus "Propose adding/editing/removing a
  rule" buttons. `src/app/(app)/buddies/page.tsx` shows a small red "N change(s)" badge next
  to any challenge with a pending request.
- Verified functionally against the real database (throwaway `do $$ ... $$` fixture between
  the two real accounts, cleaned up after — same pattern as V2 Steps 3/8-9): add-then-approve
  (new rule live from tomorrow, notification received), the proposer trying to approve their
  own request rejected with the right error, edit-then-approve (old rule's `effective_to`
  closed to today, replacement at the new target from tomorrow), remove-then-reject (rule
  untouched), and the `scope='own'` add path (approver omitting their own number rejected;
  supplying it writes both sides' `challenge_rule_targets` rows correctly).
- Verified live in the browser (temporary unauthenticated route rendering `ChangeRequestPanel`
  directly with mock pending requests — same throwaway pattern as every prior step, removed
  after checking): the incoming card renders the buddy's proposed change and an inline
  "Your number" input for the `scope='own'` case; the outgoing card shows "waiting on
  buddy@example.com"; opening "Propose adding a rule" renders the metric picker and fields;
  submitting round-trips to the real `proposeChange` action and shows "You're not logged in."
  inline, the same proof-of-wiring pattern used throughout this file. The tab bar's red dot
  rendered correctly on Buddies with `hasUnread`.
- `npx tsc --noEmit`, `npx eslint src`, `npx vitest run` (still 51/51 — see V2 Step 11 below
  for the 5 new tests) and `npx next build` all clean.
- **Not yet verified end-to-end with two real logged-in users tapping through the actual
  UI** — same gap as every prior buddy-flow step.

### V2 Step 11 — the remaining anti-cheat layers (done, migration applied)

Blind mode (layer 7) already shipped in V2 Step 8. This step is everything else from
`docs/PLAN-V2.md` §4 that hadn't landed yet: buddy verification + a dispute window (layer 5),
and the suspicious-consistency pattern check (part of layer 4).

- `supabase/step16_verifications.sql` — **applied** via `scripts/run-sql.mjs`.
  - `verifications` (`entry_id`, `verifier_id`, `state` `'ok'|'disputed'`, unique on
    `(entry_id, verifier_id)` so a buddy can change their mind via upsert). RLS lets a buddy
    confirm/flag the *other* side's entry only within 48 hours of `logged_at`, expressed as a
    self-join on `challenge_participants` from a different table's policy (not the
    self-referencing-RLS trap step12's own comment warns about, since this policy lives on
    `verifications`). No RPC needed for reads/writes — plain RLS covers it, same as every
    other simple owner-scoped table in this app.
  - `trust_score(user_id)` — global, not per-challenge (`docs/PLAN-V2.md` §4: "a visible
    Trust Score on the profile"): counts back from the most recently verified day, every
    consecutive `'ok'` day, stopping at the first `'disputed'` one.
  - `challenge_scoreboard` — **`create or replace`d** (same function, extended): a
    `'disputed'` entry is now excluded from `logsByMetric` exactly like a blind-mode-hidden
    one (absent, not zeroed), which is what makes it "worth 0 until both agree" — the rollup
    already scores an absent day as 0. A `disputed` badge count joins late/edited/flagged,
    and each participant now also carries their `trustScore`.
  - `challenge_recent_entries(challenge_id)` (new RPC) — the verification feed: the *other*
    participant's entries logged in the last 48 hours, each with the caller's own
    verification state so the UI shows "Confirmed"/"Disputed — undo" instead of re-offering
    the buttons. Still respects blind mode's "hide today until you've logged" rule.
- `src/lib/challenges/rollup.ts` — `findSuspiciousStreaks(log, threshold = 14)`, a pure
  function (no DB): flags a numeric metric held at the *exact* same value for 14+
  consecutive calendar days (a gap breaks the streak; boolean metrics are the caller's job to
  exclude, since an unbroken "done" streak is the goal, not a red flag). 5 new tests in
  `rollup.test.ts` — the exact threshold, one day short, noisy real logging never flagged,
  a calendar gap breaking an otherwise-long streak, and booleans ignored.
- `src/lib/challenges/actions.ts` — `getScoreboard()` now also computes a `suspicious` badge
  count per participant (via `findSuspiciousStreaks` over each numeric rule's logged values —
  deliberately TypeScript, per the plan's own instruction, not duplicated in SQL) and passes
  through `trustScore`; new `getRecentEntries`/`submitVerification` (a thin RLS-guarded
  wrapper, same shape as every other plain-RLS write in this codebase).
- `src/lib/logs/types.ts`/`actions.ts` — `LogEntry` gained `disputed`; `getDayLog` joins
  `verifications` for the day's own entries so a user sees when a buddy has flagged one of
  their own days. `src/components/EntryBadges.tsx` gained a `disputed` badge (same red tone
  as `flagged`). `src/app/(app)/buddies/[id]/RecentEntriesFeed.tsx` (new, client) — the
  confirm/flag list; `BadgeSummary` on the buddy screen now also shows disputed/suspicious
  counts and a `· trust N` suffix when nonzero.
- Verified functionally against the real database, extending the same throwaway fixture as
  V2 Step 10's: disputing an entry excluded it from the scoreboard's `logsByMetric` and
  bumped the `disputed` badge to 1; `challenge_recent_entries` showed the right
  `myVerification` state; undoing the dispute restored the entry; three consecutive `'ok'`
  backdated verifications produced `trust_score = 3`. All test rows deleted afterward
  (confirmed via `verify.mjs`); the day-lock trigger was temporarily disabled to backdate
  the fixture's history and confirmed re-enabled afterward (`pg_trigger.tgenabled = 'O'`),
  same technique V2 Step 8-9 used.
- Verified live in the browser (temporary unauthenticated route, same pattern as V2 Step
  10's, removed after checking): `RecentEntriesFeed` rendered a fresh entry with
  Confirm/Flag and an already-disputed one as "Disputed — undo"; `LogForm` showed a
  `disputed` badge alongside `edited 2×` on a mocked entry; clicking Confirm round-tripped to
  the real `submitVerification` action without error (no session, so it silently no-ops —
  the same proof-of-wiring pattern used everywhere else in this file).
- `npx tsc --noEmit`, `npx eslint src`, and `npx vitest run` (51/51 — the 46 from before plus
  5 new `findSuspiciousStreaks` tests) all clean. `npx next build` succeeded.
- **Proof photos and device sync stay phase 2**, as the plan says. **Not yet verified with
  two real logged-in users tapping through the actual confirm/flag UI** — same gap as every
  prior buddy-flow step.

### V2 Step 12 — Personal Dashboard shows every challenge (done)

- `src/lib/challenges/actions.ts` — `getMyActiveChallenges()`: every `status='active'` buddy
  challenge the user is an accepted participant of, with the metric keys of its currently
  live rules.
- `src/app/(app)/progress/page.tsx` — `required` (the set of metrics always shown on the
  logging form) now unions in every active challenge's rule metrics, not just goals, exactly
  the line `rippling-leaping-pie.md` Step 12 named. A new `feeds` map (metric key ->
  goal/challenge names) is built alongside it and passed to `LogForm`; below the goals list,
  one `Card` per active challenge shows its name and the caller's own total (via
  `getScoreboard`, reused unchanged) with a progress bar — two challenges with one buddy plus
  two with another shows four cards, per the plan's own example.
- `src/app/(app)/progress/LogForm.tsx` — each field takes an optional `feeds: string[]` and
  renders a small "Feeds Goal name · Challenge name" line under its label, so nothing being
  tracked is ever a mystery about *why*.
- No new logging mechanics needed, as the plan predicted — this is entirely the payoff of
  having made logging metric-centric back in V2 Step 2.
- Verified live in the browser (temporary unauthenticated route rendering `LogForm` directly
  with a mocked multi-source `feeds` map, same throwaway pattern as every prior step, removed
  after checking): the chip line rendered "Feeds Cut calories goal · Cut Together · Step War"
  under the Calories field, alongside its existing edited/disputed badges.
- `npx tsc --noEmit`, `npx eslint src`, `npx vitest run` (51/51, no new pure logic needed for
  this step) and `npx next build` all clean.
- **Not yet verified end-to-end with a real logged-in user with real active challenges** —
  same gap as every DB-backed step so far.

### V2 Step 13 — polish: grace tokens, stake ledger, who-won-today, rematch, weekly recap (done, migration applied)

All five independent wins from `docs/PLAN-V2.md` §5, built as one pass since they share the
scoreboard/rollup plumbing.

- `supabase/step17_polish.sql` — **applied** via `scripts/run-sql.mjs`.
  - `challenge_grace_days` — one excused day per 30-day period per challenge. Periods are
    fixed 30-day blocks counted from the challenge's own `start_date` (not a rolling window —
    simpler to enforce with a plain unique index on `(challenge_id, user_id, period)`, and
    every participant shares the same `start_date` so it's still fair), computed by a
    `before insert` trigger (`grace_day_guard()`) and never trusted from the client. "Must be
    declared before the day ends" is enforced by the RLS insert policy requiring
    `log_date = (now() at time zone your_timezone)::date` — there's no path to grace a day
    after the fact. No update/delete policy: a declared grace day stands, same
    no-retroactive-fixing spirit as `challenge_rules` never being edited in place.
  - `challenge_stakes` — `(winner_id, loser_id, is_tie, winner_settled, loser_settled)`,
    primary-keyed on `challenge_id`. The winner is decided in TypeScript from the same totals
    `getScoreboard()` already computes (scoring logic stays out of SQL entirely, same boundary
    `challenge_scoreboard`'s own header comment describes) and written via a plain RLS-gated
    upsert the first time either side opens the ledger after the challenge ends. Settling is
    the one thing that needs a database rule (each side can only ever flip their own column),
    so that goes through `mark_stake_settled(challenge_id)`, a `security definer` RPC, instead
    of a plain `update` policy.
  - `challenge_scoreboard` — **`create or replace`d again** (same function as step14/step16):
    each participant now also returns `gracedDates`, so the rollup can exclude those days from
    scoring exactly like a rest day.
- `src/lib/challenges/rollup.ts` — `rollupRule`, `dailyScores` and `rollupChallenge` all take
  an optional `graced: ReadonlySet<string>` parameter; a graced date is skipped entirely in
  the **daily** branch, same treatment a fixed-days rest day already gets. Weekly
  sessions-per-week rules are deliberately **not** affected — there's no clean way to excuse
  one day out of a week's session count without also lowering how many sessions were required
  that week, so grace is daily-rules-only (documented in the code). 2 new tests.
- `src/lib/challenges/actions.ts`:
  - `getScoreboard()` now also computes `weekTotal`/`weekPerRule` per participant — the exact
    same `rollupChallenge` call, just windowed to the trailing 7 days (clipped to the
    challenge's start) instead of the whole range — cheap reuse, no new scoring logic. This is
    what powers the weekly recap.
  - `declareGraceDay(challengeId)`, `getStakeLedger()` (lazily computes+upserts a
    `challenge_stakes` row per ended, staked challenge the user is in, then reads back
    settlement state), `markStakeSettled(challengeId)`, and `rematchChallenge(oldChallengeId)`
    — reshapes an ended challenge's current live rules (`effective_to is null`) plus the
    caller's own `challenge_rule_targets` into a `CreateChallengeInput` and hands off to the
    **existing** `createChallenge()` unchanged, starting tomorrow for the same duration. A
    rematch is exactly as safe as a from-scratch challenge, not a second write path.
- `src/app/(app)/buddies/[id]/GraceButton.tsx` + `RematchButton.tsx` (new, client) — on the
  buddy scoreboard: a "Use a grace token for today" button (disabled once used this period,
  computed via a new `graceUsedThisPeriod()` helper in `page.tsx`) inside the Today card, and
  a "Run it back" button (shown once `board.endDate < board.callerToday`) that shows the new
  invite link on success, same copy-link pattern as the original wizard.
- `src/app/(app)/buddies/[id]/page.tsx` — a new "This week" card (weekly totals bar + a
  `WeeklyRecapLine` showing the best day from the trailing-7-day heat strip and the weakest
  scored rule this week, both computed from data the scoreboard already returns).
- `src/app/(app)/buddies/StakeLedger.tsx` (new, client) + `buddies/page.tsx` — a "Stake
  ledger" section listing every ended, staked challenge's outcome ("You owe them: <stake>" /
  "They owe you" / "Tied"), with a "Mark settled" button that disappears once your side is
  confirmed and shows "Settled ✓" (struck through) once both sides are.
- `src/app/(app)/page.tsx` (Home) — a new "Today vs your buddies" section: one line per active
  challenge reusing `getMyActiveChallenges()`/`getScoreboard()`, reading today's score straight
  off the tail of each participant's existing `heatStrip` (no new scoring path) and respecting
  blind mode's hidden-today lock (🔒) for the buddy's side.
- Verified functionally against the real database (throwaway fixtures between the two real
  accounts, cleaned up after — same pattern as every prior DB-backed step):
  - Grace tokens: a second grace day inside the same 30-day period correctly hit the unique
    constraint; a third 35 days later (a new period) correctly succeeded; the RLS policy's
    exact date expression was checked against a real profile's real timezone
    (Asia/Kolkata) and matched the expected date.
  - Stakes: `mark_stake_settled` correctly flipped only the caller's own column (the winner
    calling it twice never touched the loser's column), and the row read back with both sides
    settled once each had called it as themselves.
  - **One hard platform limit surfaced and is disclosed rather than routed around**: this
    verification harness runs everything through `exec_sql`, itself `security definer`, and
    Postgres flatly refuses `SET ROLE` inside a security-definer function ("cannot set
    parameter 'role' within security-definer function") — a real, permanent restriction, not
    a bug to fix. That means the plain-RLS **insert** policies on `challenge_grace_days` and
    `challenge_stakes` (the "must be today," "must be your own side," "challenge must have
    already ended" checks) could not be exercised as a genuinely non-bypassing role from this
    session, only reviewed by inspection and cross-checked with a plain date computation.
    Every `security definer` RPC (`mark_stake_settled`, and everything from prior steps) was
    unaffected, since those only ever read `auth.uid()` from the `request.jwt.claims` GUC
    regardless of caller role.
- Verified live in the browser (temporary unauthenticated route rendering `GraceButton`,
  `RematchButton`, and `StakeLedger` directly with mock data, removed after checking): both
  grace-button states, the rematch button, and all three stake-ledger outcomes (owe/owed/tied,
  with the right settle-button visibility) rendered with the expected copy.
- `npx tsc --noEmit`, `npx eslint src`, `npx vitest run` (53/53 — the 51 from before plus 2
  new grace-exclusion tests) and `npx next build` all clean.
- **Not yet verified end-to-end with two real logged-in users tapping through the actual UI**
  (including the RLS enforcement gap noted above) — same gap as every prior buddy-flow step.

## Community — Step C1 done (migration applied)

- **C1 — community tables + closing the verification hole** (done, migration applied):
  - `supabase/step18_communities.sql` — **applied** via `scripts/run-sql.mjs`. Nothing
    existing touched (`communities`/`community_members` are brand new tables), so it was
    safe to run alongside real data.
    - `communities` (`name`, `description`, `visibility` `'public'|'private'`, `admin_id`,
      `template_challenge_id` nullable — pointing at the admin-authored `challenges` row
      Step C2 creates, `created_at`).
    - `community_members` — `(community_id, user_id)` composite PK, `role`
      `'admin'|'member'`, `status` `'member'|'requested'|'removed'`, `joined_at`.
      `'requested'` deliberately gets no `challenge_participants` row (so a pending
      requester never scores or appears on the leaderboard until Step C4 approves them);
      `'removed'` keeps the row rather than deleting it, matching
      `challenge_participants.status='left'`'s "don't destroy history" pattern.
    - `is_community_member(community_id)` / `is_community_admin(community_id)` —
      `security definer` helpers mirroring `is_challenge_participant`, used in every
      policy instead of a self-referencing subquery on `community_members`.
    - RLS: a public community's row is readable by any authenticated user (that read *is*
      the discovery feature — Step C3), a private one only by its members/admin; only the
      admin can update the community row. `community_members` is readable by fellow
      members, the admin, and yourself; **no insert/update policy yet** — joining
      (Step C3), approving (Step C4), and removal all need to touch `community_members`
      *and* `challenge_participants` together, which is a `security definer` RPC job
      (the `accept_challenge_invite`/`propose_challenge_change` pattern), not a policy
      that could only ever do half the work.
  - **Tightened the `verifications` insert policy from step16** — the part of this step
    that was easy to miss but not optional. It previously let anyone sharing *any*
    `challenge_participants` row with an entry's owner flag that entry; the moment a
    community challenge exists, that join means every member of a group can flag every
    other member's entries (and a flagged entry scores 0 until resolved). **Decision,
    written into `step18_communities.sql`'s own comment**: restricted the join to
    `challenges.kind = 'buddy'`. Buddy verification is a two-person trust mechanic by
    design (`docs/PLAN-V2.md` §4, layer 5) — a 50-person leaderboard has no single "the
    other side" to vouch for you; group-level moderation, if ever wanted, is a
    not-yet-built admin-specific feature, not something every member gets transitively.
    The `select` policy (who can *read* a verification) is untouched.
  - **Verified applied**: `communities`/`community_members` exist and are empty
    (`verify.mjs`).
  - **Verified functionally against the live DB** (`security definer` helpers, which read
    `auth.uid()` from the `request.jwt.claims` GUC and so work fully in this harness — see
    the `SET ROLE` limitation below): a throwaway `do $$` fixture (an admin + a
    'requested' member on a private test community, cleaned up in the same run) proved
    `is_community_admin`/`is_community_member` correctly distinguish admin vs. non-member,
    that a `status='requested'` row does **not** count as a member yet, that flipping it to
    `'member'` makes it count, and that `'removed'` stops counting again. Separately
    confirmed via `pg_policy` that the old unrestricted verification-insert policy is gone
    and the new one's `with check` expression contains `kind = 'buddy'`.
  - **Reviewed but not exercised as a non-bypassing role**: the plain-RLS policies on
    `communities`/`community_members` themselves (the public/private select rules, the
    admin-only update rule) and the tightened `verifications` insert policy's actual
    enforcement — this harness runs everything through `exec_sql`, itself `security
    definer`, and Postgres refuses `SET ROLE` inside a security-definer function, exactly
    the platform limit V2 Step 13 already hit and documented. Only reviewed by inspection
    and cross-checked against the intended logic, same disclosure V2 Step 13 made for
    `challenge_grace_days`/`challenge_stakes`.
  - No UI yet, as planned — same "pure schema step" shape as V2 Step 3. Next: **C2**,
    creating a community (see `docs/PLAN-COMMUNITY.md`).

- **C2 — creating a community** (done, migration applied):
  - **Paid the reuse debt first, as instructed.** The per-rule editing UI (scope toggle,
    target/min/max, gym schedule, weight/proof/advanced) existed twice —
    `NewChallengeWizard.tsx`'s per-rule cards and `ChangeRequestPanel.tsx`'s `RuleFields` —
    and was about to exist a third time here. Lifted it into
    `src/components/RuleEditor.tsx`: `RuleEditor` (owns everything about editing one
    `RuleDraft`'s fields, including the gym-mode flip button, self-contained — callers just
    pass `rule`/`onChange`/`showAdvanced`) and `MetricPicker` (the "+ Add a rule" metric
    dropdown, identical in all three places). `WEEKDAYS` also moved here. Both
    `NewChallengeWizard.tsx` and `ChangeRequestPanel.tsx` were rewired to use these instead
    of their own copies — `ChangeRequestPanel`'s `RuleFields` component is gone entirely.
    One deliberate, harmless behavior change from the lift: the change-request panel now
    also shows the requires-proof checkbox, the gym fixed-days/flexible switch, and the
    scope-locked explanatory note, which its old cut-down `RuleFields` never rendered —
    strictly additive, nothing removed.
  - Also lifted `validateRule`/`ruleRowFields`/`RuleInput`/`DATE_RE`/`toRuleInput` out of
    `challenges/actions.ts` and into the plain `challenges/types.ts` module, since
    `communities/actions.ts` needed the exact same validation and couldn't import a value
    from a `"use server"` file (only async functions/types may be exported from one — the
    Step 5 bugfix rule). `actions.ts` now imports them back and re-exports the `RuleInput`
    type for existing callers. `toRuleInput` (the `RuleDraft` → `RuleInput` reshape) was
    duplicated identically in both UI files too; it's now one function three call sites share.
  - `supabase/step19_community_create.sql` — **applied** via `scripts/run-sql.mjs`. Closes
    a gap C1 left on purpose: `community_members` had no insert policy at all, because
    ordinary joining/approval need a `security definer` RPC (cross-table writes). But
    `createCommunity()` needs exactly one write RLS *can* express safely — the community's
    own admin inserting themselves as its first member, right after creating it. Added a
    narrow policy for exactly that (`user_id = auth.uid()` and the community's
    `admin_id = auth.uid()`), reasoned through in the file's own header comment.
  - `src/lib/communities/types.ts` (plain module) — `Community`, `CommunityVisibility`.
  - `src/lib/communities/actions.ts` — `createCommunity(input)`, following the plan's exact
    write order: `challenges` (`kind='community'`, `status='draft'`) → the admin's own
    `challenge_participants` row → `challenge_rules` (+ `challenge_rule_targets` for
    `scope='own'` rules, the admin's own numbers) → flip `challenges.status` to `'active'`
    → the `communities` row (`template_challenge_id` pointing at the challenge) → the
    admin's `community_members` row. Reuses `validateRule`/`ruleRowFields` unchanged, same
    as `createChallenge`. Defaults `settings: { blind_mode: false }` on the challenge —
    Step C5's own documented recommendation ("the leaderboard is the point"), baked in now
    since it costs nothing and the per-challenge toggle still exists in the data model if
    that default is ever revisited. Also `getMyCommunities()` — the communities a user
    already belongs to, the same narrow "what am I already in" scope
    `getMyChallengesByBuddy()` has for Buddies before its own discovery step.
  - `src/app/(app)/community/new/` — `NewCommunityForm.tsx` (client) + `page.tsx`. A short
    form, not a six-screen wizard, as specified: name, description, a public/private pill
    toggle, start/end dates, then the rule cards (reusing `RuleEditor`/`MetricPicker`
    exactly like the wizard's rules screen). Client-side rule validation calls the same
    `validateRule` the server re-checks rather than a second copy of "is this rule valid"
    logic. On success, shows a confirmation card and a link back to `/community`.
  - `src/app/(app)/community/page.tsx` — no longer a pure placeholder: a "New community"
    header button (same pattern as Buddies' "New challenge"), and a "Yours" list (name,
    Admin badge, public/private) via `getMyCommunities()` when the user belongs to any.
    The rest of the placeholder copy stays, now noting that browsing/joining others'
    communities is next. No new route needed in `src/proxy.ts` — `/community/new` is
    already covered by the existing segment-aware `/community` protected-route match.
  - **Verified functionally against the real database**: a throwaway `do $$` fixture
    (cleaned up after) walked the exact same insert sequence `createCommunity()` performs —
    a community-kind challenge, the admin's participant row, one `shared` rule, one `own`
    rule with the admin's own target, flipping the challenge to `active`, the `communities`
    row, and the admin's `community_members` row — and asserted every resulting relationship
    (challenge active, community points at it, admin is an accepted owner participant *and*
    an admin member, the own-scope target recorded). Separately confirmed via `pg_policy`
    that the new `community_members` insert policy's check expression covers both
    `user_id = auth.uid()` and the community's `admin_id = auth.uid()`.
  - **Reviewed but not exercised as a non-bypassing role**: same `SET ROLE` limitation as
    C1 and V2 Step 13 — this harness can't prove the new policy actually *rejects* someone
    inserting a membership row for a community they don't admin, or for a user that isn't
    themselves; only that the happy path succeeds and the check expression reads correctly.
  - `npx tsc --noEmit`, `npx eslint src`, `npx vitest run` (53/53, unchanged — no new pure
    logic this step) and `npx next build` all clean; the build's route list includes
    `/community/new`.
  - **UI not verified in the browser this session** — the in-app browser tooling was
    unresponsive (navigation/preview calls timed out) after a working dev server was
    confirmed running on :3000. The usual temporary-unauthenticated-route pattern (render
    `NewCommunityForm` directly, check it renders and that submitting round-trips to the
    real action) was set up and then removed again without being exercised. Whoever
    picks this up next should manually check `/community/new` renders correctly and that
    a real logged-in user can create a community end-to-end before starting C3.

## C2 verification note (start of the C3+C4 session)

Before starting C3, this session was asked to manually verify C2 end-to-end in a live
browser first (create a community at `/community/new`, see it on `/community`). The in-app
browser preview tooling was unresponsive again — `navigate` timed out/was denied on every
attempt (`localhost:3000`, the autoPort fallback, `127.0.0.1`), the same issue C2's own
session hit. Also discovered mid-session: `next dev` was already running on port 3000 from
another session (PID 11504) — Next 16 refuses a second instance, so the autoPort fallback
this session's `preview_start` spun up never got a chance to serve anything useful anyway.
Per the user's explicit call, live-browser verification was skipped rather than faked; what
*did* verify this session was `npx tsc --noEmit`, `npx eslint src`, `npx vitest run`, and
`npx next build`, all clean, plus the throwaway-DB-fixture pattern below for the new RPCs.
**C2's UI is still not confirmed in a real browser** — whoever picks this up next with a
working preview should check `/community/new` and `/community` for real before trusting the
create-a-community flow's client side blindly.

- **C3 — discovery and joining** (done, migration applied):
  - `supabase/step20_community_join.sql` — **applied** via `scripts/run-sql.mjs` (new
    functions only, nothing existing touched). `join_community(community_id, own_targets)`:
    `visibility='public'` writes a `community_members` row (`status='member'`) **and** a
    `challenge_participants` row (`status='accepted'`) in one call — `challenge_participants`'
    own insert policy is creator-only, so a joining member could never do this themselves via
    a plain policy. `visibility='private'` writes only the `community_members` row
    (`status='requested'`) and a `community_join_requested` notification to the admin — no
    participant row, so a requester doesn't score or appear on a future leaderboard until
    approved. `own_targets` (any `scope='own'` rule's number) are written to
    `challenge_rule_targets` in **both** branches up front, exactly like
    `accept_challenge_invite` does for buddy invites, so an approved request never needs a
    second round trip to collect them.
  - **Extra piece the plan's own C2 note forced**: `docs/PLAN-COMMUNITY.md` says private
    communities are "found and requested, not linked" (an invite link is explicitly deferred
    to phase 2) — but `step18_communities.sql`'s own RLS makes a private community invisible
    to non-members at the table level, so there was no way to *find* one at all without some
    RPC. Added `search_communities(query)`: `security definer`, matches by name
    (`ilike '%query%'`) across **both** public and private communities, returning only
    name/description/visibility — never the roster or rules — for anyone who already knows
    (or guesses) part of the name. Consequently also **relaxed `community_detail`**: it no
    longer 404s a private community for a non-member, since search already surfaces its name
    to a stranger and hiding the rules after that would strand them with a name and nothing
    else. What stays gated to admin/member is the roster and the pending-requests list, never
    the rules or the community's existence — both changes and the reasoning are written into
    the SQL file's own header comment.
  - `src/lib/communities/types.ts` — `CommunityMemberSummary`, `PendingRequestSummary`,
    `MyCommunityStatus`, `CommunityDetail`. `CommunityDetail.rules` reuses `InviteRule` from
    `challenges/actions.ts` (type-only import — allowed from a `"use server"` file, see the
    Step 5 bugfix note) rather than redefining an identical shape, since `community_detail`'s
    JSON matches `challenge_invite_preview`'s field names on purpose.
  - `src/lib/communities/actions.ts` — `getBrowsableCommunities()` (public communities minus
    ones the user already admins/is a member or requester of — the plain-RLS-readable list),
    `searchCommunities(query)`, `getCommunityDetail(id)`, `joinCommunity(id, ownTargets)`.
  - `src/app/(app)/community/page.tsx` — "Yours" list items now link to `/community/[id]`; a
    new "Browse public communities" list (from `getBrowsableCommunities`); a new
    `SearchCommunities.tsx` (client) search-by-name box underneath, wired to
    `searchCommunities` via `useTransition`, for the private-community path.
  - `src/app/(app)/community/[id]/page.tsx` (new) — the detail screen: visibility/admin
    badges, description, the rule list (via a local `describeRule`, following the existing
    precedent of small per-screen copies in `join/[token]/page.tsx` and
    `NewChallengeWizard.tsx` rather than extracting a third one for a ~10-line function), and
    branches on `myStatus`: `'requested'` shows a waiting note; `'none'`/`'removed'` renders
    `JoinCommunityActions` (new client component, own-target inputs pre-filled from the
    user's own recommendations exactly like `join/[token]`'s `JoinActions`, labeled
    "Join"/"Request to join" by visibility).
  - Verified functionally against the real database (throwaway `do $$` fixture between the
    two real accounts, cleaned up after — confirmed via `verify.mjs` that no `__verify_*` rows
    remain): `search_communities` found both a public and a private test community by partial
    name; `community_detail` returned a private community's rules to a non-member stranger
    with `myStatus: 'none'`; `join_community` on the public community wrote both rows and the
    `scope='own'` target in one call, and rejected a second join with "You are already a
    member."; `join_community` on the private one wrote only the `requested` row (no
    participant row) and a `community_join_requested` notification, and rejected a second
    request with "Your request is already pending."
  - **Reviewed but not exercised as a non-bypassing role**: same `SET ROLE` limitation as
    every prior community/buddy step — every function above is `security definer` and reads
    `auth.uid()` from the `request.jwt.claims` GUC, so it *was* fully exercisable in this
    harness (unlike a plain RLS policy would have been).
  - `npx tsc --noEmit`, `npx eslint src`, `npx vitest run` (53/53, unchanged — no new pure
    logic this step) and `npx next build` all clean; the build's route list includes
    `/community/[id]`. A brand-new dynamic route needed `npx next typegen` run once before
    `tsc` would recognize `PageProps<"/community/[id]">` — not needed going forward since
    `next dev`/`next build` regenerate it automatically.
  - **UI not verified in a real browser** — see the note at the top of this section.

- **C4 — approvals and membership management** (done, migration applied, same
  `step20_community_join.sql` as C3):
  - `respond_to_join_request(community_id, user_id, approve)` — admin-only (checked, and
    verified rejected for a non-admin caller). Approval flips `community_members.status` to
    `'member'` **and** inserts the `challenge_participants` row (the half that makes them
    start being scored) plus a `community_join_approved` notification to the requester.
    Decline sets `community_members.status = 'removed'` (there's no separate "declined"
    status in the schema — a declined request and a removed former member both mean "not in,
    history/attempt preserved," so one status covers both) plus a
    `community_join_declined` notification.
  - `remove_community_member(community_id, user_id)` — admin-only, rejects removing yourself
    (the message says to delete the community instead — deleting one isn't built, out of
    scope). Sets `community_members.status='removed'` **and**
    `challenge_participants.status='left'`, same "don't destroy history" pattern
    `challenge_participants.status='left'` already uses for Buddies.
  - `leave_community(community_id)` — self-service version of the same two-row effect;
    rejects the admin (leaving would strand the community with no admin — deletion/handoff is
    out of scope, noted in `docs/PLAN-COMMUNITY.md`'s own "Later" list).
  - **Notifications generalized rather than left Buddies-only**: added
    `community_join_requested` / `community_join_approved` / `community_join_declined` to
    `NotificationKind` (`src/lib/notifications/types.ts`), plus
    `BUDDY_NOTIFICATION_KINDS`/`COMMUNITY_NOTIFICATION_KINDS` bucket constants.
    `getUnreadSections()` (new, `notifications/actions.ts`) replaces the old single
    `getUnreadCount() > 0` boolean with `{ buddies, community }`, and
    `markCommunityNotificationsRead(communityId)` mirrors the existing
    `markChallengeNotificationsRead`. **`TabBar.tsx`'s dot moved off "always Buddies"**: it now
    takes `unread: { buddies?; community? }` and renders on whichever tab a `UNREAD_HREF`
    lookup maps the section to — exactly the "move it to whichever tab the notification's
    payload points at" instruction. `(app)/layout.tsx` fetches `getUnreadSections()` instead
    of `getUnreadCount()`. `getUnreadCount()` itself is untouched/still used nowhere else
    right now but left in place (harmless, matches getters like it elsewhere in the app that
    outlive one particular caller).
  - `src/app/(app)/community/[id]/page.tsx` — admin-only "Pending requests" section
    (Approve/Decline, same server-action-bound-form idiom `/buddies` already uses for friend
    requests) and a "Members" list (visible to any member or the admin) with a per-row
    "Remove" button for the admin (hidden on the admin's own row). A "Leave community" link
    for plain members; a one-line explanation instead of a leave option for the admin.
    `markCommunityNotificationsRead(id)` is called whenever a member/admin opens the page —
    same "opening the screen is reading its notifications" convention `/buddies/[id]` already
    uses.
  - Verified functionally against the real database, extending the same C3 throwaway fixture:
    a non-admin calling `respond_to_join_request` was rejected with "Only the admin can
    respond to requests."; the admin's approval flipped both rows and sent the right
    notification; `remove_community_member` flipped both rows to removed/left and rejected
    the admin trying to remove themselves; `leave_community` flipped both rows for a plain
    member and rejected the admin trying to leave their own community. All assertions passed
    (the fixture's own cleanup ran, confirmed via `verify.mjs` finding zero leftover
    `__verify_*` rows — if any `raise exception` had fired, the whole `do $$` block would have
    aborted and the cleanup at its end would never have run).
  - `npx tsc --noEmit`, `npx eslint src`, and `npx vitest run` (53/53) all clean; `npx next
    build` unaffected (no new route this step, `/community/[id]` already existed from C3).
  - **UI not verified in a real browser** — see the C2/C3 note above; the tab-bar dot's
    per-section routing, the pending-requests approve/decline buttons, and the
    remove/leave buttons are all unexercised in an actual browser this session.

## C3/C4 verification note (start of the C5+C6 session)

Before starting C5+C6, this session was asked to manually verify C3 and C4 end-to-end in a
live browser first. The in-app browser preview tooling timed out on `preview_start` and
`navigate` (twice, against the dev server already running on :3000 from another session,
PID 11504) — the same failure the C2/C3/C4 session hit twice in a row. Per the user's
explicit call (asked directly rather than assumed), live-browser verification was skipped
again rather than faked. **C3 and C4's UI are still not confirmed in a real browser** —
whoever next has a working preview should log in as two real accounts and walk the checklist
this step was asked to run: create a community at `/community/new` and see it listed on
`/community`; the "Browse public communities" list and name-search box; a second account
joining a public community instantly and requesting to join a private one; the admin seeing
and approving/declining the pending request at `/community/[id]`; the tab-bar's unread dot
landing on the Community tab (not Buddies) for a `community_join_*` notification; and a
member leaving while the admin cannot.

- **C5 — the leaderboard and group aggregate** (done, migration applied):
  - `src/lib/challenges/rollup.ts` — `groupAggregate(scores)`, a small pure addition (plain
    unweighted mean of already-computed totals, rounded, 0 for an empty list) — 3 new tests in
    `rollup.test.ts` (mean-and-round, a single member, the empty-list zero-guard).
  - **Reuse debt paid first**: `getScoreboard()`'s rule-resolution helper (`resolveRule`,
    "scope='own' with no target yet gets pinned to a far-future `effective_from` so it's
    excluded rather than scored against a fabricated 0") was private to
    `challenges/actions.ts`. Moved it — and its `RawResolvableRule` input type — into the
    plain `challenges/types.ts` module (same reason as every other pure helper living there:
    a `"use server"` file may only export async functions) so `communities/actions.ts` could
    reuse it unchanged instead of writing a near-identical copy for the leaderboard.
  - `supabase/step21_leaderboard.sql` — **applied** via `scripts/run-sql.mjs`. Three pieces,
    with the two decisions Step C5 asked for written into the file's own header:
    - **Scale decision**: `challenge_scoreboard` returns every participant's full per-metric
      history for the whole range — nothing for two people, wasteful for fifty. Chosen: **cap
      community size at 20 accepted members** (simplest, honest for a personal app) rather
      than windowing the return or precomputing. `join_community` and
      `respond_to_join_request` are both `create or replace`d again (same functions as
      step20) with that cap checked at the one moment each turns a request into an accepted
      member.
    - **Blind mode decision**: already defaults off for `kind='community'` since C2's
      `createCommunity` (`settings.blind_mode: false`) — "the leaderboard is the point." The
      new `community_leaderboard` RPC still honors the per-challenge toggle exactly like
      `challenge_scoreboard` (withhold a non-caller member's today-value until the caller has
      logged today), in case an admin turns it on anyway — a default and a copy decision, not
      a code one.
    - `community_leaderboard(p_community_id)` — modeled directly on `challenge_scoreboard`,
      same design boundary (resolved rules/targets and logged *values* leave the database,
      never raw `log_entries` rows), restricted to a member or the admin
      (`is_community_member`/`communities.admin_id`).
    - `admin_edit_community_rule(...)` — folded into this same migration because C6's own
      "decide whether change requests apply to communities" landed on "the admin edits
      directly, no approval flow," and that decision needed the same close-and-replace
      guard-respecting write path `respond_challenge_change` already uses for buddies (old
      rule's `effective_to` set, replacement starts **tomorrow**, never today — anti-cheat
      rule #1 holding for admin edits too). **Bug caught by this session's own verification,
      fixed before landing**: closing a rule with `effective_to = current_date` breaks when
      the rule was itself added earlier the same day and hasn't gone live yet
      (`effective_from` is tomorrow) — `current_date < effective_from` violates the table's
      own `effective_to >= effective_from` check. Fixed to
      `effective_to = greatest(current_date, effective_from)`, so a same-day add-then-remove
      closes the rule at its own start date (zero live days) instead of raising a constraint
      violation. **Deliberate limitation, written into the file**: add/edit only supports
      `scope='shared'` — a community's `scope='own'` rules are set once per member at join
      time, and there's no re-entry flow yet for an admin's mid-challenge edit to collect
      every existing member's new own-number the way a two-person buddy change request can.
      Enforced in TypeScript (`editCommunityRule`), not SQL, per this project's own
      "validation stays in TypeScript" convention.
  - `src/lib/communities/types.ts` — `LeaderboardMember`/`LeaderboardResult` (scores, role,
    badges, trust score — never raw log values, matching `ScoreboardParticipant`'s own
    privacy shape).
  - `src/lib/communities/actions.ts` — `getCommunityLeaderboard(communityId)`: calls the RPC,
    reshapes into `ResolvedRule[]`/`RuleLog` per member via the now-shared `resolveRule`, calls
    the **existing, unchanged** `rollupChallenge`/`findSuspiciousStreaks`/`groupAggregate`,
    ranks members by total descending. `editCommunityRule(communityId, input)`: validates via
    the existing `validateRule`, rejects `scope !== 'shared'` with a clear message, computes
    `target`/`min`/`max` via the existing `ruleRowFields` before calling the RPC (SQL just
    writes already-shaped values, same convention `createCommunity`/`createChallenge` use).
  - `src/app/(app)/community/[id]/page.tsx` — a `Leaderboard` section (ranked member bars, a
    bold "The group" aggregate bar below them, then a per-rule breakdown), shown to any member
    or the admin. `src/app/(app)/community/[id]/CommunityRulePanel.tsx` (new, client,
    admin-only) — reuses `RuleEditor`/`MetricPicker` (lifted in C2) for edit/add/remove, with
    an inline note on `scope='own'` rules explaining they can't be edited here yet.
  - **Verified functionally against the real database** (throwaway `do $$` fixture between
    the two real accounts, cleaned up after — confirmed via `verify.mjs` finding zero leftover
    `__c5c6_verify_*` rows): a community + template challenge + a shared `at_least` protein
    rule, both accounts logged different values; `community_leaderboard` called as the admin
    returned both members with the right shape; called as a random non-member id returned
    `{error: 'not_member'}`; `admin_edit_community_rule` correctly rejected a non-admin caller
    ("Only the admin..."), correctly closed-and-replaced the protein rule (old row's
    `effective_to` = today, replacement live from tomorrow at the new target), correctly added
    a new rule live from tomorrow, and correctly removed it again (this is what surfaced the
    `greatest()` bug above — the first run failed here before the fix). The day-lock trigger
    was temporarily disabled to backdate the fixture's log entries and confirmed re-enabled
    afterward (`pg_trigger.tgenabled = 'O'`), same technique every prior DB-verification step
    uses.
  - **Reviewed but not exercised**: the 20-member cap (can't simulate 20 real accounts in this
    harness; the count-and-reject logic was reviewed by inspection, same disclosure style as
    every other hard-to-simulate constraint in this project) and the plain-RLS reads on
    `communities`/`community_members` (same `SET ROLE` platform limit every prior step has
    hit — every function touched this step is `security definer` and was fully exercisable).
  - `npx tsc --noEmit`, `npx eslint src`, `npx vitest run` (56/56 — the 53 from before plus 3
    new `groupAggregate` tests), and `npx next build` all clean.
  - **UI not verified in a real browser this session** — see the C3/C4 note above; the
    leaderboard bars, group-aggregate bar, and the admin rule-edit panel are all unexercised
    in an actual browser.

- **C6 — wiring Community into the rest of the app** (done):
  - **Confirmed, not assumed**: `getMyActiveChallenges()` never had a `kind` filter — a
    community challenge already flowed into `/progress`'s tracked-metric union for free. Added
    a `kind` field to `ActiveChallengeSummary` (additive, every existing caller unaffected) so
    downstream code can *branch* on it where that turns out to matter (see the next two
    points) — the confirmation itself required no behavior change, only the extra field to
    prove it with.
  - **Fixed a real bug this step's own reading surfaced, beyond the one the plan named**:
    `/progress`'s "Your challenges" cards all linked to `/buddies` unconditionally, even for a
    community challenge — harmless before C5 (nothing lived at `/community/[id]` yet worth
    finding), actively wrong now. Fixed using the new `kind` field: a community card links to
    `/community`, a buddy card still links to `/buddies`.
  - **Fixed Home's `getTodayMatchups()`** (the bug the plan explicitly named):
    `participants.find(p => !p.isCaller)` assumed exactly two participants, which a
    twenty-member community would silently break by picking one arbitrary "opponent." Took
    the more interesting of the plan's two suggested fixes: a buddy challenge keeps its exact
    you-vs-them line; a community challenge instead shows **"you vs the group average"** —
    `groupAggregate()` over every *other* member's today score, with a hidden (blind-mode)
    member's today excluded from the average rather than treated as 0. Renamed the section
    "Today vs your challenges" and generalized `buddyLabel` → `opponentLabel` ("the group" for
    communities) to match.
  - **Confirmed the buddy-only paths stay buddy-only, as instructed**: `getMyChallengesByBuddy()`
    and `getStakeLedger()` both still filter `.eq("kind", "buddy")` — re-checked by reading
    both functions again after this session's own changes, unaffected.
  - **Change requests for communities**: decided (see C5's SQL note above) — the admin edits
    directly via `admin_edit_community_rule`, no buddy-style propose/approve flow, with the
    immutable-rule guard and anti-cheat rule #1 (never retroactive) both still enforced.
  - `npx tsc --noEmit`, `npx eslint src`, `npx vitest run` (56/56, unchanged — no new pure
    logic this step beyond C5's `groupAggregate`), and `npx next build` all clean.
  - **Not yet verified end-to-end with two real logged-in users tapping through the actual
    UI** — same gap as every prior buddy/community step; see the C3/C4 note above for what
    still needs a working browser preview, plus (new this step): logging protein and
    confirming it visibly moves both a buddy challenge and a community challenge's numbers,
    and that Home renders the "vs the group" line sensibly with a real community in play.

## Community build order — `docs/PLAN-COMMUNITY.md`

Buddies is feature-complete through the full `rippling-leaping-pie.md` build order.
Community (`docs/PLAN-V2.md` §6) is split into six one-chat steps in
**`docs/PLAN-COMMUNITY.md`** — read that file's next unstarted step to pick this up cold.
It reuses `challenges` with `kind='community'` throughout (no parallel schema), so the work
is mostly new UI plus an admin-locked access layer:

- **C1** — done, see above.
- **C2** — done, see above (UI still not verified in a real browser — see the note above).
- **C3** — done, see above (UI still not verified in a real browser — see the note above).
- **C4** — done, see above (UI still not verified in a real browser — see the note above).
- **C5** — done, see above (UI still not verified in a real browser — see the note above).
- **C6** — done, see above. **All six Community steps are now built.** The one thing left
  before calling Community finished is a real human, in a real browser, on two real accounts,
  walking every screen — the in-app browser preview tooling has now failed three sessions in
  a row (C2's session, the C3+C4 session, and this one), so that check keeps deferring to
  whoever next has a working preview.

## Conventions established so far

- Package manager: npm
- App Router with `src/` directory, import alias `@/*`
- Turbopack enabled for dev
- Tailwind v4 (CSS-based config via `postcss.config.mjs`, no `tailwind.config.js`)
- Proxy/middleware file is `src/proxy.ts` (Next 16 convention), exporting `proxy`, not
  `middleware`.
- Supabase env vars are `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` (anon
  key is safe to expose client-side by design).
- No Supabase CLI/migrations in this project — DB schema changes live as SQL files under
  `supabase/` and get pasted into the dashboard's SQL Editor by hand (see Step 4).
- A `"use server"` file may only export async functions (plus types, which are erased and don't
  count). Shared constants/enums used by both a feature's server actions and its client
  components live in a separate plain file (e.g. `src/lib/profile/types.ts`), never in the
  `actions.ts` file itself — see the Step 5 bugfix above for what goes wrong otherwise.
