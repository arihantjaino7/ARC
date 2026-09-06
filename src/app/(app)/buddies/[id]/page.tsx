import Link from "next/link";
import { Card, EmptyState, Screen } from "@/components/Screen";
import { createClient } from "@/lib/supabase/server";
import { getFriendData } from "@/lib/friends/actions";
import {
  getChallengesWithBuddy,
  getChangeRequestsForChallenge,
  getRecentEntries,
  getScoreboard,
} from "@/lib/challenges/actions";
import type {
  ChangeRequest,
  RecentEntry,
  ScoreboardParticipant,
  ScoreboardResult,
  ScoreboardRuleSummary,
} from "@/lib/challenges/types";
import { findMetric, BUILTIN_METRICS } from "@/lib/metrics/types";
import { markChallengeNotificationsRead } from "@/lib/notifications/actions";
import { daysBetween } from "@/lib/time/day";
import type { ScoredGoal } from "@/lib/scoring/types";
import { ChangeRequestPanel } from "./ChangeRequestPanel";
import { RecentEntriesFeed } from "./RecentEntriesFeed";
import { GraceButton } from "./GraceButton";
import { RematchButton } from "./RematchButton";

// A buddy can have more than one challenge on file (completed ones stick
// around). This picks the one worth showing: an active challenge beats a
// still-pending invite, which beats anything already over.
const STATUS_RANK: Record<string, number> = { active: 0, pending: 1, completed: 2, cancelled: 3, draft: 4 };

function pickChallenge<T extends { status: string; startDate: string }>(challenges: T[]): T | null {
  if (challenges.length === 0) return null;
  return [...challenges].sort((a, b) => {
    const rank = (STATUS_RANK[a.status] ?? 9) - (STATUS_RANK[b.status] ?? 9);
    return rank !== 0 ? rank : b.startDate.localeCompare(a.startDate);
  })[0];
}

function ruleLabel(rule: ScoreboardRuleSummary): string {
  return findMetric(BUILTIN_METRICS, rule.metricKey)?.label ?? rule.metricKey;
}

function ruleHint(rule: ScoreboardRuleSummary): string {
  if (rule.period === "weekly") return "weekly";
  switch (rule.shape) {
    case "at_least":
      return "at least";
    case "at_most":
      return "at most";
    case "range":
      return "range";
    case "boolean":
      return "daily";
  }
}

/** Grace tokens (V2 Step 13) reset every 30 days, counted from the challenge's own start_date. */
function graceUsedThisPeriod(gracedDates: string[], startDate: string, today: string): boolean {
  const currentPeriod = Math.floor(daysBetween(startDate, today) / 30);
  return gracedDates.some((d) => Math.floor(daysBetween(startDate, d) / 30) === currentPeriod);
}

export default async function BuddyDetailPage(props: PageProps<"/buddies/[id]">) {
  const { id: buddyId } = await props.params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ friends }, challenges] = await Promise.all([
    getFriendData(),
    getChallengesWithBuddy(buddyId),
  ]);

  const friendship = friends.find(
    (f) => f.requesterId === buddyId || f.addresseeId === buddyId,
  );
  const buddyEmail = friendship
    ? friendship.requesterId === user?.id
      ? friendship.addresseeEmail
      : friendship.requesterEmail
    : null;

  if (!friendship) {
    return (
      <Screen title="Buddy" back={{ href: "/buddies", label: "Buddies" }}>
        <EmptyState
          title="Not a buddy"
          body="You're not connected with this person, or the invite is still pending."
        />
      </Screen>
    );
  }

  const chosen = pickChallenge(challenges);

  if (!chosen) {
    return (
      <Screen
        title={buddyEmail ?? "Buddy"}
        back={{ href: "/buddies", label: "Buddies" }}
      >
        <EmptyState
          title="No challenge yet"
          body="Start one with this buddy to see your progress side by side."
          cta={
            <Link
              href={`/buddies/new?buddy=${buddyId}`}
              className="rounded-md bg-black px-3 py-2 text-sm font-medium text-white dark:bg-white dark:text-black"
            >
              Start a challenge
            </Link>
          }
        />
      </Screen>
    );
  }

  const [board, changeRequests, recentEntries] = await Promise.all([
    getScoreboard(chosen.id),
    getChangeRequestsForChallenge(chosen.id),
    getRecentEntries(chosen.id),
  ]);

  // Opening this screen is what "reads" a change-request notification — no
  // separate inbox page exists yet, so this is the one place that would ever
  // show it. Fire-and-forget: nothing here depends on it completing.
  void markChallengeNotificationsRead(chosen.id);

  return (
    <Screen
      title={buddyEmail ?? "Buddy"}
      subtitle={chosen.name}
      back={{ href: "/buddies", label: "Buddies" }}
    >
      {"error" in board ? (
        <p className="text-sm text-red-600 dark:text-red-400">{board.error}</p>
      ) : board.participants.length < 2 ? (
        <EmptyState
          title="Waiting on them"
          body={`"${chosen.name}" is ${chosen.status === "pending" ? "still waiting for them to accept" : "not fully joined yet"}.`}
        />
      ) : (
        <Scoreboard
          board={board}
          challengeId={chosen.id}
          currentUserId={board.participants.find((p) => p.isCaller)!.userId}
          pendingChanges={changeRequests.filter((r) => r.status === "pending")}
          recentEntries={"error" in recentEntries ? [] : recentEntries}
        />
      )}
    </Screen>
  );
}

