"use client";

import { useActionState, useState } from "react";
import { createGoal, deleteGoal, type GoalState } from "@/lib/goals/actions";
import {
  GOAL_SHAPES,
  METRIC_LABELS,
  NUMERIC_METRICS,
  type GoalShape,
  type SavedGoal,
} from "@/lib/goals/types";

const SHAPE_LABELS: Record<GoalShape, string> = {
  at_least: "At least (hit a minimum)",
  at_most: "No more than (stay under a ceiling)",
  range: "In a range (between two numbers)",
  boolean: "Did you or didn't you (yes/no)",
};

function describeGoal(goal: SavedGoal): string {
  switch (goal.shape) {
    case "at_least":
      return `At least ${goal.target} ${METRIC_LABELS[goal.metric]}`;
    case "at_most":
      return `No more than ${goal.target} ${METRIC_LABELS[goal.metric]}`;
    case "range":
      return `Between ${goal.min} and ${goal.max} ${METRIC_LABELS[goal.metric]}`;
    case "boolean":
      return "Yes or no";
  }
}

const initialState: GoalState = {};

const inputClass =
  "mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-black outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50";
const labelClass =
  "block text-sm font-medium text-zinc-700 dark:text-zinc-300";

export function GoalsForm({ goals }: { goals: SavedGoal[] }) {
  const [state, formAction, pending] = useActionState(
    createGoal,
    initialState,
  );
  const [shape, setShape] = useState<GoalShape | "">("");

  return (
    <div className="mt-8 space-y-6">
      {goals.length > 0 && (
        <ul className="space-y-2">
          {goals.map((goal) => (
            <li
              key={goal.id}
              className="flex items-center justify-between rounded-md border border-zinc-200 px-3 py-2 dark:border-zinc-800"
            >
              <div>
                <p className="text-sm font-medium text-black dark:text-zinc-50">
                  {goal.name}
                </p>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  {describeGoal(goal)} &middot; worth {goal.weight}
                </p>
              </div>
              <form action={deleteGoal.bind(null, goal.id)}>
                <button
                  type="submit"
                  className="text-xs text-red-600 underline dark:text-red-400"
                >
                  Remove
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}

      <form
        action={formAction}
        key={state?.message ?? "goal-form"}
        className="space-y-4 border-t border-zinc-200 pt-6 dark:border-zinc-800"
      >
        <h2 className="text-sm font-semibold text-black dark:text-zinc-50">
          Add a goal
        </h2>

        <div>
          <label htmlFor="name" className={labelClass}>
            Name
          </label>
          <input
            id="name"
            name="name"
            type="text"
            required
            maxLength={60}
            placeholder="e.g. Protein, Gym, Sleep"
            className={inputClass}
          />
        </div>

        <div>
          <label htmlFor="shape" className={labelClass}>
            Shape
          </label>
          <select
            id="shape"
            name="shape"
            required
            value={shape}
            onChange={(e) => setShape(e.target.value as GoalShape)}
            className={inputClass}
          >
            <option value="" disabled>
              Choose one
            </option>
            {GOAL_SHAPES.map((s) => (
              <option key={s} value={s}>
                {SHAPE_LABELS[s]}
              </option>
            ))}
          </select>
        </div>

        {shape !== "" && shape !== "boolean" && (
          <div>
            <label htmlFor="metric" className={labelClass}>
              Counts toward
            </label>
            <select id="metric" name="metric" required defaultValue="" className={inputClass}>
              <option value="" disabled>
                Choose one
              </option>
              {NUMERIC_METRICS.map((m) => (
                <option key={m} value={m}>
                  {METRIC_LABELS[m]}
                </option>
              ))}
            </select>
          </div>
        )}

        {(shape === "at_least" || shape === "at_most") && (
          <div>
            <label htmlFor="target" className={labelClass}>
              Target
            </label>
            <input
              id="target"
              name="target"
              type="number"
              step="any"
              min={0}
              required
              className={inputClass}
            />
          </div>
        )}

        {shape === "range" && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="min" className={labelClass}>
                Min
              </label>
              <input
                id="min"
                name="min"
                type="number"
                step="any"
                min={0}
                required
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="max" className={labelClass}>
                Max
              </label>
              <input
                id="max"
                name="max"
                type="number"
                step="any"
                min={0}
                required
                className={inputClass}
              />
            </div>
          </div>
        )}

        <div>
          <label htmlFor="weight" className={labelClass}>
            Worth (1-5)
          </label>
          <input
            id="weight"
            name="weight"
            type="number"
            min={1}
            max={5}
            defaultValue={1}
            required
            className={inputClass}
          />
        </div>

        {state?.error && (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            {state.error}
          </p>
        )}
        {state?.message && (
          <p className="text-sm text-emerald-600 dark:text-emerald-400">
            {state.message}
          </p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-md bg-black px-3 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-black"
        >
          {pending ? "Adding…" : "Add goal"}
        </button>
      </form>
    </div>
  );
}
