# Gym-Shym — Design language: "Moss"

Dark forest glass. Earthy, minimal, phone-only. This is the build order for the visual
pass, the same way `docs/PLAN-COMMUNITY.md` was the build order for Community.

**References the user gave:** PowerPeak Fitness (icon-tile layout, hero stat card,
floating nav), Hume Smart Home + Sentry Smart Home (design language: soft depth, muted
earth palette, generous radii, calm hierarchy).

**Direction confirmed with the user before writing this:** dark theme, whole app in
phases, `motion` (Framer Motion) allowed, live-browser verification with a test account.

---

## 0. Where the visuals actually start from

Worth stating plainly, because "UI pass" undersells it:

- `src/app/globals.css` is still the untouched `create-next-app` file — two variables,
  a `prefers-color-scheme` block, and `font-family: Arial, Helvetica, sans-serif`.
  **No font is loaded. The app renders in Arial.**
- There is no design system. Every screen inlines raw Tailwind `zinc-*` utilities with
  a `dark:` twin. `src/components/Screen.tsx` (`Screen`/`Card`/`EmptyState`) is the only
  shared primitive, and `Card` is one hardcoded `rounded-xl border bg-white` box.
- **Zero motion in the entire app.** The only two transitions that exist are
  `transition-colors` on tab labels and `transition-all` on the day-score bar.
- No manifest, no theme-color, no apple-touch-icon, no safe-area handling except one
  `paddingBottom` on the tab bar. It is a responsive website, not an app.

So Phase 1 is not polish — it is building the foundation that doesn't exist yet.

---

## 1. The language

### 1.1 Ground and depth

Liquid glass over flat black looks like nothing. Glass needs colour variance behind it
to refract. So the ground is **three layers**, not one:

```
layer 0   --bg-void     #0A0E0C   the deepest ground, behind everything
layer 1   --bg-canvas   #0E1311   the page itself
layer 2   ambient blooms          two large fixed radial gradients:
                                    sage  #A3C9A8 @ 7%  top-left,     60vw
                                    ochre #C9A87B @ 4%  bottom-right, 70vw
                                  fixed, never scroll, drift 4px over 30s
```

Everything else floats on that. The blooms are the single most important decision in
this document — remove them and every glass surface flattens into grey.

### 1.2 Glass tiers

Three tiers only. More than three and depth stops reading.

| Token | Fill | Blur | Border | Used for |
|---|---|---|---|---|
| `--glass-1` | `rgba(255,255,255,.045)` | none* | `rgba(255,255,255,.07)` | resting cards, list rows |
| `--glass-2` | `rgba(255,255,255,.075)` | `blur(20px)` | `rgba(255,255,255,.11)` | raised / interactive / hero |
| `--glass-3` | `rgba(16,23,19,.72)` | `blur(40px) saturate(160%)` | `rgba(255,255,255,.09)` | tab bar, sheets, sticky headers |

\* **Performance rule, non-negotiable:** at most **two** live `backdrop-filter` layers
on screen at once. `--glass-1` is a pre-composited translucent fill with *no* blur — on
a mid-range Android, twenty blurred cards in a scrolling list drops to ~20fps. Real blur
is reserved for the tab bar (always) plus whatever sheet is open (at most one). This is
the difference between "feels like an app" and "feels like a slideshow", and it is the
easiest thing in this whole plan to get wrong.

Every glass surface also gets a 1px top inner highlight
(`inset 0 1px 0 rgba(255,255,255,.06)`) — that hairline is what sells the material.

### 1.3 Palette

```
ink            #E8EDE9    primary text
ink-muted      #9AA79F    secondary
ink-faint      #6B7770    tertiary, disabled, captions

sage           #A3C9A8    primary accent — progress, active state, "you"
lime           #D6E4B0    highlight — hero numerals, the winning bar
moss           #4F7A5B    deep fill, gradient tail
ochre          #D9B26A    warning, "late", grace period
clay           #C97B6B    danger, "flagged", destructive
```

No pure white, no pure black, no `red-500`. The existing `text-red-600` /
`bg-emerald-500` / `zinc-*` utilities all get replaced — a fire-engine red inside this
palette looks like a browser error dialog.

**Score-driven colour.** A 12% bar should not look as triumphant as a 96% bar. Bars and
rings interpolate `ink-faint → moss → sage → lime` across 0-100 rather than using one
flat green. Small idea, disproportionate effect on the leaderboard.

