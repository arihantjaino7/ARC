import Link from "next/link";
import { Card, EmptyState, Screen } from "@/components/Screen";
import { Button } from "@/components/ui/Button";
import { Bar } from "@/components/ui/Bar";
import { Chip } from "@/components/ui/Chip";
import { Surface } from "@/components/ui/Surface";
import { createClient } from "@/lib/supabase/server";
import { getFriendData } from "@/lib/friends/actions";
import { getChallengesWithBuddy, getRecentEntries, getScoreboard } from "@/lib/challenges/actions";
import { pickChallenge } from "@/lib/challenges/types";
import type {
  RecentEntry,
  ScoreboardParticipant,
  ScoreboardResult,
  ScoreboardRuleSummary,
} from "@/lib/challenges/types";
import { findMetric, BUILTIN_METRICS } from "@/lib/metrics/types";
import { markChallengeNotificationsRead } from "@/lib/notifications/actions";
import { daysBetween } from "@/lib/time/day";
import type { ScoredGoal } from "@/lib/scoring/types";
import { RecentEntriesFeed } from "./RecentEntriesFeed";
import { GraceButton } from "./GraceButton";
import { RematchButton } from "./RematchButton";
import { HeatStrip } from "./HeatStrip";

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
            <Link href={`/buddies/new?buddy=${buddyId}`}>
              <Button>Start a challenge</Button>
            </Link>
          }
        />
      </Screen>
    );
  }

  const [board, recentEntries] = await Promise.all([
    getScoreboard(chosen.id),
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
        <p className="text-body text-clay">{board.error}</p>
      ) : board.participants.length < 2 ? (
        <EmptyState
          title="Waiting on them"
          body={`"${chosen.name}" is ${chosen.status === "pending" ? "still waiting for them to accept" : "not fully joined yet"}.`}
        />
      ) : (
        <Scoreboard
          board={board}
          challengeId={chosen.id}
          recentEntries={"error" in recentEntries ? [] : recentEntries}
        />
      )}
    </Screen>
  );
}

export function Scoreboard({
  board,
  challengeId,
  recentEntries,
}: {
  board: ScoreboardResult;
  challengeId?: string;
  recentEntries?: RecentEntry[];
}) {
  const you = board.participants.find((p) => p.isCaller)!;
  const them = board.participants.find((p) => !p.isCaller)!;

  return (
    <div className="space-y-6">
      <WhosAheadCard you={you} them={them} />

      <Card>
        <p className="text-overline text-ink-faint">Overall</p>
        <p className="text-caption text-ink-faint">Since the challenge started</p>
        <div className="mt-3 space-y-3">
          {/* The running total already excludes today's hidden value (unlogged
              scores 0, same rule the rollup applies everywhere else), so
              there's nothing to hide here — only "Today" and the heat
              strip's last cell need the explicit lock. */}
          <BarRow label="You" value={you.total} />
          <BarRow label={them.label} value={them.total} />
        </div>
        <p className="mt-3 text-caption text-ink-faint">
          {board.startDate} &rarr; {board.endDate}
        </p>
      </Card>

      <Card>
        <p className="text-overline text-ink-faint">This week</p>
        <p className="text-caption text-ink-faint">Trailing 7 days</p>
        <div className="mt-3 space-y-3">
          <BarRow label="You" value={you.weekTotal} />
          <BarRow label={them.label} value={them.weekTotal} />
        </div>
        <WeeklyRecapLine you={you} rules={board.rules} />
      </Card>

      <div>
        <p className="mb-2 text-overline text-ink-faint">By rule</p>
        <p className="mb-2 -mt-1 text-caption text-ink-faint">Each tracked goal, scored on its own</p>
        <div className="space-y-3">
          {board.rules.map((rule) => (
            <Card key={rule.id}>
              <p className="text-body font-medium text-ink">
                {ruleLabel(rule)}{" "}
                <span className="font-normal text-ink-muted">&middot; {ruleHint(rule)}</span>
              </p>
              <div className="mt-3 space-y-3">
                <BarRow label="You" value={you.perRule[rule.id]?.score ?? 0} />
                <BarRow label={them.label} value={them.perRule[rule.id]?.score ?? 0} />
              </div>
            </Card>
          ))}
        </div>
      </div>

      <Card>
        <p className="text-overline text-ink-faint">Today</p>
        <div className="mt-3 space-y-2">
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
        <p className="mb-2 text-overline text-ink-faint">Last {you.heatStrip.length} days</p>
        <Card>
          <div className="space-y-2">
            <HeatStrip label="You" cells={you.heatStrip} />
            <HeatStrip
              label={them.label}
              cells={them.heatStrip}
              hideDate={them.todayHidden ? board.callerToday : null}
            />
          </div>
          <p className="mt-3 text-caption text-ink-faint">
            Blank cells are rest days &mdash; not misses.
            {board.blindMode && them.todayHidden && " Today's cell for them is hidden until you log yours."}
          </p>
        </Card>
      </div>

      <div className="flex gap-4">
        <BadgeSummary label="You" badges={you.badges} trustScore={you.trustScore} />
        <BadgeSummary label={them.label} badges={them.badges} trustScore={them.trustScore} />
      </div>

      {challengeId && board.endDate < board.callerToday && <RematchButton challengeId={challengeId} />}

      {recentEntries && (
        <div>
          <p className="mb-2 text-overline text-ink-faint">{them.label}&rsquo;s last 48 hours</p>
          <RecentEntriesFeed entries={recentEntries} />
        </div>
      )}
    </div>
  );
}

/** The very first thing shown on this screen: who's ahead overall, and by how much. */
function WhosAheadCard({ you, them }: { you: ScoreboardParticipant; them: ScoreboardParticipant }) {
  const youScore = Math.max(0, Math.min(100, Math.round(you.total)));
  const themScore = Math.max(0, Math.min(100, Math.round(them.total)));
  const diff = Math.abs(youScore - themScore);

  const headline =
    youScore === themScore
      ? "It's a tie"
      : youScore > themScore
        ? "You're ahead"
        : `${them.label} is ahead`;

  return (
    <Surface tier={1} radius="hero" className="p-5 text-center">
      <p className="text-title text-ink">{headline}</p>
      <p className="mt-1 text-body text-ink-muted">
        {youScore}% (you) vs {themScore}% ({them.label})
        {diff > 0 && ` · ${diff} point${diff === 1 ? "" : "s"} apart`}
      </p>
    </Surface>
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
    <p className="mt-3 text-caption text-ink-faint">
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
      <span className="w-16 shrink-0 truncate text-caption text-ink-muted">{label}</span>
      <div className="flex-1">{!hidden && <Bar score={pct} />}</div>
      <span className="w-9 shrink-0 text-right text-caption font-medium tabular-nums text-ink">
        {hidden ? "\u{1F512}" : `${pct}%`}
      </span>
    </div>
  );
}

function TodayRow({ label, logged, hidden }: { label: string; logged: boolean; hidden?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-body text-ink-muted">{label}</span>
      {hidden ? (
        <span className="text-right text-caption text-ink-faint">Hidden until you log today</span>
      ) : (
        <Chip tone={logged ? "sage" : "neutral"}>{logged ? "Logged" : "Not yet"}</Chip>
      )}
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
    <p className="min-w-0 flex-1 text-caption text-ink-muted">
      <span className="font-medium text-ink">{label}: </span>
      {parts.length > 0 ? parts.join(", ") : "clean so far"}
      {trustScore > 0 && ` · trust ${trustScore}`}
    </p>
  );
}
