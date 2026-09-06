import { describe, expect, it } from "vitest";
import type { SavedGoal } from "@/lib/goals/types";
import type { DayValues } from "@/lib/logs/types";
import { scoreDay } from "./scoreDay";

const proteinGoal: SavedGoal = {
  id: "1",
  name: "Protein",
  weight: 2,
  shape: "at_least",
  target: 150,
  metric: "protein_g",
};

const calorieCeiling: SavedGoal = {
  id: "2",
  name: "Calories",
  weight: 1,
  shape: "at_most",
  target: 1800,
  metric: "calories",
};

const sleepRange: SavedGoal = {
  id: "3",
  name: "Sleep",
  weight: 1,
  shape: "range",
  min: 7,
  max: 9,
  metric: "sleep_hours",
};

const gymGoal: SavedGoal = {
  id: "4",
  name: "Gym",
  weight: 1,
  shape: "boolean",
  metric: "gym_done",
};

function log(overrides: Partial<DayValues>): DayValues {
  return {
    calories: null,
    protein_g: null,
    water_ml: null,
    sleep_hours: null,
    gym_done: false,
    ...overrides,
  };
}

describe("scoreDay", () => {
  it("scores a goal against the log field its metric points to", () => {
    const result = scoreDay([proteinGoal], log({ protein_g: 75 }));
    expect(result.goals[0].actual).toBe(75);
    expect(result.goals[0].score).toBe(50);
    expect(result.total).toBe(50);
  });

  it("scores an unlogged metric as 0, not as an accidental 100", () => {
    // actual=0 on an at_most goal would score 100 ("under the ceiling") —
    // this is the case scoreDay must intercept before it reaches scoreGoal.
    const result = scoreDay([calorieCeiling], log({}));
    expect(result.goals[0].actual).toBeNull();
    expect(result.goals[0].score).toBe(0);
  });

  it("scores every goal as 0 when there's no log for the day at all", () => {
    const result = scoreDay([proteinGoal, calorieCeiling], null);
    expect(result.goals.every((g) => g.score === 0)).toBe(true);
    expect(result.total).toBe(0);
  });

  it("reads a boolean goal straight from gym_done, defaulting to false with no log", () => {
    expect(scoreDay([gymGoal], null).goals[0]).toMatchObject({ actual: false, score: 0 });
    expect(scoreDay([gymGoal], log({ gym_done: true })).goals[0]).toMatchObject({
      actual: true,
      score: 100,
    });
  });

  it("scores a range goal inside its window as 100", () => {
    const result = scoreDay([sleepRange], log({ sleep_hours: 8 }));
    expect(result.goals[0].score).toBe(100);
  });

  it("combines goals into a weighted total, same as calculateDayScore", () => {
    // protein (weight 2) at 50%, gym (weight 1) done -> (50*2 + 100*1) / 3 = 66.67 -> 67
    const result = scoreDay(
      [proteinGoal, gymGoal],
      log({ protein_g: 75, gym_done: true }),
    );
    expect(result.total).toBe(67);
  });
});
