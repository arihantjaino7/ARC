"use client";

import { useActionState, useState } from "react";
import { Card } from "@/components/Screen";
import { Field } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
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

const selectClass =
  "w-full min-h-11 rounded-row border border-glass-1-border bg-glass-1 px-4 text-ink outline-none focus:border-sage/50";
const labelClass = "mb-1.5 block text-caption text-ink-muted";

export function GoalsForm({ goals }: { goals: SavedGoal[] }) {
  const [state, formAction, pending] = useActionState(createGoal, initialState);
  const [shape, setShape] = useState<GoalShape | "">("");

  return (
    <div className="mt-2 space-y-6">
      {goals.length > 0 && (
        <ul className="space-y-2">
          {goals.map((goal) => (
            <li key={goal.id}>
              <Card className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-body font-medium text-ink">{goal.name}</p>
                  <p className="text-caption text-ink-muted">
                    {describeGoal(goal)} &middot; worth {goal.weight}
                  </p>
                </div>
                <form action={deleteGoal.bind(null, goal.id)}>
                  <button type="submit" className="shrink-0 text-caption text-clay underline">
                    Remove
                  </button>
                </form>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <form
        action={formAction}
        key={state?.message ?? "goal-form"}
        className="space-y-4 border-t border-glass-1-border pt-6"
      >
        <h2 className="text-section text-ink">Add a goal</h2>

        <Field
          label="Name"
          id="name"
          name="name"
          type="text"
          required
          maxLength={60}
          placeholder="e.g. Protein, Gym, Sleep"
        />

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
            className={selectClass}
            style={{ fontSize: 16 }}
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
            <select id="metric" name="metric" required defaultValue="" className={selectClass} style={{ fontSize: 16 }}>
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
          <Field
            label="Target"
            id="target"
            name="target"
            type="number"
            inputMode="decimal"
            enterKeyHint="done"
            step="any"
            min={0}
            required
          />
        )}

        {shape === "range" && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Min" id="min" name="min" type="number" inputMode="decimal" step="any" min={0} required />
            <Field label="Max" id="max" name="max" type="number" inputMode="decimal" step="any" min={0} required />
          </div>
        )}

        <Field
          label="Worth (1-5)"
          id="weight"
          name="weight"
          type="number"
          inputMode="numeric"
          enterKeyHint="done"
          min={1}
          max={5}
          defaultValue={1}
          required
        />

        {state?.error && (
          <p role="alert" className="text-body text-clay">
            {state.error}
          </p>
        )}
        {state?.message && <p className="text-body text-sage">{state.message}</p>}

        <Button type="submit" disabled={pending} className="w-full">
          {pending ? "Adding…" : "Add goal"}
        </Button>
      </form>
    </div>
  );
}
