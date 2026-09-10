"use client";

// The per-rule editing UI (scope toggle, target/min/max, weight, gym
// schedule) — lifted here in Community Step C2 because it existed twice
// (src/app/(app)/buddies/new/NewChallengeWizard.tsx's per-rule cards and
// src/app/(app)/buddies/[id]/ChangeRequestPanel.tsx's RuleFields) and was
// about to exist a third time in the community creation form. Same reasoning
// as EntryBadges being lifted in V2 Step 9: pay the debt once, here, rather
// than copy it again.
//
// RuleEditor owns everything about editing ONE rule's shape-specific fields.
// It deliberately does NOT own the rule's header (label/remove button) or
// the "+ Add a rule" list-mutation — those differ enough between a six-screen
// wizard, a one-rule change proposal, and a plain form that forcing them into
// one component would just move the duplication inside it instead of
// removing it. MetricPicker below is the one small piece of "+ Add a rule"
// that IS identical everywhere: the dropdown of not-yet-used metrics. Its
// "+ Custom metric…" inline form is a Sheet (docs/PLAN-DESIGN.md D8) rather
// than an inline expanding div, matching every other one-off small form in
// the app (§3.1 #8).

import { useState } from "react";
import type { RuleDraft } from "@/lib/challenges/types";
import type { MetricDef } from "@/lib/metrics/types";
import { metricLabel } from "@/lib/metrics/types";
import type { GoalShape } from "@/lib/goals/types";
import { createMetric } from "@/lib/metrics/actions";
import { Field } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";

export const WEEKDAYS = [
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
  { value: 0, label: "Sun" },
] as const;

export const fieldInputClass =
  "mt-1 w-full min-h-11 rounded-row border border-glass-1-border bg-glass-1 px-4 text-ink outline-none focus:border-sage/50";
export const fieldLabelClass = "block text-caption text-ink-muted";

function pillClass(active: boolean): string {
  return `rounded-chip border px-3 py-1 text-caption ${
    active ? "border-sage/30 bg-sage/15 text-sage" : "border-glass-1-border text-ink-muted"
  }`;
}

function toggleGymMode(rule: RuleDraft, onChange: (patch: Partial<RuleDraft>) => void) {
  if (rule.schedule?.mode === "flexible") {
    onChange({ period: "daily", schedule: { mode: "fixed_days", days: [1, 3, 5] } });
  } else {
    onChange({ period: "weekly", schedule: { mode: "flexible", sessionsPerWeek: 4 } });
  }
}

/**
 * Everything about editing one RuleDraft's own fields: scope, gym schedule,
 * target/min/max, and (behind `showAdvanced`) weight/proof/gym-mode.
 * `showAdvanced` is controlled by the caller so it can be a per-screen
 * disclosure (the wizard's "Advanced" toggle) or always-on (a compact panel).
 */
