// Plain types/constants for the metric catalog. Kept out of actions.ts for the
// usual reason: a "use server" file may only export async functions.

import type { GoalShape } from "@/lib/goals/types";

export type MetricValueType = "number" | "boolean";

export type MetricDef = {
  key: string;
  label: string;
  unit: string | null;
  value_type: MetricValueType;
  default_shape: GoalShape;
  step: number;
  max_plausible: number | null;
  is_builtin: boolean;
};

/**
 * The eight metrics seeded by step11_metrics_entries.sql. Used as a fallback so
 * the logging UI still renders something sensible if the catalog query fails,
 * and so tests don't need a database.
 */
export const BUILTIN_METRICS: readonly MetricDef[] = [
  { key: "calories", label: "Calories", unit: "kcal", value_type: "number", default_shape: "at_most", step: 10, max_plausible: 8000, is_builtin: true },
  { key: "protein_g", label: "Protein", unit: "g", value_type: "number", default_shape: "at_least", step: 5, max_plausible: 500, is_builtin: true },
  { key: "water_ml", label: "Water", unit: "ml", value_type: "number", default_shape: "at_least", step: 100, max_plausible: 10000, is_builtin: true },
  { key: "sleep_hours", label: "Sleep", unit: "h", value_type: "number", default_shape: "at_least", step: 0.5, max_plausible: 20, is_builtin: true },
  { key: "gym_done", label: "Gym", unit: null, value_type: "boolean", default_shape: "boolean", step: 1, max_plausible: null, is_builtin: true },
  { key: "steps", label: "Steps", unit: "steps", value_type: "number", default_shape: "at_least", step: 500, max_plausible: 60000, is_builtin: true },
  { key: "weight_kg", label: "Body weight", unit: "kg", value_type: "number", default_shape: "at_most", step: 0.1, max_plausible: 300, is_builtin: true },
  { key: "workout_minutes", label: "Workout length", unit: "min", value_type: "number", default_shape: "at_least", step: 5, max_plausible: 480, is_builtin: true },
];

export function findMetric(
  metrics: readonly MetricDef[],
  key: string,
): MetricDef | undefined {
  return metrics.find((m) => m.key === key);
}

/** "Protein (g)" — the label a form field shows. */
export function metricLabel(metric: MetricDef): string {
  return metric.unit ? `${metric.label} (${metric.unit})` : metric.label;
}
