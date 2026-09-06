// Plain constants/types shared between the server actions and client
// components. Kept out of actions.ts because a "use server" file may only
// export async functions — a client component importing a non-function
// export from one silently gets a broken value instead of a build error.

export const ACTIVITY_LEVELS = [
  "sedentary",
  "light",
  "moderate",
  "active",
  "very_active",
] as const;

export const AIMS = ["cut", "bulk", "maintain"] as const;

export const SEXES = ["male", "female"] as const;

export type ActivityLevel = (typeof ACTIVITY_LEVELS)[number];
export type Aim = (typeof AIMS)[number];
export type Sex = (typeof SEXES)[number];

export type Profile = {
  age: number;
  height_cm: number;
  weight_kg: number;
  sex: Sex;
  activity_level: ActivityLevel;
  aim: Aim;
  target_calories: number | null;
  target_protein_g: number | null;
  target_water_ml: number | null;
  target_sleep_hours: number | null;
  /** IANA zone. Every "what day is it" decision is made in this. */
  timezone: string;
  display_name: string | null;
};
