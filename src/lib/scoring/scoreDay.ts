// Wires Step 6's scoring engine to real data: a user's saved goals
// (src/lib/goals/types.ts) and a day's logged values (src/lib/logs/types.ts).
// Each goal's `metric` says which metric key it's judged against.
// Pure function, no DB, no React — same style as engine.ts.
//
// Since Step 11 a day is a bag of metric keys rather than five fixed columns,
// so this takes a flat `DayValues` map. Anything not in the map is unlogged.

import type { SavedGoal } from "@/lib/goals/types";
import type { DayValues } from "@/lib/logs/types";
import { calculateDayScore, scoreGoal } from "./engine";

export type GoalScore = {
  goal: SavedGoal;
  // null means the metric this goal needs was never logged today.
  actual: number | boolean | null;
  score: number;
};

export type DayScore = {
  goals: GoalScore[];
  total: number;
};

function actualFor(goal: SavedGoal, values: DayValues | null): number | boolean | null {
  const logged = values?.[goal.metric];

  if (goal.shape === "boolean") {
    // Nothing logged means the gym wasn't marked done — a real "no", not unknown.
    return typeof logged === "boolean" ? logged : false;
  }

  return typeof logged === "number" ? logged : null;
}

export function scoreDay(goals: SavedGoal[], values: DayValues | null): DayScore {
  const goalScores: GoalScore[] = goals.map((goal) => {
    const actual = actualFor(goal, values);

    // A metric that hasn't been logged scores 0 rather than running through
    // scoreGoal — an unlogged at_most goal would otherwise read as "0 used,
    // so under the ceiling" and score a false 100.
    let score: number;
    if (goal.shape === "boolean") {
      score = scoreGoal(goal, actual as boolean);
    } else if (actual === null) {
      score = 0;
    } else {
      score = scoreGoal(goal, actual as number);
    }

    return { goal, actual, score };
  });

  const total = calculateDayScore(
    goalScores.map((g) => ({ score: g.score, weight: g.goal.weight })),
  );

  return { goals: goalScores, total };
}