### 1.4 Type

`next/font/google` → **Geist** (variable, already available in Next 16, no new package).
One family, no serif — a serif would break the smart-home calm.

```
hero numeral   64-72px / 700 / -0.045em / tabular-nums
title          28px    / 600 / -0.022em
section        15px    / 600 / -0.01em
body           14px    / 400
caption        12px    / 500
overline       10.5px  / 600 / uppercase / +0.14em
```

`font-variant-numeric: tabular-nums` globally on anything numeric — scores that shift
width while animating look broken. Inputs never below **16px** (iOS zooms the viewport
on focus for anything smaller).

### 1.5 Shape and space

```
radius   10 chips · 18 rows · 24 cards · 32 hero + sheets
gutter   20px page inset
rhythm   12px between rows · 20px between sections · 28px above a section heading
touch    44px minimum, always
```

Big radii and generous padding are most of what separates "app" from "website". The
current 12px `rounded-xl` everywhere reads as a web dashboard.

---

## 2. Layout — the PowerPeak influence

PowerPeak's signature is: **hero stat card → grid of soft icon tiles → floating pill
nav**. That maps onto this app almost exactly.

### 2.1 The icon tile grid

The core reusable unit, `IconTile`:

```
76px tall · radius 20 · glass-1
40px tinted circle (accent @ 12%) holding a 22px stroke glyph
11px label below, ink-muted
whileTap scale .96
```

Four across on Home (Log · Buddies · Community · Progress). This is the layout the user
pointed at, and it replaces Home's current two flat text boxes.

### 2.2 The floating tab bar

The current bar is a flat white sticky strip. It becomes a **floating glass pill**:
inset 16px from the sides, sitting 12px above the safe-area inset, radius 28, glass-3,
with a sage indicator pill that **slides** between tabs via `layoutId`.

Labels stay always-visible (the brief calls for "very very easy to use" — labels-on-active
only is a fashion, not usability). Icons scale to 1.08 when active. The unread dot
becomes sage with a soft glow instead of `bg-red-500`.

The existing five inline SVGs in `TabBar.tsx` are a decent starting point but the stroke
language is inconsistent (mixed weights, mixed corner treatment). They get redrawn as
part of one ~20-glyph set at 1.6px stroke, round caps, 24px box.

### 2.3 Screen frame

`Screen` gains a proper app header: back chevron (not "← Community" underlined text), a
title that shrinks and moves into a sticky glass-3 bar as you scroll past it, and the
action slot as a real icon button rather than a black rectangle.

---

## 3. Motion system

One spec file (`src/components/ui/motion.ts`), imported everywhere. Consistency matters
more than any individual animation.

```ts
springs = {
  snappy: { type: 'spring', stiffness: 420, damping: 32, mass: 0.8 }, // tap, indicator
  soft:   { type: 'spring', stiffness: 260, damping: 30 },            // enters, bars
  sheet:  { type: 'spring', stiffness: 320, damping: 34 },            // sheets
}
ease  = [0.32, 0.72, 0, 1]                    // out-expo, iOS-ish
times = { micro: 140, base: 220, enter: 320, sheet: 420 }
```

### 3.1 The animations, concretely

1. **Screen entrance** — children stagger in, 14px up + fade, 28ms apart, `soft`.
   One `Stagger` primitive so every screen inherits it without being touched.
2. **Route transitions** — `template.tsx` + `AnimatePresence` keyed on pathname.
   Forward: slide in 24px from the right. Back: reverse. Depth via a slight scale on the
   outgoing screen.
3. **Shared element: leaderboard row → member drill-down.** `layoutId` on the name+rank
   block so it physically morphs across the route change. This is the flagship moment
   and the main reason `motion` is worth the 50KB.
4. **Bars and rings** animate from 0 on mount, 60ms per-index stagger, `soft` spring.
5. **Numbers count up** — `Ticker`, ~700ms ease-out, tabular figures so nothing jitters.
6. **Tab indicator** — shared `layoutId`, `snappy`.
7. **Tap feedback everywhere** — one `Pressable` wrapper, `whileTap={{ scale: 0.97 }}`
   plus `navigator.vibrate(8)` where supported. This single primitive does more for
   "feels like an app" than any other item on this list.