export function Scoreboard({
  board,
  challengeId,
  currentUserId,
  pendingChanges,
  recentEntries,
}: {
  board: ScoreboardResult;
  challengeId?: string;
  currentUserId?: string;
  pendingChanges?: ChangeRequest[];
  recentEntries?: RecentEntry[];
}) {
  const you = board.participants.find((p) => p.isCaller)!;
  const them = board.participants.find((p) => !p.isCaller)!;

  return (
    <div className="space-y-6">
      <Card>
        <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          Overall
        </p>
        <div className="mt-2 space-y-1.5">
          {/* The running total already excludes today's hidden value (unlogged
              scores 0, same rule the rollup applies everywhere else), so
              there's nothing to hide here — only "Today" and the heat
              strip's last cell need the explicit lock. */}
          <BarRow label="You" value={you.total} />
          <BarRow label={them.label} value={them.total} />
        </div>
        <p className="mt-3 text-[11px] text-zinc-500 dark:text-zinc-400">
          {board.startDate} &rarr; {board.endDate}
        </p>
      </Card>

      <Card>
        <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          This week
        </p>
        <div className="mt-2 space-y-1.5">
          <BarRow label="You" value={you.weekTotal} />
          <BarRow label={them.label} value={them.weekTotal} />
        </div>
        <WeeklyRecapLine you={you} rules={board.rules} />
      </Card>

      <div>
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          By rule
        </p>
        <div className="space-y-3">
          {board.rules.map((rule) => (
            <Card key={rule.id}>
              <p className="text-sm font-medium text-black dark:text-zinc-50">
                {ruleLabel(rule)}{" "}
                <span className="font-normal text-zinc-500 dark:text-zinc-400">&middot; {ruleHint(rule)}</span>
              </p>
              <div className="mt-2 space-y-1.5">
                <BarRow label="You" value={you.perRule[rule.id]?.score ?? 0} />
                <BarRow label={them.label} value={them.perRule[rule.id]?.score ?? 0} />
              </div>
            </Card>
          ))}
        </div>
      </div>

      <Card>
        <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          Today
        </p>
        <div className="mt-2 space-y-1.5 text-sm">
          <TodayRow label="You" logged={you.todayLogged} />
          <TodayRow label={them.label} logged={them.todayLogged} hidden={them.todayHidden} />
        </div>
        {challengeId && (
          <div className="mt-3">
            <GraceButton
              challengeId={challengeId}
              usedThisPeriod={graceUsedThisPeriod(you.gracedDates, board.startDate, board.callerToday)}
            />
          </div>
        )}
      </Card>

      <div>
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          Last {you.heatStrip.length} days
        </p>
        <Card>
          <div className="space-y-2">
            <HeatRow label="You" cells={you.heatStrip} />
            <HeatRow
              label={them.label}
              cells={them.heatStrip}
              hideDate={them.todayHidden ? board.callerToday : null}
            />
          </div>
          <p className="mt-3 text-[11px] text-zinc-500 dark:text-zinc-400">
            Blank cells are rest days &mdash; not misses.
            {board.blindMode && them.todayHidden && " Today's cell for them is hidden until you log yours."}
          </p>
        </Card>
      </div>

      <div className="flex gap-4 text-xs text-zinc-500 dark:text-zinc-400">
        <BadgeSummary label="You" badges={you.badges} trustScore={you.trustScore} />
        <BadgeSummary label={them.label} badges={them.badges} trustScore={them.trustScore} />
      </div>

      {challengeId && board.endDate < board.callerToday && <RematchButton challengeId={challengeId} />}

      {challengeId && currentUserId && (
        <ChangeRequestPanel
          challengeId={challengeId}
          currentUserId={currentUserId}
          buddyLabel={them.label}
          liveRules={board.rules}
          pending={pendingChanges ?? []}
        />
      )}

      {recentEntries && (
        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            {them.label}&rsquo;s last 48 hours
          </p>
          <RecentEntriesFeed entries={recentEntries} />
        </div>
      )}
    </div>
  );
}

