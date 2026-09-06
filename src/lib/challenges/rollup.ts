// Challenge scoring rollup — pure functions, no DB, no React, same style as
// src/lib/scoring/engine.ts and src/lib/time/day.ts. Turns a challenge's
// rules plus a window of logged values into per-rule and overall scores.
// DB code (V2 Step 6+) resolves scope='own' targets and pulls logged values
// before calling in here, so this file never touches Supabase.

import { calculateDayScore, scoreGoal } from "@/lib/scoring/engine";
import type { ScoredGoal } from "@/lib/scoring/types";
import { daysBetween, shiftDate } from "@/lib/time/day";
import type { ResolvedRule, RuleLog } from "./types";

export function datesInRange(start: string, end: string): string[] {
  const count = daysBetween(start, end);
  if (count < 0) return [];
  return Array.from({ length: count + 1 }, (_, i) => shiftDate(start, i));
}

function weekIndex(date: string, anchor: string): number {
  return Math.floor(daysBetween(anchor, date) / 7);
}

function weekdayOf(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

function isTruthy(value: number | boolean | undefined): boolean {
  return value === true || (typeof value === "number" && value > 0);
}

/**
 * Score one rule over [rangeStart, rangeEnd], clipped to the rule's own
 * effective_from/effective_to window — a rule contributes zero weight (is
 * excluded from the total, not scored as a failure) for any part of the
 * range it wasn't live for yet.
 */
export function rollupRule(
  rule: ResolvedRule,
  log: RuleLog,
  challengeStart: string,
  rangeStart: string,
  rangeEnd: string,
  graced: ReadonlySet<string> = new Set(),
): ScoredGoal {
  const windowStart = rule.effectiveFrom > rangeStart ? rule.effectiveFrom : rangeStart;
  const windowEnd =
    rule.effectiveTo && rule.effectiveTo < rangeEnd ? rule.effectiveTo : rangeEnd;
  const dates = datesInRange(windowStart, windowEnd);
  if (dates.length === 0) return { score: 0, weight: 0 };

  if (rule.period === "weekly") {
    if (!rule.schedule || rule.schedule.mode !== "flexible") {
      throw new Error(`Weekly rule ${rule.id} needs a flexible schedule.`);
    }
    const { sessionsPerWeek } = rule.schedule;

    const doneByWeek = new Map<number, number>();
    for (const date of dates) {
      const week = weekIndex(date, challengeStart);
      doneByWeek.set(week, (doneByWeek.get(week) ?? 0) + (isTruthy(log[date]) ? 1 : 0));
    }

    const weeks: ScoredGoal[] = Array.from(doneByWeek.values(), (done) => ({
      score: Math.round(Math.min(done / sessionsPerWeek, 1) * 100),
      weight: 1,
    }));
    return { score: calculateDayScore(weeks), weight: rule.weight };
  }

  // Daily. A fixed-days gym schedule only produces a scored slot on its own
  // days — a rest day is excluded from the denominator entirely, not scored
  // as a miss (docs/PLAN-V2.md §2, "Gym days and rest days": get this wrong
  // and every score caps around 57%). A grace-token day (V2 Step 13) gets the
  // exact same treatment — excused, not scored as a miss. Weekly
  // sessions-per-week rules don't get this exclusion: there's no clean way to
  // "excuse" one day out of a week's session count without also adjusting how
  // many sessions were required that week, so grace is daily-rules-only.
  const scheduledDays =
    rule.schedule?.mode === "fixed_days" ? new Set(rule.schedule.days) : null;

  const scoredDays: ScoredGoal[] = [];
  for (const date of dates) {
    if (scheduledDays && !scheduledDays.has(weekdayOf(date))) continue;
    if (graced.has(date)) continue;

    const value = log[date];
    const score =
      rule.shape === "boolean"
        ? scoreGoal(rule, value === true)
        : value === undefined
          ? 0 // unlogged scores 0, not whatever scoreGoal(0) would say (see scoreDay.ts)
          : scoreGoal(rule, value as number);
    scoredDays.push({ score, weight: 1 });
  }

  return { score: calculateDayScore(scoredDays), weight: rule.weight };
}

/**
 * Per-day scores for the buddy detail screen's 30-day heat strip
 * (docs/PLAN-V2.md §3.5). Built only from `daily`-period rules — a `weekly`
 * rule (e.g. flexible "N sessions/week" gym) has no single day it "happened
 * on", so it's left out of the strip entirely rather than smeared across
 * days it wasn't logged.
 *
 * A day is `null` (rendered as a neutral notch, not a failing score) when no
 * daily rule actually applied to it — either every daily rule is a
 * fixed-days schedule that excludes that weekday, there are no daily rules
 * covering it yet (before effective_from / after effective_to), or there
 * are no daily rules on the challenge at all. This mirrors rollupRule's own
 * "rest days don't produce a scored slot" rule, applied per day instead of
 * as a range average.
 */
export function dailyScores(
  rules: ResolvedRule[],
  logsByMetric: Record<string, RuleLog>,
  rangeStart: string,
  rangeEnd: string,
  graced: ReadonlySet<string> = new Set(),
): Record<string, number | null> {
  const dailyRules = rules.filter((rule) => rule.period === "daily");
  const result: Record<string, number | null> = {};

  for (const date of datesInRange(rangeStart, rangeEnd)) {
    const weekday = weekdayOf(date);
    const scored: ScoredGoal[] = [];

    for (const rule of dailyRules) {
      if (date < rule.effectiveFrom || (rule.effectiveTo && date > rule.effectiveTo)) continue;
      if (rule.schedule?.mode === "fixed_days" && !rule.schedule.days.includes(weekday)) continue;
      if (graced.has(date)) continue;

      const value = (logsByMetric[rule.metricKey] ?? {})[date];
      const score =
        rule.shape === "boolean"
          ? scoreGoal(rule, value === true)
          : value === undefined
            ? 0 // unlogged scores 0, same rule as rollupRule/scoreDay
            : scoreGoal(rule, value as number);
      scored.push({ score, weight: rule.weight });
    }

    result[date] = scored.length === 0 ? null : calculateDayScore(scored);
  }

  return result;
}

export type SuspiciousStreak = { value: number; start: string; end: string; length: number };

/**
 * Anti-cheat layer 4's pattern check (docs/PLAN-V2.md §4): a numeric metric
 * logged with the exact same value for `threshold`+ consecutive calendar
 * days is "suspiciously consistent" — real logging is noisy, copy-paste
 * isn't. Boolean metrics (e.g. gym_done every day) are deliberately excluded
 * from `log` by the caller filtering to numeric metrics only — an unbroken
 * streak of "done" is the goal here, not a red flag. A gap in the calendar
 * (a day with no entry at all) breaks the streak, same as a different value
 * would; only truly back-to-back identical days count.
 */
export function findSuspiciousStreaks(log: RuleLog, threshold = 14): SuspiciousStreak[] {
  const dates = Object.keys(log)
    .filter((d) => typeof log[d] === "number")
    .sort();

  const streaks: SuspiciousStreak[] = [];
  let run: { value: number; start: string; end: string; length: number } | null = null;

  for (const date of dates) {
    const value = log[date] as number;
    const contiguous = run !== null && shiftDate(run.end, 1) === date;

    if (contiguous && run!.value === value) {
      run!.end = date;
      run!.length += 1;
    } else {
      if (run && run.length >= threshold) streaks.push(run);
      run = { value, start: date, end: date, length: 1 };
    }
  }
  if (run && run.length >= threshold) streaks.push(run);

  return streaks;
}

/**
 * The community aggregate bar (docs/PLAN-V2.md §6, Community Step C5): the
 * mean of every member's own total, rounded — "the community competes as a
 * unit too." Deliberately a plain unweighted mean of already-computed totals
 * (not a second weighted rollup) so it means the same thing regardless of
 * how many rules or members there are. Empty input (no scored members yet)
 * is 0, same zero-guard style as calculateDayScore.
 */
export function groupAggregate(scores: number[]): number {
  if (scores.length === 0) return 0;
  return Math.round(scores.reduce((sum, s) => sum + s, 0) / scores.length);
}

/** Every rule's score plus the weighted total, for one participant. */
export function rollupChallenge(
  rules: ResolvedRule[],
  logsByMetric: Record<string, RuleLog>,
  challengeStart: string,
  rangeStart: string,
  rangeEnd: string,
  graced: ReadonlySet<string> = new Set(),
): { total: number; perRule: Record<string, ScoredGoal> } {
  const perRule: Record<string, ScoredGoal> = {};
  for (const rule of rules) {
    perRule[rule.id] = rollupRule(
      rule,
      logsByMetric[rule.metricKey] ?? {},
      challengeStart,
      rangeStart,
      rangeEnd,
      graced,
    );
  }
  return { total: calculateDayScore(Object.values(perRule)), perRule };
}
