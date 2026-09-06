"use server";

import { createClient } from "@/lib/supabase/server";
import { BUILTIN_METRICS, type MetricDef } from "./types";

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
