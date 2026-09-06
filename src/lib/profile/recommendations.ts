import { ACTIVITY_LEVELS, AIMS, SEXES } from "./types";
import type { ActivityLevel, Aim, Sex } from "./types";

export type RecommendationInput = {
  age: number;
  height_cm: number;
  weight_kg: number;
  sex: Sex;
  activity_level: ActivityLevel;
  aim: Aim;
};

export type Recommendations = {
  calories: number;
  protein_g: number;
  water_ml: number;
  sleep_hours: number;
};

const ACTIVITY_MULTIPLIER: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
};

// ml of water added on top of the 35ml/kg baseline, per activity level.
const ACTIVITY_WATER_BONUS_ML: Record<ActivityLevel, number> = {
  sedentary: 0,
  light: 250,
  moderate: 500,
  active: 750,
  very_active: 1000,
};

const CALORIE_ADJUSTMENT: Record<Aim, number> = {
  cut: 0.8, // ~20% deficit
  bulk: 1.15, // ~15% surplus
  maintain: 1,
};

// Grams of protein per kg bodyweight. Higher on a cut to protect muscle
// while in a deficit; lower at maintenance since there's no adaptation to fuel.
const PROTEIN_PER_KG: Record<Aim, number> = {
  cut: 2.2,
  bulk: 1.8,
  maintain: 1.6,
};

function roundTo(value: number, nearest: number): number {
  return Math.round(value / nearest) * nearest;
}

function isActivityLevel(value: unknown): value is ActivityLevel {
  return (
    typeof value === "string" &&
    (ACTIVITY_LEVELS as readonly string[]).includes(value)
  );
}

function isAim(value: unknown): value is Aim {
  return typeof value === "string" && (AIMS as readonly string[]).includes(value);
}

function isSex(value: unknown): value is Sex {
  return typeof value === "string" && (SEXES as readonly string[]).includes(value);
}

export function isValidRecommendationInput(input: {
  age: unknown;
  height_cm: unknown;
  weight_kg: unknown;
  sex: unknown;
  activity_level: unknown;
  aim: unknown;
}): input is RecommendationInput {
  return (
    typeof input.age === "number" &&
    Number.isFinite(input.age) &&
    typeof input.height_cm === "number" &&
    Number.isFinite(input.height_cm) &&
    typeof input.weight_kg === "number" &&
    Number.isFinite(input.weight_kg) &&
    isSex(input.sex) &&
    isActivityLevel(input.activity_level) &&
    isAim(input.aim)
  );
}

// Mifflin-St Jeor equation for basal metabolic rate.
export function calculateRecommendations({
  age,
  height_cm,
  weight_kg,
  sex,
  activity_level,
  aim,
}: RecommendationInput): Recommendations {
  const bmr =
    sex === "male"
      ? 10 * weight_kg + 6.25 * height_cm - 5 * age + 5
      : 10 * weight_kg + 6.25 * height_cm - 5 * age - 161;

  const tdee = bmr * ACTIVITY_MULTIPLIER[activity_level];
  const calories = roundTo(tdee * CALORIE_ADJUSTMENT[aim], 10);

  const protein_g = roundTo(weight_kg * PROTEIN_PER_KG[aim], 1);

  const water_ml = roundTo(
    weight_kg * 35 + ACTIVITY_WATER_BONUS_ML[activity_level],
    50,
  );

  const sleep_hours =
    activity_level === "active" ? 8.5 : activity_level === "very_active" ? 9 : 8;

  return { calories, protein_g, water_ml, sleep_hours };
}
