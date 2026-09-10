import { GoalIcon, UserIcon } from "@/components/ui/icons";
import { getGoals } from "@/lib/goals/actions";
import { getDayLog, getMyHeatStrip, type HeatCell } from "@/lib/logs/actions";
import { toDayValues } from "@/lib/logs/types";
import { scoreDay } from "@/lib/scoring/scoreDay";
import { groupAggregate } from "@/lib/challenges/rollup";
import { getMyActiveChallenges, getScoreboard } from "@/lib/challenges/actions";
import { getMyCommunities } from "@/lib/communities/actions";
import { getProfile } from "@/lib/profile/actions";
import { HeroDisc } from "./_home/HeroDisc";
import { TodayControl } from "./_home/TodayControl";
import { LiveDeck, type DeckTrack } from "./_home/LiveDeck";
import { RoundButton } from "./_home/RoundButton";

// Drop a square image here (public/hero-disc.png) and it becomes the hero.
// Until then HeroDisc draws its own concentric-ring fallback — see its header.
const HERO_IMAGE_SRC = "/hero-disc.png";

const RIM_TEXT = "GYM-SHYM · CONSISTENCY OVER INTENSITY";

// Rotates by day so it's stable within a day but not the same one forever.
const LINES = [
  "Showing up beats sending it. Log the day.",
  "The one who logs it, wins it.",
  "Rest days count too — if they were the plan.",
  "You're competing against your own target, not their numbers.",
  "Small day, logged, still moves the bar.",
  "Consistency is just a lot of ordinary days in a row.",
  "Nobody wins the week on Sunday night.",
];

function lineFor(date: string): string {
  const seed = Number(date.replaceAll("-", ""));
  return LINES[seed % LINES.length];
}

function prettyDate(date: string): string {
  if (!date) return "";
  // Parsed and formatted in UTC on purpose: `date` is already the user's own
  // local day (resolved server-side against their timezone), so letting the
  // runtime re-interpret it in the server's zone would shift it by a day.
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));
}