8. **Bottom sheets** replace the current inline expanding panels (the `+ Custom metric…`
   mini-form, `CommunityRulePanel`, `JoinCommunityActions`). Spring up from `y:100%`,
   drag handle, `drag="y"` with velocity-based dismiss, backdrop blurs in behind.
9. **Heat strip** — 30 cells fade + scale in left-to-right, 12ms stagger; tap a cell for
   a popover with that day's score.
10. **Leaderboard reordering** — `layout` on each row, so when ranks change the rows
    physically swap rather than snapping.
11. **Copy-invite-link** — button morphs to a check with a spring pop, the link row
    flashes a sage glow.
12. **Log-saved moment** — a sage radial pulse from the save button + haptic. The app's
    one small celebration; it should not be a confetti cannon.
13. **Ambient drift** — the background blooms translate 4px over 30s. Subliminal, but
    it's the difference between a live surface and a screenshot.
14. **Skeletons** — glass shimmer at every Suspense boundary instead of blank space.

### 3.2 Reduced motion

`useReducedMotion()` handled **once, inside the primitives**, collapsing every spring to
an opacity-only fade and stopping the ambient drift. Never checked ad-hoc per screen.

---

## 4. "App, not website"

The mechanical bits that do the heavy lifting:

- **Installable PWA** — `manifest.json` with `display: 'standalone'`, maskable icons,
  splash. Biggest single lever: it launches chromeless from the home screen.
- `viewport`: `themeColor: '#0E1311'`, `viewportFit: 'cover'`,
  `interactiveWidget: 'resizes-content'`. Zoom stays enabled — never disable it.
- `overscroll-behavior-y: contain` (kills the rubber-band-reveals-white-page tell).
- `-webkit-tap-highlight-color: transparent`; `user-select: none` on chrome, kept on
  content.
- Safe-area padding top *and* bottom.
- `inputMode="numeric"` + `enterKeyHint` on every number field; hidden scrollbars.
- Layout is phone-first and stays `max-w-md` centred — on desktop it renders as a
  phone-width column on the dark ground, deliberately, rather than stretching.

---

## 5. Primitives to build (Phase 1 output)

`src/components/ui/`:

```
motion.ts      springs, easings, variants
tokens         (in globals.css via @theme)
Surface.tsx    the three glass tiers
Pressable.tsx  tap scale + haptic
Sheet.tsx      drag-to-dismiss bottom sheet
Ring.tsx       circular progress, score-coloured
Bar.tsx        animated bar, score-coloured
Ticker.tsx     count-up numeral
Stagger.tsx    list/screen entrance
IconTile.tsx   the PowerPeak grid tile
Button.tsx · Chip.tsx · Field.tsx · Skeleton.tsx
icons.tsx      ~20 glyphs, one stroke language
```

`Screen`/`Card`/`EmptyState` are rewritten on top of these, keeping their current props
so no screen breaks while the phases roll through.

---

## 6. Build order

Each step is scoped to be small and independently verifiable. Every step ends with
something visible and working in the running app.

### Signing in — solved, don't re-solve it

Every design step needs a signed-in browser. Four sessions in a row were blocked here.
It now works, and no password is ever typed:

```bash
node scripts/dev-login.mjs you@example.com
```

It mints a one-time `hashed_token` via the Auth Admin API (service_role key already in
`.env.local`) and prints a `http://localhost:3000/auth/confirm?token_hash=…` URL. The
existing `src/app/auth/confirm/route.ts` verifies it server-side and sets the
`@supabase/ssr` cookie. Navigate the preview browser to that URL and you are signed in as
that account. Tokens are single-use — regenerate per session.

**Run it from PowerShell, not Git Bash**, if you pass `--next` (MSYS rewrites a
leading-slash argument into a Windows path; the script now catches this and tells you).

The two real accounts, for anything needing two users
(`node scripts/admin-users.mjs` lists them):

```
5057af85-…  you@example.com          primary
85c59a63-…  second@example.com       second account
```

**Every step below ends with:** `npx tsc --noEmit`, `npx eslint src`, `npx vitest run`
(56 tests, all pure logic — they must stay green but they cannot catch a visual
regression), plus **a screenshot at 375×812 of every screen the step touched**. The
screenshots are the real gate.

---

### Step D0 — Walk the app before changing it

**Say this:** *"Gym-Shym design step D0: walk the app and screenshot the before state."*

