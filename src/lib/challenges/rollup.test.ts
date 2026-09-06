import { describe, expect, test } from "vitest";
import { dailyScores, findSuspiciousStreaks, groupAggregate, rollupRule } from "./rollup";
import type { GymSchedule, ResolvedRule, RuleLog } from "./types";

describe("rollupRule", () => {
  test("scope='own' fairness proof: a cutter and a bulker both score 100 hitting their own target", () => {
    // scope='own' resolution (challenge_rule_targets) happens before this
    // type exists — here that just means two rules with the same shape and
    // metric but different per-user targets, extending engine.test.ts's
    // fairness proof up through the rollup layer.
    const rule = (target: number): ResolvedRule => ({
      id: "protein-rule",
      metricKey: "protein_g",
      shape: "at_least",
      target,
      weight: 1,
      period: "daily",
      schedule: null,
      effectiveFrom: "2026-01-01",
      effectiveTo: null,
    });

    const cutterLog: RuleLog = {
      "2026-01-01": 150,
      "2026-01-02": 150,
      "2026-01-03": 150,
    };
    const bulkerLog: RuleLog = {
      "2026-01-01": 220,
      "2026-01-02": 220,
      "2026-01-03": 220,
    };

    const cutter = rollupRule(rule(150), cutterLog, "2026-01-01", "2026-01-01", "2026-01-03");
    const bulker = rollupRule(rule(220), bulkerLog, "2026-01-01", "2026-01-01", "2026-01-03");

    expect(cutter.score).toBe(100);
    expect(bulker.score).toBe(100);
  });

  test("fixed-days gym schedule excludes rest days from the denominator", () => {
    // 2024-01-01 is a known Monday, so the weekdays below are exact.
    const schedule: GymSchedule = { mode: "fixed_days", days: [1, 3, 5, 6] }; // Mon/Wed/Fri/Sat
    const rule: ResolvedRule = {
      id: "gym-rule",
      metricKey: "gym_done",
      shape: "boolean",
      weight: 1,
      period: "daily",
      schedule,
      effectiveFrom: "2024-01-01",
      effectiveTo: null,
    };

    // Every scheduled day across two weeks is logged done; the six rest
    // days (Tue/Thu/Sun) are never logged at all.
    const log: RuleLog = {
      "2024-01-01": true, // Mon
      "2024-01-03": true, // Wed
      "2024-01-05": true, // Fri
      "2024-01-06": true, // Sat
      "2024-01-08": true, // Mon
      "2024-01-10": true, // Wed
      "2024-01-12": true, // Fri
      "2024-01-13": true, // Sat
    };

    const result = rollupRule(rule, log, "2024-01-01", "2024-01-01", "2024-01-14");

    // Getting the exclusion wrong — scoring the 6 rest days as misses —
    // would give 8/14 ≈ 57%, exactly the trap docs/PLAN-V2.md §2 warns about.
    expect(result.score).toBe(100);
  });

  test("flexible 'N sessions per week' rule scores min(done/N, 1) per week, averaged", () => {
    const schedule: GymSchedule = { mode: "flexible", sessionsPerWeek: 3 };
    const rule: ResolvedRule = {
      id: "flex-gym-rule",
      metricKey: "gym_done",
      shape: "boolean",
      weight: 1,
      period: "weekly",
      schedule,
      effectiveFrom: "2024-01-01",
      effectiveTo: null,
    };

    const log: RuleLog = {
      "2024-01-01": true,
      "2024-01-03": true, // week 1: 2 of 3 sessions -> round(2/3 * 100) = 67
      "2024-01-08": true,
      "2024-01-09": true,
      "2024-01-10": true,
      "2024-01-11": true, // week 2: 4 sessions, capped at 100
    };

    const result = rollupRule(rule, log, "2024-01-01", "2024-01-01", "2024-01-14");

    expect(result.score).toBe(Math.round((67 + 100) / 2));
  });

  test("a rule effective mid-challenge only scores from its effective_from date", () => {
    const rule: ResolvedRule = {
      id: "late-rule",
      metricKey: "steps",
      shape: "at_least",
      target: 10000,
      weight: 1,
      period: "daily",
      schedule: null,
      effectiveFrom: "2026-01-05",
      effectiveTo: null,
    };

    // Days 1-4 predate the rule and are never logged; if they were wrongly
    // included they'd score 0 each and drag the average down.
    const log: RuleLog = {
      "2026-01-05": 10000,
      "2026-01-06": 10000,
      "2026-01-07": 10000,
    };

    const result = rollupRule(rule, log, "2026-01-01", "2026-01-01", "2026-01-07");

    expect(result.score).toBe(100);
  });

  test("a rule not yet effective for the whole range contributes zero weight", () => {
    const rule: ResolvedRule = {
      id: "future-rule",
      metricKey: "steps",
      shape: "at_least",
      target: 10000,
      weight: 3,
      period: "daily",
      schedule: null,
      effectiveFrom: "2026-02-01",
      effectiveTo: null,
    };

    const result = rollupRule(rule, {}, "2026-01-01", "2026-01-01", "2026-01-07");

    expect(result).toEqual({ score: 0, weight: 0 });
  });

  test("a grace-token day (V2 Step 13) is excused, not scored as a miss", () => {
    const rule: ResolvedRule = {
      id: "protein-rule",
      metricKey: "protein_g",
      shape: "at_least",
      target: 150,
      weight: 1,
      period: "daily",
      schedule: null,
      effectiveFrom: "2026-01-01",
      effectiveTo: null,
    };
    // Day 2 is never logged at all — without grace it would score 0 and drag
    // the average down to 50; with it excused, only day 1 and 3 count.
    const log: RuleLog = { "2026-01-01": 150, "2026-01-03": 150 };

    const result = rollupRule(rule, log, "2026-01-01", "2026-01-01", "2026-01-03", new Set(["2026-01-02"]));

    expect(result.score).toBe(100);
  });
});

