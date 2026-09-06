import { describe, expect, it } from "vitest";
import { calculateDayScore, scoreGoal } from "./engine";

describe("scoreGoal — at_least", () => {
  it("scores 100 for hitting the target exactly", () => {
    expect(scoreGoal({ shape: "at_least", target: 150 }, 150)).toBe(100);
  });

  it("scores proportionally below the target", () => {
    expect(scoreGoal({ shape: "at_least", target: 200 }, 100)).toBe(50);
  });

  it("caps at 100 for overshooting — no extra credit", () => {
    expect(scoreGoal({ shape: "at_least", target: 150 }, 300)).toBe(100);
  });

  it("never goes below 0 for a zero actual", () => {
    expect(scoreGoal({ shape: "at_least", target: 150 }, 0)).toBe(0);
  });
});

describe("scoreGoal — at_most", () => {
  it("scores 100 for hitting the ceiling exactly", () => {
    expect(scoreGoal({ shape: "at_most", target: 1800 }, 1800)).toBe(100);
  });

  it("caps at 100 for staying well under the ceiling", () => {
    expect(scoreGoal({ shape: "at_most", target: 1800 }, 1200)).toBe(100);
  });

  it("scores proportionally lower the further over the ceiling", () => {
    expect(scoreGoal({ shape: "at_most", target: 2000 }, 2500)).toBe(80);
  });
});

describe("scoreGoal — range", () => {
  it("scores 100 anywhere inside the range", () => {
    expect(scoreGoal({ shape: "range", min: 7, max: 9 }, 8)).toBe(100);
    expect(scoreGoal({ shape: "range", min: 7, max: 9 }, 7)).toBe(100);
    expect(scoreGoal({ shape: "range", min: 7, max: 9 }, 9)).toBe(100);
  });

  it("scores like at_least when below the range", () => {
    expect(scoreGoal({ shape: "range", min: 8, max: 10 }, 4)).toBe(50);
  });

  it("scores like at_most when above the range", () => {
    expect(scoreGoal({ shape: "range", min: 7, max: 8 }, 10)).toBe(80);
  });
});

describe("scoreGoal — boolean", () => {
  it("scores 100 when true, 0 when false", () => {
    expect(scoreGoal({ shape: "boolean" }, true)).toBe(100);
    expect(scoreGoal({ shape: "boolean" }, false)).toBe(0);
  });
});

describe("fairness proof", () => {
  it("a cutter capping calories and a bulker flooring calories both score 100 when they hit their own target exactly", () => {
    const cutterScore = scoreGoal({ shape: "at_most", target: 1800 }, 1800);
    const bulkerScore = scoreGoal({ shape: "at_least", target: 3200 }, 3200);

    expect(cutterScore).toBe(100);
    expect(bulkerScore).toBe(100);
    expect(cutterScore).toBe(bulkerScore);
  });

  it("holds even though the two targets are wildly different sizes", () => {
    const tinyTarget = scoreGoal({ shape: "at_least", target: 10 }, 10);
    const hugeTarget = scoreGoal({ shape: "at_least", target: 10000 }, 10000);

    expect(tinyTarget).toBe(hugeTarget);
  });
});

describe("calculateDayScore", () => {
  it("averages equally-weighted goals", () => {
    expect(
      calculateDayScore([
        { score: 100, weight: 1 },
        { score: 50, weight: 1 },
      ]),
    ).toBe(75);
  });

  it("weights goals worth more to the person more heavily", () => {
    expect(
      calculateDayScore([
        { score: 100, weight: 3 },
        { score: 0, weight: 1 },
      ]),
    ).toBe(75);
  });

  it("returns 0 for an empty goal list instead of dividing by zero", () => {
    expect(calculateDayScore([])).toBe(0);
  });

  it("returns 0 when every weight is zero", () => {
    expect(
      calculateDayScore([
        { score: 100, weight: 0 },
        { score: 80, weight: 0 },
      ]),
    ).toBe(0);
  });
});
