"use client";

import { useActionState, useState } from "react";
import { saveDayLog, type LogState } from "@/lib/logs/actions";
import { FIELD_PREFIX, type DayLog } from "@/lib/logs/types";
import { metricLabel, type MetricDef } from "@/lib/metrics/types";
import { EntryBadges } from "@/components/EntryBadges";

const initialState: LogState = {};

const inputClass =
  "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-black outline-none focus:border-zinc-500 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50";

export function LogForm({
  metrics,
  required,
  feeds,
  log,
  editable,
}: {
  metrics: MetricDef[];
  /** Metric keys some goal or challenge needs — always on screen. */
  required: string[];
  /** What each metric key feeds (goal/challenge names), for the chips under its label. */
  feeds?: Record<string, string[]>;
  log: DayLog | null;
  editable: boolean;
}) {
  const [state, formAction, pending] = useActionState(saveDayLog, initialState);

  const requiredSet = new Set(required);
  const primary = metrics.filter((m) => requiredSet.has(m.key));
  const extra = metrics.filter((m) => !requiredSet.has(m.key));

  // Anything already logged today stays visible even if nothing requires it —
  // otherwise a value would silently sit in a collapsed section.
  const loggedExtra = extra.some((m) => log?.entries[m.key] !== undefined);
  const [showExtra, setShowExtra] = useState(loggedExtra);

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="log_date" value={log?.date ?? ""} />

      {primary.map((metric) => (
        <MetricField
          key={metric.key}
          metric={metric}
          log={log}
          disabled={!editable}
          feeds={feeds?.[metric.key]}
        />
      ))}

      {primary.length === 0 && (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Nothing is being tracked yet — open the list below, or set some goals.
        </p>
      )}

      {extra.length > 0 && (
        <div className="border-t border-zinc-200 pt-4 dark:border-zinc-800">
          <button
            type="button"
            onClick={() => setShowExtra((v) => !v)}
            className="text-sm font-medium text-zinc-600 underline underline-offset-2 dark:text-zinc-400"
          >
            {showExtra ? "Hide" : "Track something else"}
          </button>

          {showExtra && (
            <div className="mt-4 space-y-4">
              {extra.map((metric) => (
                <MetricField
                  key={metric.key}
                  metric={metric}
                  log={log}
                  disabled={!editable}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {state?.error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {state.error}
        </p>
      )}
      {state?.message && (
        <p className="text-sm text-emerald-600 dark:text-emerald-400">{state.message}</p>
      )}

      <button
        type="submit"
        disabled={pending || !editable}
        className="w-full rounded-lg bg-black px-3 py-2.5 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-black"
      >
        {pending ? "Saving…" : "Save"}
      </button>
    </form>
  );
}

function MetricField({
  metric,
  log,
  disabled,
  feeds,
}: {
  metric: MetricDef;
  log: DayLog | null;
  disabled: boolean;
  /** Names of the goals/challenges this metric counts toward — the "what this feeds" chips. */
  feeds?: string[];
}) {
  const entry = log?.entries[metric.key];
  const name = `${FIELD_PREFIX}${metric.key}`;

  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={name} className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
          {metricLabel(metric)}
        </label>
        {entry && (
          <EntryBadges
            isLate={entry.is_late}
            editCount={entry.edit_count}
            implausible={entry.implausible}
            disputed={entry.disputed}
          />
        )}
      </div>

      {feeds && feeds.length > 0 && (
        <p className="mt-0.5 truncate text-[11px] text-zinc-400 dark:text-zinc-600">
          Feeds {feeds.join(" · ")}
        </p>
      )}

      <div className="mt-1">
        {metric.value_type === "boolean" ? (
          <BooleanField
            name={name}
            initial={entry?.value_bool ?? false}
            disabled={disabled}
          />
        ) : (
          <input
            id={name}
            name={name}
            type="number"
            inputMode="decimal"
            step={metric.step}
            min={0}
            disabled={disabled}
            defaultValue={entry?.value_num ?? ""}
            className={inputClass}
          />
        )}
      </div>
    </div>
  );
}

function BooleanField({
  name,
  initial,
  disabled,
}: {
  name: string;
  initial: boolean;
  disabled: boolean;
}) {
  const [on, setOn] = useState(initial);

  return (
    <>
      <input type="hidden" name={name} value={on ? "true" : "false"} />
      <button
        id={name}
        type="button"
        disabled={disabled}
        onClick={() => setOn((v) => !v)}
        className={`w-full rounded-lg border px-3 py-2 text-sm font-medium transition disabled:opacity-60 ${
          on
            ? "border-emerald-600 bg-emerald-600 text-white"
            : "border-zinc-300 bg-white text-black dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
        }`}
      >
        {on ? "Done ✓" : "Not yet"}
      </button>
    </>
  );
}