describe("dailyScores", () => {
  test("scores each day of a daily rule independently", () => {
    const rule: ResolvedRule = {
      id: "protein-rule",
      metricKey: "protein_g",
      shape: "at_least",
      target: 150,
      weight: 1,
      period: "daily",
      schedule: null,
      effectiveFrom: "2026-01-01",
      effectiveTo: null,
    };
    const log: RuleLog = { "2026-01-01": 150, "2026-01-02": 75 };

    const result = dailyScores([rule], { protein_g: log }, "2026-01-01", "2026-01-03");

    expect(result).toEqual({
      "2026-01-01": 100,
      "2026-01-02": 50,
      "2026-01-03": 0, // unlogged scores 0, not a rest day
    });
  });

  test("a fixed-days rest day is null, not 0", () => {
    // 2024-01-01 is a known Monday.
    const schedule: GymSchedule = { mode: "fixed_days", days: [1, 3, 5] }; // Mon/Wed/Fri
    const rule: ResolvedRule = {
      id: "gym-rule",
      metricKey: "gym_done",
      shape: "boolean",
      weight: 1,
      period: "daily",
      schedule,
      effectiveFrom: "2024-01-01",
      effectiveTo: null,
    };
    const log: RuleLog = { "2024-01-01": true, "2024-01-03": true }; // Mon, Wed done

    const result = dailyScores([rule], { gym_done: log }, "2024-01-01", "2024-01-04");

    expect(result).toEqual({
      "2024-01-01": 100, // Mon, scheduled, done
      "2024-01-02": null, // Tue, rest day
      "2024-01-03": 100, // Wed, scheduled, done
      "2024-01-04": null, // Thu, rest day
    });
  });

  test("a weekly-period rule contributes nothing to the strip", () => {
    const rule: ResolvedRule = {
      id: "flex-gym-rule",
      metricKey: "gym_done",
      shape: "boolean",
      weight: 1,
      period: "weekly",
      schedule: { mode: "flexible", sessionsPerWeek: 3 },
      effectiveFrom: "2024-01-01",
      effectiveTo: null,
    };

    const result = dailyScores([rule], { gym_done: { "2024-01-01": true } }, "2024-01-01", "2024-01-02");

    expect(result).toEqual({ "2024-01-01": null, "2024-01-02": null });
  });

  test("a day before effective_from is null, not a scored miss", () => {
    const rule: ResolvedRule = {
      id: "late-rule",
      metricKey: "steps",
      shape: "at_least",
      target: 10000,
      weight: 1,
      period: "daily",
      schedule: null,
      effectiveFrom: "2026-01-03",
      effectiveTo: null,
    };

    const result = dailyScores([rule], {}, "2026-01-01", "2026-01-03");

    expect(result).toEqual({
      "2026-01-01": null,
      "2026-01-02": null,
      "2026-01-03": 0,
    });
  });

  test("a graced day is null in the strip, same as a rest day", () => {
    const rule: ResolvedRule = {
      id: "protein-rule",
      metricKey: "protein_g",
      shape: "at_least",
      target: 150,
      weight: 1,
      period: "daily",
      schedule: null,
      effectiveFrom: "2026-01-01",
      effectiveTo: null,
    };

    const result = dailyScores(
      [rule],
      { protein_g: { "2026-01-01": 150 } },
      "2026-01-01",
      "2026-01-02",
      new Set(["2026-01-02"]),
    );

    expect(result).toEqual({ "2026-01-01": 100, "2026-01-02": null });
  });
});

