import type { BooleanGoal, Goal, NumericGoal, ScoredGoal } from "./types";

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function scoreAtLeast(target: number, actual: number): number {
  if (target <= 0) return 100;
  return clamp((actual / target) * 100, 0, 100);
}

// Mirrors scoreAtLeast with the ratio flipped: hitting the ceiling exactly is
// 100%, going under it is still 100% (you didn't exceed it), and going over
// it costs you proportionally more the further past it you go.
function scoreAtMost(target: number, actual: number): number {
  if (actual <= 0) return 100;
  if (target <= 0) return 0;
  return clamp((target / actual) * 100, 0, 100);
}

function scoreRange(min: number, max: number, actual: number): number {
  if (actual < min) return scoreAtLeast(min, actual);
  if (actual > max) return scoreAtMost(max, actual);
  return 100;
}

export function scoreGoal(goal: NumericGoal, actual: number): number;
export function scoreGoal(goal: BooleanGoal, actual: boolean): number;
export function scoreGoal(goal: Goal, actual: number | boolean): number {
  switch (goal.shape) {
    case "at_least":
      return Math.round(scoreAtLeast(goal.target, actual as number));
    case "at_most":
      return Math.round(scoreAtMost(goal.target, actual as number));
    case "range":
      return Math.round(scoreRange(goal.min, goal.max, actual as number));
    case "boolean":
      return actual === true ? 100 : 0;
  }
}

// Weighted average of a day's already-scored goals, 0-100.
export function calculateDayScore(goals: ScoredGoal[]): number {
  const totalWeight = goals.reduce((sum, g) => sum + g.weight, 0);
  if (totalWeight <= 0) return 0;

  const weightedSum = goals.reduce((sum, g) => sum + g.score * g.weight, 0);
  return Math.round(weightedSum / totalWeight);
}
