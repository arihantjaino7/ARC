"use server";

import { createClient } from "@/lib/supabase/server";
import { BUILTIN_METRICS, slugifyMetricKey, type MetricDef } from "./types";
import type { GoalShape } from "@/lib/goals/types";

const SELECT = "key, label, unit, value_type, default_shape, step, max_plausible, is_builtin";

/**
 * The metrics this user can log against: every built-in, plus any custom ones
 * they've created. RLS does the filtering — the query itself is unqualified.
 */
export async function getMetrics(): Promise<MetricDef[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("metrics")
    .select(SELECT)
    .order("is_builtin", { ascending: false })
    .order("label");

  // Falling back to the seeded list keeps the logging screen usable if the
  // step11 migration hasn't been run yet, instead of rendering an empty form.
  if (error || !data || data.length === 0) {
    return [...BUILTIN_METRICS];
  }

  return data.map((row) => ({
    key: row.key,
    label: row.label,
    unit: row.unit,
    value_type: row.value_type,
    default_shape: row.default_shape,
    step: Number(row.step),
    max_plausible: row.max_plausible === null ? null : Number(row.max_plausible),
    is_builtin: row.is_builtin,
  }));
}

// ---------------------------------------------------------------------------
// Custom metrics — the "+ Custom metric" option in every MetricPicker
// dropdown (src/components/RuleEditor.tsx). The `metrics` table and its RLS
// ("Users can create their own metrics") have supported this since
// step11_metrics_entries.sql; nothing there needed to write for it, it just
// had no server action or UI wired up to it until now.
// ---------------------------------------------------------------------------

export type CreateMetricInput = {
  label: string;
  unit: string | null;
  valueType: "number" | "boolean";
  /** Required when valueType='number'; forced to 'boolean' otherwise. */
  defaultShape: GoalShape;
  step: number;
  maxPlausible: number | null;
};

export type CreateMetricResult = { error: string } | { metric: MetricDef };

export async function createMetric(input: CreateMetricInput): Promise<CreateMetricResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You're not logged in." };

  const label = input.label.trim();
  if (!label || label.length > 40) return { error: "Enter a name up to 40 characters." };
  if (input.unit && input.unit.length > 20) return { error: "Unit must be 20 characters or fewer." };

  if (input.valueType !== "number" && input.valueType !== "boolean") {
    return { error: "Choose a valid type." };
  }
  const defaultShape: GoalShape = input.valueType === "boolean" ? "boolean" : input.defaultShape;
  if (input.valueType === "number" && defaultShape === "boolean") {
    return { error: "A number metric needs a real shape (at least / at most / range)." };
  }
  if (input.valueType === "boolean" && defaultShape !== "boolean") {
    return { error: "A yes/no metric can only use the boolean shape." };
  }

  const step = input.valueType === "boolean" ? 1 : Number(input.step);
  if (input.valueType === "number" && (!Number.isFinite(step) || step <= 0)) {
    return { error: "Step must be a positive number." };
  }

  const key = slugifyMetricKey(label);

  const { data: clash } = await supabase
    .from("metrics")
    .select("key")
    .eq("key", key)
    .or(`is_builtin.eq.true,owner_id.eq.${user.id}`)
    .maybeSingle();
  if (clash) {
    return { error: `"${label}" maps to an existing metric key — try a slightly different name.` };
  }

  const { data, error } = await supabase
    .from("metrics")
    .insert({
      key,
      label,
      unit: input.unit?.trim() || null,
      value_type: input.valueType,
      default_shape: defaultShape,
      step,
      max_plausible: input.maxPlausible,
      is_builtin: false,
      owner_id: user.id,
    })
    .select("key, label, unit, value_type, default_shape, step, max_plausible, is_builtin")
    .single();

  if (error || !data) {
    return { error: error?.code === "23505" ? "You already have a metric with that name." : (error?.message ?? "Could not create the metric.") };
  }

  return {
    metric: {
      key: data.key,
      label: data.label,
      unit: data.unit,
      value_type: data.value_type,
      default_shape: data.default_shape,
      step: Number(data.step),
      max_plausible: data.max_plausible === null ? null : Number(data.max_plausible),
      is_builtin: data.is_builtin,
    },
  };
}