describe("findSuspiciousStreaks", () => {
  function buildLog(start: string, values: number[]): RuleLog {
    const log: RuleLog = {};
    values.forEach((v, i) => {
      log[shiftDateForTest(start, i)] = v;
    });
    return log;
  }

  // Local re-implementation of shiftDate's calendar math, so the test fixture
  // builder doesn't need to import a private helper from rollup.ts.
  function shiftDateForTest(date: string, days: number): string {
    const d = new Date(`${date}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  }

  test("14+ identical consecutive days is flagged", () => {
    const log = buildLog("2026-01-01", Array(14).fill(2000));

    const streaks = findSuspiciousStreaks(log);

    expect(streaks).toEqual([{ value: 2000, start: "2026-01-01", end: "2026-01-14", length: 14 }]);
  });

  test("13 identical days is not flagged — one short of the threshold", () => {
    const log = buildLog("2026-01-01", Array(13).fill(2000));

    expect(findSuspiciousStreaks(log)).toEqual([]);
  });

  test("noisy real logging (values vary) is never flagged, however long the run", () => {
    const log: RuleLog = {};
    for (let i = 0; i < 20; i++) {
      log[shiftDateForTest("2026-01-01", i)] = 2000 + (i % 3);
    }

    expect(findSuspiciousStreaks(log)).toEqual([]);
  });

  test("a gap in the calendar breaks the streak even if the value resumes", () => {
    const log: RuleLog = {
      ...buildLog("2026-01-01", Array(10).fill(1800)),
      // 2026-01-11 skipped entirely
      ...buildLog("2026-01-12", Array(10).fill(1800)),
    };

    expect(findSuspiciousStreaks(log)).toEqual([]);
  });

  test("boolean values in the same RuleLog are ignored, not treated as a streak", () => {
    const log: RuleLog = {};
    for (let i = 0; i < 20; i++) {
      log[shiftDateForTest("2026-01-01", i)] = true;
    }

    expect(findSuspiciousStreaks(log)).toEqual([]);
  });
});

describe("groupAggregate", () => {
  test("is the plain mean of member totals, rounded", () => {
    expect(groupAggregate([80, 90, 100])).toBe(90);
    expect(groupAggregate([50, 51])).toBe(51); // 50.5 rounds up
  });

  test("a single member's aggregate is just their own total", () => {
    expect(groupAggregate([73])).toBe(73);
  });

  test("no scored members yet is 0, not NaN", () => {
    expect(groupAggregate([])).toBe(0);
  });
});
