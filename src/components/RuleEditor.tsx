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
// that IS identical everywhere: the dropdown of not-yet-used metrics.

import type { RuleDraft } from "@/lib/challenges/types";
import type { MetricDef } from "@/lib/metrics/types";
import { metricLabel } from "@/lib/metrics/types";

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
  "mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-black outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50";
export const fieldLabelClass = "block text-xs font-medium text-zinc-600 dark:text-zinc-400";

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
        <div className="flex gap-2 text-xs">
          <button
            type="button"
            onClick={() => onChange({ scope: "shared" })}
            className={`rounded-full border px-3 py-1 ${
              rule.scope === "shared"
                ? "border-black bg-black text-white dark:border-white dark:bg-white dark:text-black"
                : "border-zinc-300 text-zinc-600 dark:border-zinc-700 dark:text-zinc-400"
            }`}
          >
            Same number for both
          </button>
          <button
            type="button"
            onClick={() => onChange({ scope: "own" })}
            className={`rounded-full border px-3 py-1 ${
              rule.scope === "own"
                ? "border-black bg-black text-white dark:border-white dark:bg-white dark:text-black"
                : "border-zinc-300 text-zinc-600 dark:border-zinc-700 dark:text-zinc-400"
            }`}
          >
            Each sets their own
          </button>
        </div>
      )}
      {rule.scopeLocked && (
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          Same schedule for everyone — individual gym schedules aren&rsquo;t supported yet.
        </p>
      )}

      {rule.shape === "boolean" && rule.schedule?.mode === "flexible" && (
        <div>
          <label className={fieldLabelClass}>Sessions per week</label>
          <input
            type="number"
            min={1}
            max={14}
            value={rule.schedule.sessionsPerWeek}
            onChange={(e) =>
              onChange({ schedule: { mode: "flexible", sessionsPerWeek: Number(e.target.value) } })
            }
            className={fieldInputClass}
          />
        </div>
      )}

      {rule.shape === "boolean" && rule.schedule?.mode === "fixed_days" && (
        <div>
          <label className={fieldLabelClass}>Which days</label>
          <div className="mt-1 flex flex-wrap gap-1.5">
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
                        days: active
                          ? schedule.days.filter((x) => x !== d.value)
                          : [...schedule.days, d.value],
                      },
                    })
                  }
                  className={`rounded-full border px-2.5 py-1 text-xs ${
                    active
                      ? "border-black bg-black text-white dark:border-white dark:bg-white dark:text-black"
                      : "border-zinc-300 text-zinc-600 dark:border-zinc-700 dark:text-zinc-400"
                  }`}
                >
                  {d.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {(rule.shape === "at_least" || rule.shape === "at_most") && (
        <div>
          <label className={fieldLabelClass}>{rule.scope === "own" ? "Your target" : "Target"}</label>
          <input
            type="number"
            step="any"
            value={rule.target ?? ""}
            onChange={(e) => onChange({ target: Number(e.target.value) })}
            className={fieldInputClass}
          />
        </div>
      )}

      {rule.shape === "range" && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={fieldLabelClass}>Min</label>
            <input
              type="number"
              step="any"
              value={rule.min ?? ""}
              onChange={(e) => onChange({ min: Number(e.target.value) })}
              className={fieldInputClass}
            />
          </div>
          <div>
            <label className={fieldLabelClass}>Max</label>
            <input
              type="number"
              step="any"
              value={rule.max ?? ""}
              onChange={(e) => onChange({ max: Number(e.target.value) })}
              className={fieldInputClass}
            />
          </div>
        </div>
      )}

      {showAdvanced && (
        <div className="space-y-2 border-t border-zinc-200 pt-3 text-xs dark:border-zinc-800">
          <div className="flex items-center justify-between">
            <span className="text-zinc-600 dark:text-zinc-400">Worth (1-5)</span>
            <input
              type="number"
              min={1}
              max={5}
              value={rule.weight}
              onChange={(e) => onChange({ weight: Number(e.target.value) })}
              className="w-16 rounded-md border border-zinc-300 bg-white px-2 py-1 text-black dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
            />
          </div>
          <label className="flex items-center justify-between">
            <span className="text-zinc-600 dark:text-zinc-400">Requires proof photo</span>
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
              className="text-xs underline text-zinc-600 dark:text-zinc-400"
            >
              {rule.schedule?.mode === "flexible" ? "Switch to fixed days" : "Switch to sessions/week"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** The "which metric" dropdown shared by every "+ Add a rule" flow. */
export function MetricPicker({
  metrics,
  value,
  onChange,
  className = "",
  placeholder = "+ Add a rule…",
}: {
  metrics: readonly MetricDef[];
  value: string;
  onChange: (key: string) => void;
  className?: string;
  placeholder?: string;
}) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={`${fieldInputClass} ${className}`}>
      <option value="">{placeholder}</option>
      {metrics.map((m) => (
        <option key={m.key} value={m.key}>
          {metricLabel(m)}
        </option>
      ))}
    </select>
  );
}
