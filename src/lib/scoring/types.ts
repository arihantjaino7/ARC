export type GoalShape = "at_least" | "at_most" | "range" | "boolean";

export type NumericGoal =
  | { shape: "at_least"; target: number }
  | { shape: "at_most"; target: number }
  | { shape: "range"; min: number; max: number };

export type BooleanGoal = { shape: "boolean" };

export type Goal = NumericGoal | BooleanGoal;

// A goal's score (0-100) paired with how much it counts toward the day total.
export type ScoredGoal = {
  score: number;
  weight: number;
};