No code changes. Sign in, set the preview to 375×812, and visit every screen: `/`,
`/progress`, `/goals`, `/buddies`, `/buddies/new`, a buddy detail, `/community`,
`/community/new`, a community detail, a member drill-down, `/settings`,
`/settings/profile`, and signed-out `/welcome`, `/login`, `/signup`.

There is almost no data in these accounts (Community shows "Not in one yet"), so
**create a real community with a couple of rules and join it from the second account**,
via the invite link — otherwise the leaderboard, the group-aggregate bar and the
drill-down cannot be seen at all, and those are the flagship screens of Phase 4.

**Done when:** every screen has a before-screenshot, and `PROGRESS.md` has a list of
what is actually broken or awkward — separating *real bugs* (fix them in the step that
touches that screen) from *ugliness* (that's what the rest of this plan is for). This is
also the first genuine human-eyes check of the Community feature, which the C2-C6 notes
in `PROGRESS.md` have been deferring for four sessions.

---

### Step D1 — The ground: tokens, font, dark-only, PWA

**Say this:** *"Gym-Shym design step D1: tokens, font and the app shell ground."*

Files: `src/app/globals.css`, `src/app/layout.tsx`, `public/manifest.json`, icons.

- Replace `globals.css` wholesale with the token set from §1.2-1.5 via Tailwind v4's
  `@theme`. Delete the `prefers-color-scheme` block — the app is dark-only now
  (`<html className="dark">`), tokens still shaped so light could be added later.
- Load **Geist** through `next/font/google` and drop the Arial stack.
- Add the ambient blooms (§1.1) as a fixed pseudo-element layer on `body`.
- `manifest.json` (`display: standalone`, maskable icons), `themeColor`,
  `viewportFit: 'cover'`, `overscroll-behavior-y: contain`, tap-highlight reset,
  safe-area padding.

**Done when:** the app is on the dark forest ground in a real font, nothing is
redesigned, and no screen is *broken* — every screen still readable even though its
`zinc-*` utilities now clash. Screenshot `/` and `/community` to prove it.

---

### Step D2 — Motion spec + the core primitives

**Say this:** *"Gym-Shym design step D2: the motion spec and core primitives."*

`npm i motion`. Create `src/components/ui/`: `motion.ts` (springs, easings, variants
from §3), `Surface.tsx` (three glass tiers, blur budget enforced), `Pressable.tsx`,
`Stagger.tsx`, `Ticker.tsx`, `Bar.tsx` (score-coloured, animates from 0),
`Ring.tsx`, `Skeleton.tsx`.

`useReducedMotion()` is handled **inside these primitives, once** — never per screen.

**Done when:** the primitives exist and are exercised on one throwaway scratch route
(delete it before finishing) — no real screen uses them yet. This step is pure
infrastructure and should be a short chat.

---

### Step D3 — Sheets, controls, icons

**Say this:** *"Gym-Shym design step D3: sheets, controls and the icon set."*

`Sheet.tsx` (spring up, drag handle, `drag="y"` velocity dismiss, blurred backdrop),
`Button.tsx`, `Chip.tsx`, `Field.tsx` (16px minimum, `inputMode`, `enterKeyHint`),
`IconTile.tsx` (§2.1), and `icons.tsx` — ~20 glyphs redrawn in one stroke language
(1.6px, round caps, 24px box), absorbing the five inconsistent SVGs currently inline in
`TabBar.tsx`.

**Done when:** same as D2 — proven on a scratch route, then deleted.

---

### Step D4 — The shell

**Say this:** *"Gym-Shym design step D4: the tab bar, Screen frame and route transitions."*

Files: `src/components/TabBar.tsx`, `src/components/Screen.tsx`,
`src/app/(app)/layout.tsx`, a new `src/app/(app)/template.tsx`.

Floating glass tab pill with the sliding `layoutId` indicator (§2.2); `Screen` rebuilt
on `Surface` with the scroll-collapsing header (§2.3), keeping its current props so no
page breaks; `Card`/`EmptyState` rebuilt on the primitives; route transitions +
`Stagger` in `template.tsx`.

**Done when:** every screen in the app has inherited the language without any page file
being edited. This is the step where it starts looking like an app. Screenshot all five
tabs.

---

### Step D5 — Home

**Say this:** *"Gym-Shym design step D5: the Home screen."*

File: `src/app/(app)/page.tsx`. Hero `Ring` + `Ticker` replacing the flat bar and
`text-6xl`; the four-across `IconTile` grid replacing the two flat text boxes; "Today vs
your challenges" as horizontal snap-scrolling cards.

---

### Step D6 — Progress

**Say this:** *"Gym-Shym design step D6: the Progress screen and the log form."*

Files: `src/app/(app)/progress/page.tsx`, `progress/LogForm.tsx`,
`src/app/(app)/goals/`. Log fields as proper mobile inputs, "what this feeds" chips,
goal rows on animated `Bar`s, the 30-day heat strip with its stagger and tap-popover.

---

### Step D7 — Community: list and leaderboard

**Say this:** *"Gym-Shym design step D7: the Community list and leaderboard."*

Files: `src/app/(app)/community/page.tsx`, `community/SearchCommunities.tsx`,
`community/[id]/page.tsx`.

The flagship. The leaderboard's `BarRow` becomes a real ranked row (rank, name, animated
score-coloured bar, badges as `Chip`s); the group-aggregate bar gets its own visual
treatment rather than just `font-semibold`; rows carry `layout` so ranks reorder
physically, and the `layoutId` half of the shared-element morph into the drill-down.

