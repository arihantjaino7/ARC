"use client";

import { useActionState, useState } from "react";
import { saveDayLog, type LogState } from "@/lib/logs/actions";
import { FIELD_PREFIX, type DayLog } from "@/lib/logs/types";
import { metricLabel, type MetricDef } from "@/lib/metrics/types";
import { EntryBadges } from "@/components/EntryBadges";
import { Field } from "@/components/ui/Field";
import { Chip } from "@/components/ui/Chip";
import { Button } from "@/components/ui/Button";
import { Pressable } from "@/components/ui/Pressable";
import { CheckIcon } from "@/components/ui/icons";

const initialState: LogState = {};

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
    <form action={formAction} className="space-y-5">
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
        <p className="text-body text-ink-muted">
          Nothing is being tracked yet — open the list below, or set some goals.
        </p>
      )}

      {extra.length > 0 && (
        <div className="border-t border-glass-1-border pt-4">
          <button
            type="button"
            onClick={() => setShowExtra((v) => !v)}
            className="text-body font-medium text-ink-muted underline underline-offset-2"
          >
            {showExtra ? "Hide" : "Track something else"}
          </button>

          {showExtra && (
            <div className="mt-4 space-y-5">
              {extra.map((metric) => (
                <MetricField key={metric.key} metric={metric} log={log} disabled={!editable} />
              ))}
            </div>
          )}
        </div>
      )}

      {state?.error && (
        <p role="alert" className="text-body text-clay">
          {state.error}
        </p>
      )}
      {state?.message && <p className="text-body text-sage">{state.message}</p>}

      <Button type="submit" disabled={pending || !editable} className="w-full">
        {pending ? "Saving…" : "Save"}
      </Button>
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
        <label htmlFor={name} className="text-body font-medium text-ink">
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
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {feeds.map((name) => (
            <Chip key={name} tone="sage">
              {name}
            </Chip>
          ))}
        </div>
      )}

      <div className="mt-2">
        {metric.value_type === "boolean" ? (
          <BooleanField name={name} initial={entry?.value_bool ?? false} disabled={disabled} />
        ) : (
          <Field
            id={name}
            name={name}
            type="number"
            inputMode="decimal"
            enterKeyHint="done"
            step={metric.step}
            min={0}
            disabled={disabled}
            defaultValue={entry?.value_num ?? ""}
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
      <Pressable
        id={name}
        type="button"
        disabled={disabled}
        onClick={() => setOn((v) => !v)}
        className={`flex min-h-11 w-full items-center justify-center gap-1.5 rounded-row border text-body font-medium disabled:opacity-60 ${
          on
            ? "border-sage/30 bg-sage/15 text-sage"
            : "border-glass-1-border bg-glass-1 text-ink"
        }`}
      >
        {on && <CheckIcon size={16} />}
        {on ? "Done" : "Not yet"}
      </Pressable>
    </>
  );
}
