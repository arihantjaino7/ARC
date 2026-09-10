import Link from "next/link";
import { Card, Screen } from "@/components/Screen";
import { Surface } from "@/components/ui/Surface";
import { Chip } from "@/components/ui/Chip";
import { Bar } from "@/components/ui/Bar";
import { Ticker } from "@/components/ui/Ticker";
import { getGoals } from "@/lib/goals/actions";
import { getDayLog, getMyHeatStrip } from "@/lib/logs/actions";
import { toDayValues } from "@/lib/logs/types";
import { getMetrics } from "@/lib/metrics/actions";
import { findMetric, metricLabel } from "@/lib/metrics/types";
import { scoreDay, type GoalScore } from "@/lib/scoring/scoreDay";
import type { MetricDef } from "@/lib/metrics/types";
import { getMyActiveChallenges, getScoreboard } from "@/lib/challenges/actions";
import { LogForm } from "./LogForm";
import { HeatStrip } from "./HeatStrip";

function describeTarget(goal: GoalScore["goal"]): string {
  switch (goal.shape) {
    case "at_least":
      return `at least ${goal.target}`;
    case "at_most":
      return `at most ${goal.target}`;
    case "range":
      return `${goal.min}–${goal.max}`;
    case "boolean":
      return "yes / no";
  }
}

function describeActual(
  { goal, actual }: GoalScore,
  metrics: MetricDef[],
): string {
  if (goal.shape === "boolean") {
    return actual ? "Done" : "Not done";
  }
  if (actual === null) {
    return `Not logged · goal ${describeTarget(goal)}`;
  }
  const metric = findMetric(metrics, goal.metric);
  const unit = metric?.unit ? ` ${metric.unit}` : "";
  return `${actual}${unit} · goal ${describeTarget(goal)}`;
}

export default async function ProgressPage() {
  const [goals, log, metrics, activeChallenges] = await Promise.all([
    getGoals(),
    getDayLog(),
    getMetrics(),
    getMyActiveChallenges(),
  ]);

  const { goals: goalScores, total } = scoreDay(goals, toDayValues(log));
  const heatStrip = await getMyHeatStrip(goals);

  // The union of every metric something needs today: personal goals, plus
  // every live rule on every active buddy challenge (V2 Step 12) — this is
  // the payoff for making logging metric-centric back in V2 Step 2. One
  // logged number can feed a goal and two challenges at once.
  const required = [
    ...new Set([...goals.map((g) => g.metric), ...activeChallenges.flatMap((c) => c.metricKeys)]),
  ];

  // What each field "feeds" — the chips LogForm renders under a metric's
  // label, so nothing being tracked is ever a mystery.
  const feeds: Record<string, string[]> = {};
  for (const goal of goals) (feeds[goal.metric] ??= []).push(goal.name);
  for (const challenge of activeChallenges) {
    for (const key of challenge.metricKeys) (feeds[key] ??= []).push(challenge.name);
  }

  const challengeCards = (
    await Promise.all(
      activeChallenges.map(async (challenge) => {
        const board = await getScoreboard(challenge.id);
        if ("error" in board) return null;
        const mine = board.participants.find((p) => p.isCaller);
        return { id: challenge.id, name: challenge.name, kind: challenge.kind, total: mine?.total ?? 0 };
      }),
    )
  ).filter((c): c is { id: string; name: string; kind: "buddy" | "community"; total: number } => c !== null);

  const editable = log?.editState === "open" || log?.editState === "grace";

  return (
    <Screen
      title="Your progress"
      subtitle={log ? `Logging ${log.date} · ${log.tz}` : "Logging today"}
    >
      {log?.editState === "grace" && (
        <Surface tier={1} radius="row" className="mb-4 flex items-center gap-2 px-3 py-2.5">
          <Chip tone="ochre">Grace</Chip>
          <p className="text-caption text-ink-muted">
            You&rsquo;re editing yesterday. This day locks at 10:00 your time.
          </p>
        </Surface>
      )}
      {log?.editState === "locked" && (
        <Surface tier={1} radius="row" className="mb-4 flex items-center gap-2 px-3 py-2.5">
          <Chip>Locked</Chip>
          <p className="text-caption text-ink-muted">This day is locked and can&rsquo;t be changed.</p>
        </Surface>
      )}

      {/* tier 1, not 2 (D11 blur-budget fix): this card is always on screen
          alongside the tab bar and Screen's own sticky header, which already
          uses the §1.2-budgeted second blur layer — glass-1's fill/border
          reads as "raised" just as well without adding a third. */}
      <Surface tier={1} radius="card" className="p-4">
        <div className="flex items-baseline justify-between">
          <p className="text-overline text-ink-faint">Today</p>
          <p className="text-title text-ink">
            <Ticker value={total} />
            <span className="text-caption font-medium text-ink-faint">/100</span>
          </p>
        </div>

        <div className="mt-3">
          <LogForm
            metrics={metrics}
            required={required}
            feeds={feeds}
            log={log}
            editable={editable ?? true}
          />
        </div>
      </Surface>

      <div className="mt-6">
        <p className="text-overline text-ink-faint">Last 30 days</p>
        <Card className="mt-2">
          <HeatStrip cells={heatStrip} />
          <p className="mt-3 text-caption text-ink-faint">Blank cells are days nothing was logged.</p>
        </Card>
      </div>

      <div className="mt-6">
        <div className="flex items-center justify-between">
          <h2 className="text-section text-ink">Your goals</h2>
          <Link href="/goals" className="text-caption text-ink-muted underline underline-offset-2">
            Edit goals
          </Link>
        </div>

        {goals.length === 0 ? (
          <p className="mt-2 text-body text-ink-muted">
            No goals yet.{" "}
            <Link href="/goals" className="underline">
              Add some
            </Link>{" "}
            and your days start being scored.
          </p>
        ) : (
          <ul className="mt-2 space-y-2">
            {goalScores.map((goalScore, i) => (
              <li key={goalScore.goal.id}>
                <Card className="p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-body font-medium text-ink">{goalScore.goal.name}</p>
                      <p className="mt-0.5 truncate text-caption text-ink-muted">
                        {describeActual(goalScore, metrics)}
                      </p>
                    </div>
                    <span className="shrink-0 text-body font-semibold tabular-nums text-ink">
                      {goalScore.score}
                    </span>
                  </div>
                  <div className="mt-2">
                    <Bar score={goalScore.score} index={i} />
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </div>

      {challengeCards.length > 0 && (
        <div className="mt-6">
          <h2 className="text-section text-ink">Your challenges</h2>
          <ul className="mt-2 space-y-2">
            {challengeCards.map((c, i) => (
              <li key={c.id}>
                <Link href={c.kind === "community" ? "/community" : "/buddies"} className="block">
                  <Card>
                    <div className="flex items-center justify-between gap-3">
                      <p className="truncate text-body font-medium text-ink">{c.name}</p>
                      <span className="shrink-0 text-body font-semibold tabular-nums text-ink">{c.total}</span>
                    </div>
                    <div className="mt-2">
                      <Bar score={c.total} index={i} />
                    </div>
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="mt-6 text-caption text-ink-faint">
        Tracking{" "}
        {required.length > 0
          ? required
              .map((key) => {
                const metric = findMetric(metrics, key);
                return metric ? metricLabel(metric) : key;
              })
              .join(", ")
          : "nothing yet"}
        .
      </p>
    </Screen>
  );
}
