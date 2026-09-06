// Everything about "what day is it for this user" lives here. Pure functions,
// no DB, no React — same style as scoring/engine.ts.
//
// The rule the whole app depends on: a day is decided by the user's stored
// IANA timezone applied to the *server's* clock, never by the browser's. The
// database enforces the same window in log_entry_guard() (step11 SQL); this
// module exists so the UI can show the right state without a round trip, and
// so the window itself is unit-testable.

/** Local time-of-day, in minutes past midnight, before which yesterday is still editable. */
export const GRACE_MINUTES = 10 * 60; // 10:00

export type DayEditState =
  /** The user's current day — freely editable. */
  | "open"
  /** Yesterday, still inside the morning grace window. */
  | "grace"
  /** Past its window. Frozen forever. */
  | "locked"
  /** Hasn't happened yet in this timezone. */
  | "future";

type Parts = { date: string; minutes: number };

function partsIn(tz: string, at: Date): Parts {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });

  const found: Record<string, string> = {};
  for (const part of formatter.formatToParts(at)) {
    if (part.type !== "literal") found[part.type] = part.value;
  }

  return {
    date: `${found.year}-${found.month}-${found.day}`,
    minutes: Number(found.hour) * 60 + Number(found.minute),
  };
}

/** The calendar date (YYYY-MM-DD) it currently is in `tz`. */
export function localDate(tz: string, at: Date = new Date()): string {
  return partsIn(tz, at).date;
}

/** Minutes past local midnight it currently is in `tz`. */
export function localMinutes(tz: string, at: Date = new Date()): number {
  return partsIn(tz, at).minutes;
}

/**
 * Shift a YYYY-MM-DD string by whole days. Uses UTC internally purely as
 * calendar arithmetic — the string in, the string out, no timezone involved.
 */
export function shiftDate(date: string, days: number): string {
  const shifted = new Date(`${date}T00:00:00Z`);
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return shifted.toISOString().slice(0, 10);
}

/** How many whole days apart two YYYY-MM-DD strings are (b - a). */
export function daysBetween(a: string, b: string): number {
  const ms = Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`);
  return Math.round(ms / 86_400_000);
}

/**
 * Whether `logDate` can still be written to, for a user in `tz`, right now.
 * Mirrors log_entry_guard() in step11_metrics_entries.sql exactly.
 */
export function dayEditState(
  logDate: string,
  tz: string,
  at: Date = new Date(),
): DayEditState {
  const { date: today, minutes } = partsIn(tz, at);

  if (logDate > today) return "future";
  if (logDate === today) return "open";
  if (logDate === shiftDate(today, -1) && minutes < GRACE_MINUTES) return "grace";
  return "locked";
}

export function isEditable(
  logDate: string,
  tz: string,
  at: Date = new Date(),
): boolean {
  const state = dayEditState(logDate, tz, at);
  return state === "open" || state === "grace";
}
