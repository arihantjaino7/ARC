// Plain types shared between logs/actions.ts and the client form. Kept out of
// actions.ts because a "use server" file may only export async functions.

import type { DayEditState } from "@/lib/time/day";

/** One logged (user, day, metric) row. */
export type LogEntry = {
  metric_key: string;
  value_num: number | null;
  value_bool: boolean | null;
  source: "manual" | "device" | "proof";
  logged_at: string;
  /** Written after its own day had already closed (anti-cheat layer 3). */
  is_late: boolean;
  /** How many times the value has been changed since it was first written. */
  edit_count: number;
  /** Above the metric's max_plausible bound (anti-cheat layer 4). */
  implausible: boolean;
  /** A buddy has flagged this entry (V2 Step 11) — worth 0 in any challenge scoring it until resolved. */
  disputed: boolean;
};

/** A day's worth of entries, keyed by metric. */
export type DayLog = {
  date: string;
  /** The timezone the day was resolved in — the user's own. */
  tz: string;
  editState: DayEditState;
  entries: Record<string, LogEntry>;
};

/** The value of one metric on one day, flattened for scoring. */
export type DayValues = Record<string, number | boolean | null>;

export function toDayValues(log: DayLog | null): DayValues {
  if (!log) return {};

  const values: DayValues = {};
  for (const [key, entry] of Object.entries(log.entries)) {
    values[key] = entry.value_bool ?? entry.value_num ?? null;
  }
  return values;
}

/**
 * The prefix a logging form uses for its metric fields, so the action can pick
 * them out of the FormData without being told which metrics were rendered.
 */
export const FIELD_PREFIX = "m:";
