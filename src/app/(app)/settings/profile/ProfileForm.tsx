"use client";

import { useActionState, useMemo, useState } from "react";
import { saveProfile, type ProfileState } from "@/lib/profile/actions";
import {
  ACTIVITY_LEVELS,
  AIMS,
  SEXES,
  type ActivityLevel,
  type Aim,
  type Profile,
  type Sex,
} from "@/lib/profile/types";
import {
  calculateRecommendations,
  isValidRecommendationInput,
} from "@/lib/profile/recommendations";

const ACTIVITY_LABELS: Record<(typeof ACTIVITY_LEVELS)[number], string> = {
  sedentary: "Sedentary (little to no exercise)",
  light: "Light (1-3 days/week)",
  moderate: "Moderate (3-5 days/week)",
  active: "Active (6-7 days/week)",
  very_active: "Very active (hard exercise + physical job)",
};

const AIM_LABELS: Record<(typeof AIMS)[number], string> = {
  cut: "Cut (lose fat)",
  bulk: "Bulk (gain muscle)",
  maintain: "Maintain",
};

const SEX_LABELS: Record<(typeof SEXES)[number], string> = {
  male: "Male",
  female: "Female",
};

const initialState: ProfileState = {};

const inputClass =
  "mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-black outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50";
const labelClass =
  "block text-sm font-medium text-zinc-700 dark:text-zinc-300";

type Targets = {
  calories: string;
  protein_g: string;
  water_ml: string;
  sleep_hours: string;
};