---

### Step D8 — Community: the rest

**Say this:** *"Gym-Shym design step D8: the remaining Community screens."*

Files: `community/[id]/member/[userId]/page.tsx` (receives the shared-element morph),
`community/new/NewCommunityForm.tsx`, `community/[id]/CommunityRulePanel.tsx`,
`CommunityInviteLink.tsx` (copy-morphs-to-check), `JoinCommunityActions.tsx`,
`src/app/community/join/[token]/`, and `src/components/RuleEditor.tsx` — whose
`+ Custom metric…` inline form becomes a `Sheet`. `RuleEditor` is shared with Buddies,
so changing it here lands in D9 too; check both.

---

### Step D9 — Buddies

**Say this:** *"Gym-Shym design step D9: the Buddies screens."*

Files: `src/app/(app)/buddies/page.tsx`, `SendInviteForm.tsx`, `StakeLedger.tsx`,
`buddies/[id]/page.tsx`, `ChangeRequestPanel.tsx`, `RecentEntriesFeed.tsx`,
`GraceButton.tsx`, `RematchButton.tsx`, `buddies/new/NewChallengeWizard.tsx`,
`src/components/EntryBadges.tsx`.

---

### Step D10 — Settings and the signed-out screens

**Say this:** *"Gym-Shym design step D10: settings and the signed-out screens."*

Files: `src/app/(app)/settings/`, `settings/profile/ProfileForm.tsx`,
`TimezoneForm.tsx`, and `/welcome`, `/login`, `/signup`, `/forgot-password`,
`/reset-password`, `/join/[token]`. The signed-out screens are the first thing a new
user ever sees — they get real care, not leftovers.

---

### Step D11 — Polish

**Say this:** *"Gym-Shym design step D11: the polish pass."*

Reduced-motion audit across every primitive; WCAG AA contrast check on the final
palette; 60fps profiling with the §1.2 blur budget actually enforced (count the live
`backdrop-filter` layers per screen); install as a PWA on a real phone and use it.
Sweep for any `zinc-*` / `dark:` / `emerald-500` / `red-600` survivors.

---

## 7. Known risks, decided up front

- **Blur cost.** Handled by the two-live-blur budget in §1.2. If profiling still shows
  jank, `--glass-3` drops `saturate()` first, then blur radius — never the count.
- **`dark:` variant debt.** ~20 files carry `zinc-*` / `dark:zinc-*` pairs. The app goes
  **dark-only**: `<html className="dark">`, media query removed, tokens still structured
  so a light theme could be added later. The `dark:` twins get stripped file-by-file as
  each phase touches them, not in one big-bang commit.
- **Bundle.** `motion` is ~50KB gzipped, imported only in client components. Server
  components (most pages here) stay untouched — the animation lives in the primitives.
- **Tests.** All 56 vitest tests are pure scoring/rollup logic. Nothing in this plan can
  break them, which is also why they cannot catch a regression from it. `tsc`, `eslint`,
  `next build` plus live-browser screenshots are the real gate.
- **Scope honesty.** This is a multi-session job. Phases 1-2 are one session; 3, 4 and 5
  are roughly one each.
