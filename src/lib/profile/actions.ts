"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { ACTIVITY_LEVELS, AIMS, SEXES } from "./types";
import type { ActivityLevel, Aim, Profile, Sex } from "./types";

export type ProfileState = {
  error?: string;
  message?: string;
};

export async function getProfile(): Promise<Profile | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data } = await supabase
    .from("profiles")
    .select(
      "age, height_cm, weight_kg, sex, activity_level, aim, target_calories, target_protein_g, target_water_ml, target_sleep_hours, timezone, display_name",
    )
    .eq("id", user.id)
    .maybeSingle();

  return data;
}

export async function saveProfile(
  _prevState: ProfileState,
  formData: FormData,
): Promise<ProfileState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "You're not logged in." };
  }

  const age = Number(formData.get("age"));
  const height_cm = Number(formData.get("height_cm"));
  const weight_kg = Number(formData.get("weight_kg"));
  const sex = String(formData.get("sex"));
  const activity_level = String(formData.get("activity_level"));
  const aim = String(formData.get("aim"));
  const target_calories = Number(formData.get("target_calories"));
  const target_protein_g = Number(formData.get("target_protein_g"));
  const target_water_ml = Number(formData.get("target_water_ml"));
  const target_sleep_hours = Number(formData.get("target_sleep_hours"));

  if (!Number.isFinite(age) || age < 13 || age > 100) {
    return { error: "Enter a valid age between 13 and 100." };
  }
  if (!Number.isFinite(height_cm) || height_cm < 100 || height_cm > 250) {
    return { error: "Enter a valid height in cm between 100 and 250." };
  }
  if (!Number.isFinite(weight_kg) || weight_kg < 30 || weight_kg > 300) {
    return { error: "Enter a valid weight in kg between 30 and 300." };
  }
  if (!SEXES.includes(sex as Sex)) {
    return { error: "Pick a sex (used for the calorie formula)." };
  }
  if (!ACTIVITY_LEVELS.includes(activity_level as ActivityLevel)) {
    return { error: "Pick an activity level." };
  }
  if (!AIMS.includes(aim as Aim)) {
    return { error: "Pick what you're after." };
  }
  if (
    !Number.isFinite(target_calories) ||
    target_calories < 800 ||
    target_calories > 6000
  ) {
    return { error: "Enter a valid daily calorie target." };
  }
  if (
    !Number.isFinite(target_protein_g) ||
    target_protein_g < 0 ||
    target_protein_g > 500
  ) {
    return { error: "Enter a valid daily protein target." };
  }
  if (
    !Number.isFinite(target_water_ml) ||
    target_water_ml < 0 ||
    target_water_ml > 10000
  ) {
    return { error: "Enter a valid daily water target." };
  }
  if (
    !Number.isFinite(target_sleep_hours) ||
    target_sleep_hours < 0 ||
    target_sleep_hours > 14
  ) {
    return { error: "Enter a valid daily sleep target." };
  }

  const { error } = await supabase.from("profiles").upsert({
    id: user.id,
    age,
    height_cm,
    weight_kg,
    sex,
    activity_level,
    aim,
    target_calories,
    target_protein_g,
    target_water_ml,
    target_sleep_hours,
    updated_at: new Date().toISOString(),
  });

  if (error) {
    return { error: error.message };
  }

  return { message: "Profile saved." };
}

/**
 * The timezone every day boundary is decided in — both here and in the
 * database's log_entry_guard() trigger. Deliberately an UPDATE, not an upsert:
 * a profiles row can't be created without the body stats the table requires,
 * so an unset profile is told to fill itself in first rather than failing on a
 * NOT NULL violation.
 */
export async function saveTimezone(
  _prevState: ProfileState,
  formData: FormData,
): Promise<ProfileState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "You're not logged in." };
  }

  const timezone = String(formData.get("timezone") ?? "").trim();

  if (!timezone) {
    return { error: "Pick a time zone." };
  }

  // Reject anything Intl doesn't recognise, so a bad string can't quietly
  // break every day calculation downstream.
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone });
  } catch {
    return { error: `"${timezone}" isn't a time zone we recognise.` };
  }

  const { data, error } = await supabase
    .from("profiles")
    .update({ timezone, updated_at: new Date().toISOString() })
    .eq("id", user.id)
    .select("id");

  if (error) {
    return { error: error.message };
  }
  if (!data || data.length === 0) {
    return { error: "Fill in your profile first, then set your time zone." };
  }

  revalidatePath("/progress");
  revalidatePath("/settings");

  return { message: `Time zone set to ${timezone}.` };
}