export function ProfileForm({ profile }: { profile: Profile | null }) {
  const [state, formAction, pending] = useActionState(
    saveProfile,
    initialState,
  );

  const [age, setAge] = useState(profile?.age?.toString() ?? "");
  const [heightCm, setHeightCm] = useState(
    profile?.height_cm?.toString() ?? "",
  );
  const [weightKg, setWeightKg] = useState(
    profile?.weight_kg?.toString() ?? "",
  );
  const [sex, setSex] = useState<Sex | "">(profile?.sex ?? "");
  const [activityLevel, setActivityLevel] = useState<ActivityLevel | "">(
    profile?.activity_level ?? "",
  );
  const [aim, setAim] = useState<Aim | "">(profile?.aim ?? "");

  const suggestion = useMemo(() => {
    const input = {
      age: Number(age),
      height_cm: Number(heightCm),
      weight_kg: Number(weightKg),
      sex,
      activity_level: activityLevel,
      aim,
    };
    return isValidRecommendationInput(input)
      ? calculateRecommendations(input)
      : null;
  }, [age, heightCm, weightKg, sex, activityLevel, aim]);

  // Targets stay in sync with the live suggestion until the user edits one
  // directly — at that point they take over and stop auto-updating.
  const [targetsTouched, setTargetsTouched] = useState(
    profile?.target_calories != null,
  );
  const [targets, setTargets] = useState<Targets>({
    calories: profile?.target_calories?.toString() ?? "",
    protein_g: profile?.target_protein_g?.toString() ?? "",
    water_ml: profile?.target_water_ml?.toString() ?? "",
    sleep_hours: profile?.target_sleep_hours?.toString() ?? "",
  });

  const displayedTargets: Targets = targetsTouched
    ? targets
    : {
        calories: suggestion?.calories.toString() ?? "",
        protein_g: suggestion?.protein_g.toString() ?? "",
        water_ml: suggestion?.water_ml.toString() ?? "",
        sleep_hours: suggestion?.sleep_hours.toString() ?? "",
      };

  function editTarget(field: keyof Targets, value: string) {
    setTargetsTouched(true);
    setTargets((prev) => ({ ...prev, [field]: value }));
  }

  function resetTargetsToSuggested() {
    setTargetsTouched(false);
  }

  return (
    <form action={formAction} className="mt-8 space-y-4">
      <div>
        <label htmlFor="age" className={labelClass}>
          Age
        </label>
        <input
          id="age"
          name="age"
          type="number"
          min={13}
          max={100}
          required
          value={age}
          onChange={(e) => setAge(e.target.value)}
          className={inputClass}
        />
      </div>

      <div>
        <label htmlFor="height_cm" className={labelClass}>
          Height (cm)
        </label>
        <input
          id="height_cm"
          name="height_cm"
          type="number"
          step="0.1"
          min={100}
          max={250}
          required
          value={heightCm}
          onChange={(e) => setHeightCm(e.target.value)}
          className={inputClass}
        />
      </div>

      <div>
        <label htmlFor="weight_kg" className={labelClass}>
          Weight (kg)
        </label>
        <input
          id="weight_kg"
          name="weight_kg"
          type="number"
          step="0.1"
          min={30}
          max={300}
          required
          value={weightKg}
          onChange={(e) => setWeightKg(e.target.value)}
          className={inputClass}
        />
      </div>

      <div>
        <label htmlFor="sex" className={labelClass}>
          Sex
        </label>
        <select
          id="sex"
          name="sex"
          required
          value={sex}
          onChange={(e) => setSex(e.target.value as Sex)}
          className={inputClass}
        >
          <option value="" disabled>
            Choose one
          </option>
          {SEXES.map((s) => (
            <option key={s} value={s}>
              {SEX_LABELS[s]}
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          Used by the calorie formula only.
        </p>
      </div>

      <div>
        <label htmlFor="activity_level" className={labelClass}>
          Activity level
        </label>
        <select
          id="activity_level"
          name="activity_level"
          required
          value={activityLevel}
          onChange={(e) => setActivityLevel(e.target.value as ActivityLevel)}
          className={inputClass}
        >
          <option value="" disabled>
            Choose one
          </option>
          {ACTIVITY_LEVELS.map((level) => (
            <option key={level} value={level}>
              {ACTIVITY_LABELS[level]}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="aim" className={labelClass}>
          What are you after?
        </label>
        <select
          id="aim"
          name="aim"
          required
          value={aim}
          onChange={(e) => setAim(e.target.value as Aim)}
          className={inputClass}
        >
          <option value="" disabled>
            Choose one
          </option>
          {AIMS.map((a) => (
            <option key={a} value={a}>
              {AIM_LABELS[a]}
            </option>
          ))}
        </select>
      </div>

      <div className="border-t border-zinc-200 pt-4 dark:border-zinc-800">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-black dark:text-zinc-50">
            Daily targets
          </h2>
          {targetsTouched && suggestion && (
            <button
              type="button"
              onClick={resetTargetsToSuggested}
              className="text-xs text-zinc-500 underline dark:text-zinc-400"
            >
              Use suggested
            </button>
          )}
        </div>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          {suggestion
            ? "Calculated from your stats above. Change any of them."
            : "Fill in your stats above to see suggested numbers."}
        </p>

        <div className="mt-3 grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="target_calories" className={labelClass}>
              Calories
            </label>
            <input
              id="target_calories"
              name="target_calories"
              type="number"
              min={800}
              max={6000}
              required
              value={displayedTargets.calories}
              onChange={(e) => editTarget("calories", e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="target_protein_g" className={labelClass}>
              Protein (g)
            </label>
            <input
              id="target_protein_g"
              name="target_protein_g"
              type="number"
              min={0}
              max={500}
              required
              value={displayedTargets.protein_g}
              onChange={(e) => editTarget("protein_g", e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="target_water_ml" className={labelClass}>
              Water (ml)
            </label>
            <input
              id="target_water_ml"
              name="target_water_ml"
              type="number"
              min={0}
              max={10000}
              required
              value={displayedTargets.water_ml}
              onChange={(e) => editTarget("water_ml", e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="target_sleep_hours" className={labelClass}>
              Sleep (hours)
            </label>
            <input
              id="target_sleep_hours"
              name="target_sleep_hours"
              type="number"
              step="0.5"
              min={0}
              max={14}
              required
              value={displayedTargets.sleep_hours}
              onChange={(e) => editTarget("sleep_hours", e.target.value)}
              className={inputClass}
            />
          </div>
        </div>
      </div>

      {state?.error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {state.error}
        </p>
      )}
      {state?.message && (
        <p className="text-sm text-emerald-600 dark:text-emerald-400">
          {state.message}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-md bg-black px-3 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-black"
      >
        {pending ? "Saving…" : "Save profile"}
      </button>
    </form>
  );
}
