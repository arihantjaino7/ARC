import Link from "next/link";
import { Card, Screen } from "@/components/Screen";
import { getGoals } from "@/lib/goals/actions";
import { getDayLog } from "@/lib/logs/actions";
import { toDayValues } from "@/lib/logs/types";
import { scoreDay } from "@/lib/scoring/scoreDay";
import { groupAggregate } from "@/lib/challenges/rollup";
import { getMyActiveChallenges, getScoreboard } from "@/lib/challenges/actions";

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
  name: string;
  opponentLabel: string;
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
          name: challenge.name,
          opponentLabel: them.label,
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
        name: challenge.name,
        opponentLabel: "the group",
        yourToday,
        theirToday: todayScores.length > 0 ? groupAggregate(todayScores) : null,
        theirHidden: false,
      };
    }),
  );

  return matchups.filter((m): m is TodayMatchup => m !== null);
}

export default async function HomePage() {
  const [goals, log, todayMatchups] = await Promise.all([getGoals(), getDayLog(), getTodayMatchups()]);
  const { total } = scoreDay(goals, toDayValues(log));

  const date = log?.date ?? "";
  const loggedCount = log ? Object.keys(log.entries).length : 0;

  return (
    <Screen title="Today" subtitle={lineFor(date || "20260101")}>
      <Card className="text-center">
        <p className="text-xs font-medium uppercase tracking-widest text-zinc-400">
          Your day score
        </p>
        <p className="mt-2 text-6xl font-bold tracking-tight text-black dark:text-zinc-50">
          {total}
          <span className="text-2xl font-medium text-zinc-400">/100</span>
        </p>

        <div className="mt-4 h-2 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
          <div
            className="h-full rounded-full bg-emerald-500 transition-all"
            style={{ width: `${total}%` }}
          />
        </div>

        <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">
          {goals.length === 0
            ? "Set a few goals and this starts counting."
            : loggedCount === 0
              ? "Nothing logged yet today."
              : `${loggedCount} ${loggedCount === 1 ? "thing" : "things"} logged today.`}
        </p>

        <Link
          href="/progress"
          className="mt-5 inline-block w-full rounded-lg bg-black px-4 py-2.5 text-sm font-medium text-white dark:bg-white dark:text-black"
        >
          {loggedCount === 0 ? "Log today" : "Update today"}
        </Link>
      </Card>

      {todayMatchups.length > 0 && (
        <div className="mt-4">
          <h2 className="text-sm font-semibold text-black dark:text-zinc-50">
            Today vs your challenges
          </h2>
          <ul className="mt-2 space-y-2">
            {todayMatchups.map((m) => (
              <li
                key={m.id}
                className="rounded-lg border border-zinc-200 px-3 py-2.5 dark:border-zinc-800"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate text-sm font-medium text-black dark:text-zinc-50">
                    {m.name}
                  </span>
                  <span className="shrink-0 text-xs text-zinc-500 dark:text-zinc-400">{m.opponentLabel}</span>
                </div>
                <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                  You {m.yourToday ?? "–"} &middot; {m.opponentLabel === "the group" ? "Group avg" : "Them"}{" "}
                  {m.theirHidden ? "\u{1F512}" : (m.theirToday ?? "–")}
                  {m.yourToday !== null && m.theirToday !== null && !m.theirHidden
                    ? ` — ${verdict(m.yourToday, m.theirToday)}`
                    : ""}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-4 grid grid-cols-2 gap-3">
        <Link
          href="/buddies"
          className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950"
        >
          <p className="text-sm font-medium text-black dark:text-zinc-50">Buddies</p>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            One-on-one challenges
          </p>
        </Link>
        <Link
          href="/community"
          className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950"
        >
          <p className="text-sm font-medium text-black dark:text-zinc-50">Community</p>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            Group challenges
          </p>
        </Link>
      </div>
    </Screen>
  );
}
