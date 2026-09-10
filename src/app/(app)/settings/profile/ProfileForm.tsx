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
import { Field } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";

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

const selectClass =
  "mt-1 w-full min-h-11 rounded-row border border-glass-1-border bg-glass-1 px-4 text-ink outline-none focus:border-sage/50";
const labelClass = "block text-caption text-ink-muted";

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
      <Field
        id="age"
        name="age"
        label="Age"
        type="number"
        inputMode="numeric"
        enterKeyHint="next"
        min={13}
        max={100}
        required
        value={age}
        onChange={(e) => setAge(e.target.value)}
      />

      <Field
        id="height_cm"
        name="height_cm"
        label="Height (cm)"
        type="number"
        inputMode="decimal"
        enterKeyHint="next"
        step="0.1"
        min={100}
        max={250}
        required
        value={heightCm}
        onChange={(e) => setHeightCm(e.target.value)}
      />

      <Field
        id="weight_kg"
        name="weight_kg"
        label="Weight (kg)"
        type="number"
        inputMode="decimal"
        enterKeyHint="next"
        step="0.1"
        min={30}
        max={300}
        required
        value={weightKg}
        onChange={(e) => setWeightKg(e.target.value)}
      />

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
          style={{ fontSize: 16 }}
          className={selectClass}
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
        <p className="mt-1 text-caption text-ink-faint">Used by the calorie formula only.</p>
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
          style={{ fontSize: 16 }}
          className={selectClass}
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
          style={{ fontSize: 16 }}
          className={selectClass}
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

      <div className="border-t border-glass-1-border pt-4">
        <div className="flex items-center justify-between">
          <h2 className="text-section text-ink">Daily targets</h2>
          {targetsTouched && suggestion && (
            <button
              type="button"
              onClick={resetTargetsToSuggested}
              className="text-caption text-ink-muted underline underline-offset-2"
            >
              Use suggested
            </button>
          )}
        </div>
        <p className="mt-1 text-caption text-ink-muted">
          {suggestion
            ? "Calculated from your stats above. Change any of them."
            : "Fill in your stats above to see suggested numbers."}
        </p>

        <div className="mt-3 grid grid-cols-2 gap-3">
          <Field
            id="target_calories"
            name="target_calories"
            label="Calories"
            type="number"
            inputMode="numeric"
            enterKeyHint="next"
            min={800}
            max={6000}
            required
            value={displayedTargets.calories}
            onChange={(e) => editTarget("calories", e.target.value)}
          />
          <Field
            id="target_protein_g"
            name="target_protein_g"
            label="Protein (g)"
            type="number"
            inputMode="numeric"
            enterKeyHint="next"
            min={0}
            max={500}
            required
            value={displayedTargets.protein_g}
            onChange={(e) => editTarget("protein_g", e.target.value)}
          />
          <Field
            id="target_water_ml"
            name="target_water_ml"
            label="Water (ml)"
            type="number"
            inputMode="numeric"
            enterKeyHint="next"
            min={0}
            max={10000}
            required
            value={displayedTargets.water_ml}
            onChange={(e) => editTarget("water_ml", e.target.value)}
          />
          <Field
            id="target_sleep_hours"
            name="target_sleep_hours"
            label="Sleep (hours)"
            type="number"
            inputMode="decimal"
            enterKeyHint="done"
            step="0.5"
            min={0}
            max={14}
            required
            value={displayedTargets.sleep_hours}
            onChange={(e) => editTarget("sleep_hours", e.target.value)}
          />
        </div>
      </div>

      {state?.error && (
        <p role="alert" className="text-body text-clay">
          {state.error}
        </p>
      )}
      {state?.message && <p className="text-body text-sage">{state.message}</p>}

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Saving…" : "Save profile"}
      </Button>
    </form>
  );
}
