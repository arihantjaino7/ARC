import Link from "next/link";
import { Card, Screen } from "@/components/Screen";
import { getGoals } from "@/lib/goals/actions";
import { getDayLog } from "@/lib/logs/actions";
import { toDayValues } from "@/lib/logs/types";
import { getMetrics } from "@/lib/metrics/actions";
import { findMetric, metricLabel } from "@/lib/metrics/types";
import { scoreDay, type GoalScore } from "@/lib/scoring/scoreDay";
import type { MetricDef } from "@/lib/metrics/types";
import { getMyActiveChallenges, getScoreboard } from "@/lib/challenges/actions";
import { LogForm } from "./LogForm";

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
        <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950/50 dark:text-amber-300">
          You&rsquo;re editing yesterday. This day locks at 10:00 your time.
        </p>
      )}
      {log?.editState === "locked" && (
        <p className="mb-4 rounded-lg bg-zinc-100 px-3 py-2 text-xs text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400">
          This day is locked and can&rsquo;t be changed.
        </p>
      )}

      <Card>
        <div className="flex items-baseline justify-between">
          <p className="text-xs font-medium uppercase tracking-widest text-zinc-400">
            Today
          </p>
          <p className="text-2xl font-bold tracking-tight text-black dark:text-zinc-50">
            {total}
            <span className="text-sm font-medium text-zinc-400">/100</span>
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
      </Card>

      <div className="mt-6">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-black dark:text-zinc-50">
            Your goals
          </h2>
          <Link
            href="/goals"
            className="text-xs text-zinc-500 underline underline-offset-2 dark:text-zinc-400"
          >
            Edit goals
          </Link>
        </div>

        {goals.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
            No goals yet.{" "}
            <Link href="/goals" className="underline">
              Add some
            </Link>{" "}
            and your days start being scored.
          </p>
        ) : (
          <ul className="mt-2 space-y-2">
            {goalScores.map((goalScore) => (
              <li
                key={goalScore.goal.id}
                className="rounded-lg border border-zinc-200 px-3 py-2.5 dark:border-zinc-800"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-black dark:text-zinc-50">
                      {goalScore.goal.name}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-zinc-500 dark:text-zinc-400">
                      {describeActual(goalScore, metrics)}
                    </p>
                  </div>
                  <span className="shrink-0 text-sm font-semibold text-black dark:text-zinc-50">
                    {goalScore.score}
                  </span>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
                  <div
                    className="h-full rounded-full bg-emerald-500"
                    style={{ width: `${goalScore.score}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {challengeCards.length > 0 && (
        <div className="mt-6">
          <h2 className="text-sm font-semibold text-black dark:text-zinc-50">
            Your challenges
          </h2>
          <ul className="mt-2 space-y-2">
            {challengeCards.map((c) => (
              <li key={c.id}>
                <Link href={c.kind === "community" ? "/community" : "/buddies"} className="block">
                  <Card>
                    <div className="flex items-center justify-between gap-3">
                      <p className="truncate text-sm font-medium text-black dark:text-zinc-50">{c.name}</p>
                      <span className="shrink-0 text-sm font-semibold text-black dark:text-zinc-50">
                        {c.total}
                      </span>
                    </div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
                      <div
                        className="h-full rounded-full bg-black dark:bg-white"
                        style={{ width: `${Math.max(0, Math.min(100, c.total))}%` }}
                      />
                    </div>
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="mt-6 text-xs text-zinc-400 dark:text-zinc-600">
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