/** The trailing-7-day best day and weakest rule (V2 Step 13's weekly recap). */
function WeeklyRecapLine({
  you,
  rules,
}: {
  you: ScoreboardParticipant;
  rules: ScoreboardRuleSummary[];
}) {
  const last7 = you.heatStrip.slice(-7).filter((c): c is { date: string; score: number } => c.score !== null);
  const best = last7.length > 0 ? last7.reduce((b, c) => (c.score > b.score ? c : b)) : null;

  const scoredRules = rules
    .map((rule) => ({ rule, sg: you.weekPerRule[rule.id] }))
    .filter((x): x is { rule: ScoreboardRuleSummary; sg: ScoredGoal } => Boolean(x.sg) && x.sg.weight > 0);
  const weakest =
    scoredRules.length > 0 ? scoredRules.reduce((w, x) => (x.sg.score < w.sg.score ? x : w)) : null;

  if (!best && !weakest) return null;

  return (
    <p className="mt-3 text-[11px] text-zinc-500 dark:text-zinc-400">
      {best && `Best day: ${best.date} (${best.score}).`}
      {best && weakest && " "}
      {weakest && `Weakest rule: ${ruleLabel(weakest.rule)} (${weakest.sg.score}).`}
    </p>
  );
}

function BarRow({ label, value, hidden }: { label: string; value: number; hidden?: boolean }) {
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div className="flex items-center gap-2">
      <span className="w-14 shrink-0 truncate text-[11px] text-zinc-500 dark:text-zinc-400">{label}</span>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
        {!hidden && (
          <div className="h-full rounded-full bg-black dark:bg-white" style={{ width: `${pct}%` }} />
        )}
      </div>
      <span className="w-9 shrink-0 text-right text-[11px] font-medium text-black dark:text-zinc-50">
        {hidden ? "\u{1F512}" : `${pct}%`}
      </span>
    </div>
  );
}

function TodayRow({ label, logged, hidden }: { label: string; logged: boolean; hidden?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-zinc-700 dark:text-zinc-300">{label}</span>
      {hidden ? (
        <span className="text-zinc-500 dark:text-zinc-400">Hidden until you log today</span>
      ) : (
        <span className={logged ? "text-emerald-600 dark:text-emerald-400" : "text-zinc-500 dark:text-zinc-400"}>
          {logged ? "Logged" : "Not yet"}
        </span>
      )}
    </div>
  );
}

function heatColor(score: number | null): string {
  if (score === null) return "bg-zinc-100 dark:bg-zinc-900";
  if (score >= 90) return "bg-emerald-500";
  if (score >= 70) return "bg-emerald-300 dark:bg-emerald-800";
  if (score >= 40) return "bg-amber-300 dark:bg-amber-700";
  return "bg-red-300 dark:bg-red-900";
}

function HeatRow({
  label,
  cells,
  hideDate,
}: {
  label: string;
  cells: ScoreboardParticipant["heatStrip"];
  hideDate?: string | null;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-14 shrink-0 truncate text-[11px] text-zinc-500 dark:text-zinc-400">{label}</span>
      <div className="flex flex-1 gap-[3px]">
        {cells.map((cell) => (
          <div
            key={cell.date}
            title={cell.date}
            className={`h-4 flex-1 rounded-sm ${
              hideDate === cell.date ? "bg-zinc-300 dark:bg-zinc-700" : heatColor(cell.score)
            }`}
          />
        ))}
      </div>
    </div>
  );
}

function BadgeSummary({
  label,
  badges,
  trustScore,
}: {
  label: string;
  badges: ScoreboardParticipant["badges"];
  trustScore: number;
}) {
  const parts = [
    badges.late > 0 && `${badges.late} late`,
    badges.edited > 0 && `${badges.edited} edited`,
    badges.flagged > 0 && `${badges.flagged} flagged`,
    badges.disputed > 0 && `${badges.disputed} disputed`,
    badges.suspicious > 0 && `${badges.suspicious} suspicious`,
  ].filter(Boolean);

  return (
    <p>
      <span className="font-medium text-zinc-700 dark:text-zinc-300">{label}: </span>
      {parts.length > 0 ? parts.join(", ") : "clean so far"}
      {trustScore > 0 && ` · trust ${trustScore}`}
    </p>
  );
}