export function RuleEditor({
  rule,
  onChange,
  showAdvanced,
}: {
  rule: RuleDraft;
  onChange: (patch: Partial<RuleDraft>) => void;
  showAdvanced: boolean;
}) {
  return (
    <div className="space-y-3">
      {!rule.scopeLocked && (
        <div className="flex gap-2">
          <button type="button" onClick={() => onChange({ scope: "shared" })} className={pillClass(rule.scope === "shared")}>
            Same number for both
          </button>
          <button type="button" onClick={() => onChange({ scope: "own" })} className={pillClass(rule.scope === "own")}>
            Each sets their own
          </button>
        </div>
      )}
      {rule.scopeLocked && rule.shape === "boolean" && (
        <p className="text-caption text-ink-muted">
          Same schedule for everyone — individual gym schedules aren&rsquo;t supported yet.
        </p>
      )}
      {rule.scopeLocked && rule.shape !== "boolean" && (
        <p className="text-caption text-ink-muted">
          Same number for everyone — the admin sets this, members don&rsquo;t customize it.
        </p>
      )}

      {rule.shape === "boolean" && rule.schedule?.mode === "flexible" && (
        <Field
          label="Sessions per week"
          type="number"
          inputMode="numeric"
          enterKeyHint="done"
          min={1}
          max={14}
          value={rule.schedule.sessionsPerWeek}
          onChange={(e) => onChange({ schedule: { mode: "flexible", sessionsPerWeek: Number(e.target.value) } })}
        />
      )}

      {rule.shape === "boolean" && rule.schedule?.mode === "fixed_days" && (
        <div>
          <label className={fieldLabelClass}>Which days</label>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {WEEKDAYS.map((d) => {
              const schedule = rule.schedule as { mode: "fixed_days"; days: number[] };
              const active = schedule.days.includes(d.value);
              return (
                <button
                  key={d.value}
                  type="button"
                  onClick={() =>
                    onChange({
                      schedule: {
                        mode: "fixed_days",
                        days: active ? schedule.days.filter((x) => x !== d.value) : [...schedule.days, d.value],
                      },
                    })
                  }
                  className={pillClass(active)}
                >
                  {d.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {(rule.shape === "at_least" || rule.shape === "at_most") && (
        <Field
          label={rule.scope === "own" ? "Your target" : "Target"}
          type="number"
          inputMode="decimal"
          enterKeyHint="done"
          step="any"
          value={rule.target ?? ""}
          onChange={(e) => onChange({ target: Number(e.target.value) })}
        />
      )}

      {rule.shape === "range" && (
        <div className="grid grid-cols-2 gap-3">
          <Field
            label="Min"
            type="number"
            inputMode="decimal"
            step="any"
            value={rule.min ?? ""}
            onChange={(e) => onChange({ min: Number(e.target.value) })}
          />
          <Field
            label="Max"
            type="number"
            inputMode="decimal"
            step="any"
            value={rule.max ?? ""}
            onChange={(e) => onChange({ max: Number(e.target.value) })}
          />
        </div>
      )}

      {showAdvanced && (
        <div className="space-y-3 border-t border-glass-1-border pt-3">
          <div className="flex items-center justify-between">
            <span className="text-caption text-ink-muted">Worth (1-5)</span>
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={5}
              value={rule.weight}
              onChange={(e) => onChange({ weight: Number(e.target.value) })}
              style={{ fontSize: 16 }}
              className="w-16 min-h-9 rounded-row border border-glass-1-border bg-glass-1 px-2 text-center text-ink outline-none focus:border-sage/50"
            />
          </div>
          <label className="flex items-center justify-between">
            <span className="text-caption text-ink-muted">Requires proof photo</span>
            <input
              type="checkbox"
              checked={rule.requiresProof}
              onChange={(e) => onChange({ requiresProof: e.target.checked })}
            />
          </label>
          {rule.shape === "boolean" && (
            <button
              type="button"
              onClick={() => toggleGymMode(rule, onChange)}
              className="text-caption text-ink-muted underline"
            >
              {rule.schedule?.mode === "flexible" ? "Switch to fixed days" : "Switch to sessions/week"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

const CUSTOM_METRIC_VALUE = "__custom__";

/**
 * The "which metric" dropdown shared by every "+ Add a rule" flow. When
 * `onMetricCreated` is passed, a "+ Custom metric…" option opens a Sheet
 * (name, unit, number/yes-no, and — for a number — its shape) that calls the
 * createMetric server action directly (the metrics table and its RLS have
 * supported private custom metrics since step11_metrics_entries.sql) and
 * hands the new MetricDef back to the caller to fold into its own metrics
 * list and auto-select.
 */
export function MetricPicker({
  metrics,
  value,
  onChange,
  className = "",
  placeholder = "+ Add a rule…",
  onMetricCreated,
}: {
  metrics: readonly MetricDef[];
  value: string;
  onChange: (key: string) => void;
  className?: string;
  placeholder?: string;
  onMetricCreated?: (metric: MetricDef) => void;
}) {
  const [creating, setCreating] = useState(false);
  const [label, setLabel] = useState("");
  const [unit, setUnit] = useState("");
  const [valueType, setValueType] = useState<"number" | "boolean">("number");
  const [shape, setShape] = useState<GoalShape>("at_least");
  const [step, setStep] = useState(1);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleSelect(v: string) {
    if (v === CUSTOM_METRIC_VALUE) {
      setCreating(true);
      setError(null);
      return;
    }
    onChange(v);
  }

  async function submitCustomMetric() {
    setPending(true);
    setError(null);
    const result = await createMetric({
      label,
      unit: unit.trim() || null,
      valueType,
      defaultShape: valueType === "boolean" ? "boolean" : shape,
      step,
      maxPlausible: null,
    });
    setPending(false);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    // onMetricCreated is the only hook here — it's the caller's job to both
    // fold the new metric into its own list AND select it, in one state
    // update. Calling this component's own `onChange` here too would read a
    // stale, not-yet-re-rendered `metrics` prop in every caller that looks a
    // key up by list membership (every current one does), silently no-oping.
    onMetricCreated?.(result.metric);
    setCreating(false);
    setLabel("");
    setUnit("");
    setValueType("number");
    setShape("at_least");
    setStep(1);
  }

  return (
    <>
      <select
        value={value}
        onChange={(e) => handleSelect(e.target.value)}
        style={{ fontSize: 16 }}
        className={`min-h-11 rounded-row border border-glass-1-border bg-glass-1 px-4 text-ink outline-none focus:border-sage/50 ${className}`}
      >
        <option value="">{placeholder}</option>
        {metrics.map((m) => (
          <option key={m.key} value={m.key}>
            {metricLabel(m)}
          </option>
        ))}
        {onMetricCreated && <option value={CUSTOM_METRIC_VALUE}>+ Custom metric…</option>}
      </select>

      <Sheet open={creating} onClose={() => setCreating(false)} title="New metric">
        <div className="space-y-3">
          <Field
            label="Name"
            placeholder="e.g. Reading minutes"
            value={label}
            maxLength={40}
            onChange={(e) => setLabel(e.target.value)}
          />
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={fieldLabelClass}>Type</label>
              <select
                value={valueType}
                onChange={(e) => setValueType(e.target.value as "number" | "boolean")}
                style={{ fontSize: 16 }}
                className="mt-1 w-full min-h-11 rounded-row border border-glass-1-border bg-glass-1 px-4 text-ink outline-none focus:border-sage/50"
              >
                <option value="number">A number</option>
                <option value="boolean">Yes / no</option>
              </select>
            </div>
            {valueType === "number" && (
              <Field label="Unit (optional)" placeholder="e.g. min" value={unit} maxLength={20} onChange={(e) => setUnit(e.target.value)} />
            )}
          </div>
          {valueType === "number" && (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className={fieldLabelClass}>Shape</label>
                <select
                  value={shape}
                  onChange={(e) => setShape(e.target.value as GoalShape)}
                  style={{ fontSize: 16 }}
                  className="mt-1 w-full min-h-11 rounded-row border border-glass-1-border bg-glass-1 px-4 text-ink outline-none focus:border-sage/50"
                >
                  <option value="at_least">At least</option>
                  <option value="at_most">At most</option>
                  <option value="range">Range</option>
                </select>
              </div>
              <Field
                label="Step size"
                type="number"
                inputMode="decimal"
                step="any"
                value={step}
                onChange={(e) => setStep(Number(e.target.value))}
              />
            </div>
          )}
          {error && <p className="text-caption text-clay">{error}</p>}
          <div className="flex gap-2 pt-1">
            <Button type="button" disabled={pending || !label.trim()} onClick={submitCustomMetric}>
              {pending ? "Adding…" : "Add metric"}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setCreating(false)}>
              Cancel
            </Button>
          </div>
        </div>
      </Sheet>
    </>
  );
}
