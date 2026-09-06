export type GoalShape = "at_least" | "at_most" | "range" | "boolean";

export const GOAL_SHAPES: readonly GoalShape[] = [
  "at_least",
  "at_most",
  "range",
  "boolean",
];

// The log column (src/lib/logs/types.ts) a goal scores itself against.
// gym_done is the only boolean log field, so it's paired exclusively with
// the "boolean" shape — every other shape picks one of the four numbers.
export type NumericMetric = "calories" | "protein_g" | "water_ml" | "sleep_hours";
export type Metric = NumericMetric | "gym_done";

export const NUMERIC_METRICS: readonly NumericMetric[] = [
  "calories",
  "protein_g",
  "water_ml",
  "sleep_hours",
];

export const METRIC_LABELS: Record<Metric, string> = {
  calories: "Calories",
  protein_g: "Protein",
  water_ml: "Water",
  sleep_hours: "Sleep",
  gym_done: "Gym",
};

// A goal as saved to the user's account: the scoring shape from
// src/lib/scoring/types.ts, plus the identity/weighting a saved row needs.
// Any SavedGoal can be passed straight to scoreGoal (minus id/name/weight/metric).
export type SavedGoal =
  | { id: string; name: string; weight: number; shape: "at_least"; target: number; metric: NumericMetric }
  | { id: string; name: string; weight: number; shape: "at_most"; target: number; metric: NumericMetric }
  | { id: string; name: string; weight: number; shape: "range"; min: number; max: number; metric: NumericMetric }
  | { id: string; name: string; weight: number; shape: "boolean"; metric: "gym_done" };
