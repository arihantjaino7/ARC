# ARC V2 — Buddies, Community, Personal, Home, Settings

This supersedes the "20-step" plan from Step 11 onward. Steps 1-10 (auth, profile,
recommendation targets, scoring engine, goals, logs, score page, friends) stay and get
absorbed into the new shell. Read `PROGRESS.md` first for what already exists.

---

## 1. What changes structurally (and why)

Two foundations from Steps 7-9 do not survive contact with this spec:

### 1.1 Logs must become generic, not five fixed columns

`public.logs` today has exactly `calories, protein_g, water_ml, sleep_hours, gym_done`.
The spec says two buddies can invent *any* challenge ("other than gym any challenge they
want to add"). Steps, pushups, screen time, weight, reading, no-sugar days — none fit.

**Decision:** a metric catalog + a key/value entry table.

- `metrics` — the vocabulary. Built-in rows (calories, protein, water, sleep, gym,
  steps, weight, workout_minutes...) plus user-created custom metrics. Each carries
  `key`, `label`, `unit`, `value_type` (`number` | `boolean` | `duration`), and a
  `default_shape` hint so the challenge builder can pre-fill sensibly.
- `log_entries` — one row per (user, day, metric). Replaces the five columns.
- `logs` stays as the *day* row: owns `log_date`, the user's timezone at write time,
  `locked_at`, and a free-text note. Entries hang off it.

This is what makes Section 3 work at all: the Personal Dashboard shows the **union of
every metric required by every active challenge**, deduped. Two buddy challenges and a
community challenge that all care about protein = **one** protein field. You log it once,
it fans out to all three. No challenge is ever missing from that screen, because the
screen is generated *from* the challenges rather than hand-maintained.

Migration is easy — `step8_logs.sql` rows get copied into `log_entries` by column name.

### 1.2 Goals become "personal baseline"; challenges own their own rules

`public.goals` is your private, always-on targets. A challenge's rules are separate rows,
agreed by both sides, versioned, and never editable unilaterally. Your personal goals
pre-fill the challenge builder (that's what Step 5's recommendation engine is for) but
the two are not the same object.

The Step 6 scoring engine (`scoreGoal`, `calculateDayScore`) is reused unchanged — a
challenge rule is deliberately the same `{ shape, target, min, max, weight }` shape.

### 1.3 Navigation

Bottom tab bar, five slots, exactly as specified:

| Buddies | Community | **Home** | Progress | Settings |

Route map (old routes redirect, nothing is lost):

- `/` → Home. Motivation line + today's headline progress.
- `/buddies` → absorbs `/friends`.
- `/community`
- `/progress` → absorbs `/log`, `/score`, `/goals` as tabs within it.
- `/settings` → absorbs `/profile`.

---

## 2. Data model

```
profiles               (exists; + timezone, display_name, avatar_url, trust_score)
metrics                id, key, label, unit, value_type, default_shape, is_builtin, owner_id
logs                   id, user_id, log_date, tz, note, locked_at, updated_at
log_entries            id, log_id, user_id, log_date, metric_key, value_num, value_bool,
                       source ('manual'|'device'|'proof'), logged_at (server now()),
                       is_late, edit_count
log_edits              id, entry_id, old_value, new_value, edited_at      -- append-only

challenges             id, kind ('buddy'|'community'), name, created_by, start_date,
                       end_date, week_anchor, stake_text, status, settings jsonb
challenge_participants challenge_id, user_id, role ('owner'|'member'), status
                       ('invited'|'accepted'|'declined'|'left'), joined_at
challenge_rules        id, challenge_id, metric_key, shape, scope ('shared'|'own'),
                       target, min, max, weight, period ('daily'|'weekly'),
                       schedule jsonb, requires_proof, effective_from, effective_to,
                       created_by
challenge_rule_targets rule_id, user_id, target, min, max   -- used when scope='own'
challenge_change_requests id, challenge_id, kind ('add'|'edit'|'remove'), payload jsonb,
                       proposed_by, status, responded_by, responded_at, effective_from
challenge_invites      id, challenge_id, token, created_by, expires_at, accepted_by
verifications          entry_id, verifier_id, state ('ok'|'disputed'), note, created_at
proofs                 entry_id, storage_path, captured_at, uploaded_at
notifications          id, user_id, kind, payload jsonb, read_at
communities            id, name, description, visibility ('public'|'private'), admin_id,
                       template_challenge_id
community_members      community_id, user_id, role, status ('member'|'requested')
```

### Why `effective_from` / `effective_to` on rules

Rules are **never** edited in place once a challenge is active. An edit closes the old row
(`effective_to = today`) and opens a new one starting **tomorrow**. Consequences:

- Past days are always scored against the rules that were live on that day.
- Nobody can see a bad score and retroactively lower the target. This is anti-cheat rule #1
  and it costs nothing.

### Shared vs individual targets

Every rule row carries `scope`:

- `shared` — one number both people race against (e.g. "both hit 10,000 steps").
  Target lives on the rule.
- `own` — each side sets their own number (e.g. cutter at 1800 kcal vs bulker at 3200).
  Targets live in `challenge_rule_targets`, one row per participant.

This is exactly the "any specific number you want to enter, or both users use their own
individually" ask, and `own` is the mode that makes the whole app fair — the score is
*% of your own target*, so a 60kg cutter and a 90kg bulker can genuinely compete.

### Gym days and rest days

The gym rule is not a plain boolean — it carries a `schedule` in one of two modes:

1. **Flexible (default)** — "N sessions per week, any days." Scored weekly:
   `min(sessions_done / N, 1)`. Forgiving, zero setup, no rest-day bookkeeping.
2. **Fixed days** — pick weekdays (Mon/Wed/Fri/Sat). Scored daily, **but rest days are
   excluded from the denominator entirely** rather than scored as zero.

That exclusion is the important detail. If a rest day counted as a missed day, everyone's
score would be capped around 57% and the whole thing would feel broken. Rest days simply
don't produce a scored slot.

Each participant can have their own schedule (`scope='own'`) — a 6-day PPL split and a
3-day full-body split can compete on equal terms, because each is measured against their
own plan.

---

## 3. Section 1 — Buddies (build first)

### 3.1 Empty state

Fresh install shows exactly one screen: a headline, and two buttons — **Invite a buddy**
and **Enter an invite link**. Nothing else. No dashboard of zeros.

### 3.2 The invite flow (anti-overwhelm design)

Six screens, **one decision each**. This is the core UX fix for "the user should not feel
overwhelmed":

1. **Who** — pick an existing friend, or "send a link".
2. **What kind** — preset cards, not a blank form:
   - *Consistency 30* — gym 4x/week + sleep + water
   - *Cut Together* — calories ceiling + protein floor + gym
   - *Step War* — daily steps, shared number
   - *Custom* — start empty
3. **How long** — chips: 1 week / 30 days / 90 days / custom dates.
4. **The rules** — the preset's 2-4 rules, pre-filled from **your Step 5 recommended
   targets**, so the numbers are already personal and correct. Each row has one toggle:
   `Same number for both` vs `Each sets their own`. Tap "+ Add a rule" for more.
5. **Stake** (optional) — one line of text. "Loser buys coffee."
6. **Review & send** — one card, then a copyable link.

Everything else (rule weights, fixed-day gym schedules, proof requirements, blind mode)
lives behind a single **Advanced** disclosure on screen 4. The default path never sees it.

### 3.3 Receiving

The link `/join/<token>` works whether or not the recipient has an account — sign up, and
they land straight back on the invite. They see **one screen**: who invited them, the
duration, the rule list, the stake, and inline number inputs for any rule marked "each
sets their own" (pre-filled from their own recommended targets).

Three buttons: **Accept**, **Suggest changes**, **Decline**.

"Suggest changes" is worth having — a plain reject makes the inviter start over. It sends
the whole thing back as a change request with their edits, one round-trip.

### 3.4 Changing an active challenge

Exactly what was asked for: A proposes a new challenge/rule → B gets a notification →
B approves → it appears in both people's Personal Dashboard from **tomorrow**.

- Any add/edit/remove on an active challenge becomes a `challenge_change_requests` row.
- Both sides must consent. Nothing takes effect mid-day.
- Rejection is recorded so the proposer sees it resolved.
- Removing a rule ends it (`effective_to`) rather than deleting history.

### 3.5 Buddy detail screen (tap a buddy's name)

- **Overall bar** — two stacked horizontal bars, you vs them, 0-100% of own targets.
- **Per-rule bars** — one pair per rule, so you can see *where* you're losing.
- **Heat strip** — last 30 days, one cell per day per person, colored by day score.
  Rest days rendered as a neutral notch, not a gap.
- **Today** — who's logged, who hasn't. (With blind mode on, their number is hidden
  until you log yours.)
- **Badges** — per entry: `self-reported` / `device-verified` / `photo` / `late` /
  `edited 2x` / `disputed`.
- Buttons: propose a change, message, settle the stake.

---

## 4. Anti-cheat

The honest framing: in a two-person honor system you cannot *prevent* cheating, so the
design goal is to make it **visible, effortful, and socially awkward** — while adding
almost no friction for honest users. Seven layers, cheapest first.

1. **Server time only.** `logged_at` is `now()` from Postgres; `log_date` is derived from
   the user's stored IANA timezone. The client clock is never trusted. Changing your
   timezone is rate-limited and shows on your buddy's feed.

2. **Day lock.** You can edit today, and yesterday until 10:00 local. Then the day
   freezes (`locked_at`). This single rule kills the biggest cheat — backfilling a perfect
   month on the final day.

3. **Late + edit markers.** An entry written after its day closed is flagged `late`.
   Every edit appends to `log_edits` and bumps `edit_count`. The buddy's feed shows
   "logged 2 days late" and "edited 3x". Visibility is the deterrent; no score penalty
   needed, and no honest user is ever blocked.

4. **Plausibility flags.** Server-side sanity bounds per metric (8,000 kcal, 20h sleep,
   47,000 steps) auto-flag an entry as implausible. Plus a pattern check: a metric with an
   *identical* value for 14+ consecutive days is flagged "suspiciously consistent" —
   real logging is noisy, copy-paste is not.

5. **Buddy verification + dispute window.** Each of your buddy's days appears in your feed
   with a confirm / flag control for 48 hours. A disputed entry goes `contested` and is
   worth 0 until both sides agree. Consecutive clean verifications build a visible
   **Trust Score** on the profile — the carrot that makes the whole layer work.

6. **Proof, opt-in per rule.** A rule can require a photo (gym selfie, scale reading,
   food-log screenshot). Stored in Supabase Storage with a server-side `uploaded_at`;
   capture time read from EXIF and compared. Off by default — turned on only for rules
   where the pair actually wants it.

7. **Blind mode.** You cannot see your buddy's number for today until you've logged your
   own. Stops number-chasing ("they did 9,800, I'll say 9,900") entirely. One toggle,
   costs nothing, and is probably the single highest-value item on this list.

**Phase 2:** Apple Health / Google Fit / Strava import. Device-sourced metrics get a
`device-verified` badge; manual ones read `self-reported`. The badge system is built in
layer 3 *now* so the integration slots in later without a redesign.

---

## 5. Features worth adding that weren't asked for

- **Grace tokens.** One per 30 days per challenge, excuses a sick/injured day — but it
  must be declared *before* the day ends. Solves the honest-illness problem without
  opening a cheat door.
- **Stake ledger.** A running "who owes whom" across all completed challenges, settled
  only when both sides confirm. Makes "loser buys a treat" actually stick.
- **Who won today.** A one-line daily head-to-head on Home. Small, addictive, free.
- **Rematch.** When a challenge ends: "Run it back" clones the template in one tap.
- **Preset library** (screen 2 above) — the real answer to setup fatigue.
- **Weekly recap.** Sunday summary: your week score, theirs, best day, weakest rule.

---

## 6. Section 2 — Community (after Buddies)

Deliberately separate tables and a separate tab; a community challenge is never a buddy
challenge.

- One **admin** authors a challenge template. Members join that template read-only —
  `challenge_rules` for a community challenge are locked to `created_by = admin`, so
  member edits are impossible at the RLS level, not just in the UI.
- `visibility = 'public'` → join instantly. `visibility = 'private'` → `community_members`
  row lands as `status = 'requested'` and the admin approves.
- Group view: a leaderboard of member scores plus a single **group aggregate** bar
  (mean of member scores) so the community competes as a unit too.
- Individual member targets still use `scope='own'` where the admin allows it — otherwise
  a shared number for everyone.

---

## 7. Section 3 — Personal Dashboard

The point of the whole app. One screen, generated from data:

- **Today's inputs** — the deduped union of every metric required by every active
  challenge (buddy + community) *plus* your personal goals. Numeric fields, boolean
  tap-toggles, all on one form. Save once.
- **What this feeds** — under each field, small chips naming the challenges it counts
  toward ("Cut w/ Rahul · Step War · Morning Club"). This is how the user sees that
  nothing is being missed.
- **All challenges list** — every active challenge with its own progress bar, so 2 with
  buddy 1 + 2 with buddy 2 = 4 visible cards, always.
- **History** — the 30-day heat strip and per-metric trend.

---

## 8. Section 4 — Home

Motivation line + today's headline number + who-won-today + anything awaiting you
(invites, change requests, disputes). Deliberately thin — it's a launchpad.

## 9. Section 5 — Settings

Profile and body stats (existing `/profile`), recommended vs custom targets, timezone,
units (metric/imperial), notification preferences, blind mode default, privacy
(who can invite me), connected devices (phase 2), export my data, change password,
delete account, sign out.

---

## 10. Build order

1. **Shell** — bottom tab bar, five routes, redirects from the old ones.
2. **Metrics + log_entries migration** — generic logging, `/progress` logging one screen.
3. **Challenges core** — tables, RLS, the scoring rollup (reusing Step 6's engine).
4. **Buddy invite flow** — 6-screen builder, `/join/<token>`, accept / suggest / decline.
5. **Buddy detail** — comparison bars, heat strip, badges.
6. **Change requests** — propose, notify, approve, effective-tomorrow.
7. **Anti-cheat layers 1-5 + blind mode.**
8. **Personal Dashboard** — the deduped union view and challenge cards.
9. **Home.**
10. **Settings.**
11. **Community.**
12. Phase 2 — proofs, device sync, push notifications, stake ledger.

Steps 1-7 are "Buddies only", as requested.