function initials(label: string): string {
  const parts = label.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

/**
 * Consecutive scored days ending today. An unlogged *today* doesn't break a
 * live streak — it just hasn't extended it yet — so the walk starts at
 * yesterday in that case. A logged-but-zero day does break it.
 */
function streakFrom(cells: HeatCell[]): number {
  let i = cells.length - 1;
  if (i >= 0 && cells[i].score === null) i -= 1;

  let streak = 0;
  for (; i >= 0; i--) {
    const score = cells[i].score;
    if (score === null || score <= 0) break;
    streak += 1;
  }
  return streak;
}

// "Who won today" (V2 Step 13, docs/PLAN-V2.md §5): each active challenge's
// last heat-strip cell is today's day score — the same number the buddy
// screen already computes, just read off the tail of an array that's already
// there, rather than a new scoring path.
//
// Community Step C6: getScoreboard()/getMyActiveChallenges() are already
// N-participant-capable (confirmed, not assumed — see PROGRESS.md), but this
// screen's old two-person `participants.find(p => !p.isCaller)` would
// silently pick one arbitrary opponent out of a twenty-member community.
// Fixed by branching on `kind`: a buddy challenge keeps the exact you-vs-them
// line; a community challenge shows "you vs the group average" instead — the
// more interesting line docs/PLAN-COMMUNITY.md's own Step C6 note suggested —
// computed with the same groupAggregate() the leaderboard uses, over every
// *other* member's today score (hidden/unscored ones excluded, not zeroed).
type TodayMatchup = {
  id: string;
  kind: "buddy" | "community";
  name: string;
  opponentLabel: string;
  /** The buddy's user id — /buddies/[id] is keyed by person, not challenge. */
  opponentUserId: string | null;
  yourToday: number | null;
  theirToday: number | null;
  theirHidden: boolean;
};

function verdict(yourToday: number, theirToday: number): string {
  if (yourToday > theirToday) return "you're ahead";
  if (yourToday < theirToday) return "they're ahead";
  return "tied";
}

async function getTodayMatchups(): Promise<TodayMatchup[]> {
  const activeChallenges = await getMyActiveChallenges();

  const matchups = await Promise.all(
    activeChallenges.map(async (challenge): Promise<TodayMatchup | null> => {
      const board = await getScoreboard(challenge.id);
      if ("error" in board) return null;

      const you = board.participants.find((p) => p.isCaller);
      if (!you) return null;
      const yourToday = you.heatStrip.at(-1)?.score ?? null;

      if (challenge.kind === "buddy") {
        const them = board.participants.find((p) => !p.isCaller);
        if (!them) return null;

        return {
          id: challenge.id,
          kind: "buddy",
          name: challenge.name,
          opponentLabel: them.label,
          opponentUserId: them.userId,
          yourToday,
          theirToday: them.todayHidden ? null : (them.heatStrip.at(-1)?.score ?? null),
          theirHidden: them.todayHidden,
        };
      }

      const others = board.participants.filter((p) => !p.isCaller && !p.todayHidden);
      const todayScores = others
        .map((p) => p.heatStrip.at(-1)?.score)
        .filter((s): s is number => s !== null && s !== undefined);
      if (others.length === 0) return null;

      return {
        id: challenge.id,
        kind: "community",
        name: challenge.name,
        opponentLabel: "the group",
        opponentUserId: null,
        yourToday,
        theirToday: todayScores.length > 0 ? groupAggregate(todayScores) : null,
        theirHidden: false,
      };
    }),
  );

  return matchups.filter((m): m is TodayMatchup => m !== null);
}

export default async function HomePage() {
  const [goals, log, profile, communities, todayMatchups] = await Promise.all([
    getGoals(),
    getDayLog(),
    getProfile(),
    getMyCommunities(),
    getTodayMatchups(),
  ]);

  // Depends on `goals`, so it can't join the batch above.
  const heat = await getMyHeatStrip(goals, 30);

  const { total, goals: goalScores } = scoreDay(goals, toDayValues(log));
  const goalsMet = goalScores.filter((g) => Math.round(g.score) >= 100).length;
  const loggedCount = log ? Object.keys(log.entries).length : 0;
  const date = log?.date ?? heat.at(-1)?.date ?? "";

  const streak = streakFrom(heat);
  const scored = heat.map((c) => c.score).filter((s): s is number => s !== null);
  const last7 = heat.slice(-7).map((c) => c.score).filter((s): s is number => s !== null);
  const weekAvg =
    last7.length > 0 ? Math.round(last7.reduce((a, b) => a + b, 0) / last7.length) : null;
  const best30 = scored.length > 0 ? Math.max(...scored) : null;

  // ---------------------------------------------------------------------
  // The deck: one card per thing worth looking at, in order of how much it
  // wants a decision today. Sections with nothing live still get a card so
  // Buddies, Community and Progress are all reachable from the deck.
  // ---------------------------------------------------------------------
  const tracks: DeckTrack[] = [];

  for (const m of todayMatchups) {
    const isGroup = m.kind === "community";
    const note =
      m.yourToday !== null && m.theirToday !== null && !m.theirHidden
        ? verdict(m.yourToday, m.theirToday)
        : m.theirHidden
          ? "hidden until you log"
          : "nothing scored yet";

    tracks.push({
      id: m.id,
      overline: isGroup ? "Community" : "Buddy challenge",
      title: m.name,
      subtitle: isGroup ? "You vs the group" : `You vs ${m.opponentLabel}`,
      href: isGroup ? "/community" : m.opponentUserId ? `/buddies/${m.opponentUserId}` : "/buddies",
      badge: isGroup ? initials(m.name) : initials(m.opponentLabel),
      tone: isGroup ? "lime" : "ochre",
      you: m.yourToday,
      youLabel: `You ${m.yourToday ?? "–"}`,
      them: m.theirHidden ? null : m.theirToday,
      themLabel: m.theirHidden
        ? "Them 🔒"
        : `${isGroup ? "Group" : "Them"} ${m.theirToday ?? "–"}`,
      note,
    });
  }

  if (!todayMatchups.some((m) => m.kind === "buddy")) {
    tracks.push({
      id: "cta-buddies",
      overline: "Buddies",
      title: "No live challenge",
      subtitle: "Race a friend on effort, not raw numbers",
      href: "/buddies/new",
      badge: "+",
      tone: "ochre",
      you: null,
      youLabel: "Nothing running",
      them: null,
      themLabel: "",
      note: "start one",
    });
  }

  if (!todayMatchups.some((m) => m.kind === "community")) {
    const first = communities[0];
    tracks.push({
      id: "cta-community",
      overline: "Community",
      title: first ? first.name : "Find your people",
      subtitle: first
        ? `${communities.length} joined · no live challenge`
        : "Join a group and climb its leaderboard",
      href: first ? `/community/${first.id}` : "/community",
      badge: first ? initials(first.name) : "+",
      tone: "lime",
      you: null,
      youLabel: first ? "Not scoring today" : "Nothing joined",
      them: null,
      themLabel: "",
      note: first ? "open" : "browse",
    });
  }

  tracks.push({
    id: "progress",
    overline: "Progress",
    title: weekAvg !== null ? "Seven-day average" : "No trend yet",
    subtitle: `${scored.length} of the last 30 days logged`,
    href: "/progress",
    badge: weekAvg !== null ? String(weekAvg) : "–",
    tone: "sage",
    you: weekAvg,
    youLabel: `Avg ${weekAvg ?? "–"}`,
    them: best30,
    themLabel: `Best ${best30 ?? "–"}`,
    note: streak > 0 ? `${streak}-day streak` : "log today to start a streak",
  });

  // Initials only when there is a real name behind them — a generic
  // fallback rendered as "YO" reads like a bug, not an avatar.
  const displayName = profile?.display_name?.trim() ?? "";

  return (
    <>
      {/* The screen's own ground: a bloom behind the hero fading to void at
          the bottom, so the disc reads as lit rather than pasted on. Sits
          under the global ambient blooms in globals.css. */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10"
        style={{
          background: [
            "radial-gradient(115% 55% at 50% 19%, rgba(163,201,168,0.14) 0%, rgba(79,122,91,0.06) 40%, rgba(0,0,0,0) 66%)",
            "linear-gradient(180deg, #131a16 0%, #0e1311 40%, #0a0e0c 100%)",
          ].join(", "),
        }}
      />

      <div className="mx-auto w-full max-w-md px-gutter pt-3">
        <header className="flex items-center justify-between gap-3">
          <RoundButton href="/goals" label="Your goals" size={44} tone="muted">
            <GoalIcon size={19} />
          </RoundButton>

          <div className="min-w-0 text-center">
            <h1 className="text-section text-ink">Today</h1>
            <p className="text-overline uppercase text-ink-faint">{prettyDate(date)}</p>
          </div>

          <RoundButton
            href="/settings/profile"
            label={displayName ? `Your profile, ${displayName}` : "Your profile"}
            size={44}
          >
            {displayName ? (
              <span className="text-caption font-semibold">{initials(displayName)}</span>
            ) : (
              <UserIcon size={19} />
            )}
          </RoundButton>
        </header>

        <HeroDisc
          src={HERO_IMAGE_SRC}
          score={total}
          streak={streak}
          goalsMet={goalsMet}
          goalsTotal={goals.length}
          rimText={RIM_TEXT}
        />

        <p className="mb-5 text-center text-caption text-ink-faint">{lineFor(date || "20260101")}</p>

        <TodayControl
          score={total}
          logged={loggedCount > 0}
          goalsMet={goalsMet}
          goalsTotal={goals.length}
          hasGoals={goals.length > 0}
        />

        <div className="mt-6">
          <LiveDeck tracks={tracks} />
        </div>
      </div>
    </>
  );
}
