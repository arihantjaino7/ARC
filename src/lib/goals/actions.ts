"use server";

import { createClient } from "@/lib/supabase/server";
import { GOAL_SHAPES, NUMERIC_METRICS } from "./types";
import type { GoalShape, Metric, NumericMetric, SavedGoal } from "./types";

export type GoalState = {
  error?: string;
  message?: string;
};

type GoalRow = {
  id: string;
  name: string;
  shape: GoalShape;
  target: number | null;
  min: number | null;
  max: number | null;
  weight: number;
  metric: Metric;
};

function toSavedGoal(row: GoalRow): SavedGoal {
  switch (row.shape) {
    case "at_least":
      return {
        id: row.id,
        name: row.name,
        weight: row.weight,
        shape: "at_least",
        target: row.target as number,
        metric: row.metric as NumericMetric,
      };
    case "at_most":
      return {
        id: row.id,
        name: row.name,
        weight: row.weight,
        shape: "at_most",
        target: row.target as number,
        metric: row.metric as NumericMetric,
      };
    case "range":
      return {
        id: row.id,
        name: row.name,
        weight: row.weight,
        shape: "range",
        min: row.min as number,
        max: row.max as number,
        metric: row.metric as NumericMetric,
      };
    case "boolean":
      return { id: row.id, name: row.name, weight: row.weight, shape: "boolean", metric: "gym_done" };
  }
}

export async function getGoals(): Promise<SavedGoal[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return [];

  const { data } = await supabase
    .from("goals")
    .select("id, name, shape, target, min, max, weight, metric")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });

  return (data ?? []).map(toSavedGoal);
}

export async function createGoal(
  _prevState: GoalState,
  formData: FormData,
): Promise<GoalState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "You're not logged in." };
  }

  const name = String(formData.get("name") ?? "").trim();
  const shape = String(formData.get("shape") ?? "");
  const weight = Number(formData.get("weight"));

  if (!name || name.length > 60) {
    return { error: "Enter a name, up to 60 characters." };
  }
  if (!GOAL_SHAPES.includes(shape as GoalShape)) {
    return { error: "Pick a goal shape." };
  }
  if (!Number.isFinite(weight) || weight < 1 || weight > 5) {
    return { error: "Weight must be between 1 and 5." };
  }

  let metric: Metric;
  if (shape === "boolean") {
    metric = "gym_done";
  } else {
    const rawMetric = String(formData.get("metric") ?? "");
    if (!NUMERIC_METRICS.includes(rawMetric as NumericMetric)) {
      return { error: "Pick what this goal counts toward." };
    }
    metric = rawMetric as NumericMetric;
  }

  const row: {
    user_id: string;
    name: string;
    shape: GoalShape;
    weight: number;
    target: number | null;
    min: number | null;
    max: number | null;
    metric: Metric;
  } = {
    user_id: user.id,
    name,
    shape: shape as GoalShape,
    weight,
    target: null,
    min: null,
    max: null,
    metric,
  };

  if (shape === "at_least" || shape === "at_most") {
    const target = Number(formData.get("target"));
    if (!Number.isFinite(target) || target <= 0) {
      return { error: "Enter a target greater than 0." };
    }
    row.target = target;
  } else if (shape === "range") {
    const min = Number(formData.get("min"));
    const max = Number(formData.get("max"));
    if (!Number.isFinite(min) || !Number.isFinite(max) || min < 0 || max <= min) {
      return { error: "Enter a valid range — max must be greater than min." };
    }
    row.min = min;
    row.max = max;
  }

  const { error } = await supabase.from("goals").insert(row);

  if (error) {
    return { error: error.message };
  }

  return { message: "Goal added." };
}

export async function deleteGoal(id: string): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return;

  await supabase.from("goals").delete().eq("id", id).eq("user_id", user.id);
}
