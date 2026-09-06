"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/Screen";
import { MetricPicker, RuleEditor, WEEKDAYS } from "@/components/RuleEditor";
import { createChallenge, type CreateChallengeInput } from "@/lib/challenges/actions";
import {
  CHALLENGE_PRESETS,
  findPreset,
  newCustomRule,
  toRuleInput,
  type ChallengePresetId,
  type RuleDraft,
} from "@/lib/challenges/types";
import type { Recommendations } from "@/lib/profile/recommendations";
import { shiftDate } from "@/lib/time/day";
import { BUILTIN_METRICS } from "@/lib/metrics/types";

export type BuddyOption = { userId: string; email: string };

type DurationMode = "1w" | "30d" | "90d" | "custom";
type WhoMode = "buddy" | "link";

const inputClass =
  "mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-black outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50";
const labelClass = "block text-sm font-medium text-zinc-700 dark:text-zinc-300";
const primaryBtn =
  "rounded-md bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-40 dark:bg-white dark:text-black";
const ghostBtn =
  "rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-black dark:border-zinc-700 dark:text-zinc-50";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function durationDays(mode: DurationMode): number {
  return mode === "1w" ? 7 : mode === "30d" ? 30 : mode === "90d" ? 90 : 30;
}

function ruleHasError(rule: RuleDraft): string | null {
  if (rule.shape === "at_least" || rule.shape === "at_most") {
    if (!Number.isFinite(rule.target) || (rule.target as number) <= 0) {
      return `Enter a target for ${rule.label}.`;
    }
  } else if (rule.shape === "range") {
    if (
      !Number.isFinite(rule.min) ||
      !Number.isFinite(rule.max) ||
      (rule.min as number) < 0 ||
      (rule.max as number) <= (rule.min as number)
    ) {
      return `Enter a valid range for ${rule.label} — max must be greater than min.`;
    }
  }
  if (rule.period === "weekly" && rule.schedule?.mode === "flexible") {
    if (
      !Number.isInteger(rule.schedule.sessionsPerWeek) ||
      rule.schedule.sessionsPerWeek < 1 ||
      rule.schedule.sessionsPerWeek > 14
    ) {
      return `Enter a valid sessions-per-week number for ${rule.label}.`;
    }
  }
  if (rule.schedule?.mode === "fixed_days" && rule.schedule.days.length === 0) {
    return `Pick at least one day for ${rule.label}.`;
  }
  return null;
}

function describeRule(rule: RuleDraft): string {
  const scopeNote = rule.scopeLocked ? "" : rule.scope === "own" ? " (each sets their own)" : " (shared number)";
  if (rule.shape === "boolean" && rule.schedule?.mode === "flexible") {
    return `${rule.label} — ${rule.schedule.sessionsPerWeek}x/week`;
  }
  if (rule.shape === "boolean" && rule.schedule?.mode === "fixed_days") {
    const days = rule.schedule.days.map((d) => WEEKDAYS.find((w) => w.value === d)?.label).join(", ");
    return `${rule.label} — on ${days}`;
  }
  if (rule.shape === "at_least") return `${rule.label} — at least ${rule.target}${scopeNote}`;
  if (rule.shape === "at_most") return `${rule.label} — no more than ${rule.target}${scopeNote}`;
  if (rule.shape === "range") return `${rule.label} — between ${rule.min} and ${rule.max}${scopeNote}`;
  return rule.label;
}

export function NewChallengeWizard({
  buddies,
  recommendations,
  initialBuddyId,
}: {
  buddies: BuddyOption[];
  recommendations: Recommendations | null;
  initialBuddyId: string | null;
}) {
  const [step, setStep] = useState(1);

  const [whoMode, setWhoMode] = useState<WhoMode>(initialBuddyId || buddies.length > 0 ? "buddy" : "link");
  const [buddyId, setBuddyId] = useState<string | null>(initialBuddyId ?? buddies[0]?.userId ?? null);

  const [presetId, setPresetId] = useState<ChallengePresetId | null>(null);
  const [rules, setRules] = useState<RuleDraft[]>([]);

  const [durationMode, setDurationMode] = useState<DurationMode>("30d");
  const [startDate, setStartDate] = useState(todayIso());
  const [endDate, setEndDate] = useState(shiftDate(todayIso(), 29));

  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [blindMode, setBlindMode] = useState(true);
  const [addMetricKey, setAddMetricKey] = useState("");

  const [stakeText, setStakeText] = useState("");
  const [name, setName] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [result, setResult] = useState<{ token: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const usedMetricKeys = useMemo(() => new Set(rules.map((r) => r.metricKey)), [rules]);
  const addableMetrics = BUILTIN_METRICS.filter((m) => !usedMetricKeys.has(m.key));

  function pickPreset(id: ChallengePresetId) {
    setPresetId(id);
    const preset = findPreset(id);
    const newRules = preset.buildRules(recommendations);
    setRules(newRules);
    setName(id === "custom" ? "Custom challenge" : preset.name);
  }

  function pickDuration(mode: DurationMode) {
    setDurationMode(mode);
    if (mode === "custom") return;
    const start = todayIso();
    setStartDate(start);
    setEndDate(shiftDate(start, durationDays(mode) - 1));
  }

  function updateRule(key: string, patch: Partial<RuleDraft>) {
    setRules((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  function removeRule(key: string) {
    setRules((prev) => (prev.length > 1 ? prev.filter((r) => r.key !== key) : prev));
  }

  function addRule() {
    const metric = addableMetrics.find((m) => m.key === addMetricKey);
    if (!metric) return;
    setRules((prev) => [...prev, newCustomRule(metric.key, metric.label, metric.default_shape)]);
    setAddMetricKey("");
  }

  const rulesErrors = rules.map(ruleHasError).filter((e): e is string => Boolean(e));

  const canProceed: Record<number, boolean> = {
    1: whoMode === "link" || Boolean(buddyId),
    2: Boolean(presetId),
    3: durationMode !== "custom" || (Boolean(startDate) && Boolean(endDate) && endDate >= startDate),
    4: rules.length > 0 && rulesErrors.length === 0,
    5: true,
    6: true,
  };

  async function handleSubmit() {
    setSubmitting(true);
    setSubmitError(null);

    const input: CreateChallengeInput = {
      buddyUserId: whoMode === "buddy" ? buddyId : null,
      name: name.trim() || "Challenge",
      startDate,
      endDate,
      stakeText: stakeText.trim() || null,
      blindMode,
      rules: rules.map(toRuleInput),
    };

    const res = await createChallenge(input);
    setSubmitting(false);

    if ("error" in res) {
      setSubmitError(res.error);
      return;
    }
    setResult({ token: res.token });
  }

  if (result) {
    const link = typeof window !== "undefined" ? `${window.location.origin}/join/${result.token}` : "";
    return (
      <Card className="space-y-4 text-center">
        <p className="text-lg font-semibold text-black dark:text-zinc-50">Challenge created 🎉</p>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          {whoMode === "buddy"
            ? "It's waiting for them on their Buddies tab — send the link too in case they haven't checked the app."
            : "Send this link to whoever you want in the challenge."}
        </p>
        <div className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-left text-xs break-all text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
          {link}
        </div>
        <button
          type="button"
          onClick={() => {
            navigator.clipboard.writeText(link).then(() => setCopied(true));
          }}
          className={primaryBtn + " w-full"}
        >
          {copied ? "Copied!" : "Copy link"}
        </button>
        <Link href="/buddies" className="block text-sm text-zinc-500 underline dark:text-zinc-400">
          Done — back to Buddies
        </Link>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <StepDots step={step} />

      {step === 1 && (
        <WhoScreen
          buddies={buddies}
          whoMode={whoMode}
          buddyId={buddyId}
          onModeChange={setWhoMode}
          onBuddyChange={setBuddyId}
        />
      )}

      {step === 2 && <KindScreen presetId={presetId} onPick={pickPreset} />}

      {step === 3 && (
        <DurationScreen
          durationMode={durationMode}
          startDate={startDate}
          endDate={endDate}
          onPick={pickDuration}
          onStartChange={setStartDate}
          onEndChange={setEndDate}
        />
      )}

      {step === 4 && (
        <RulesScreen
          rules={rules}
          rulesErrors={rulesErrors}
          advancedOpen={advancedOpen}
          blindMode={blindMode}
          addableMetrics={addableMetrics}
          addMetricKey={addMetricKey}
          onUpdateRule={updateRule}
          onRemoveRule={removeRule}
          onToggleAdvanced={() => setAdvancedOpen((v) => !v)}
          onBlindModeChange={setBlindMode}
          onAddMetricKeyChange={setAddMetricKey}
          onAddRule={addRule}
        />
      )}

      {step === 5 && <StakeScreen stakeText={stakeText} onChange={setStakeText} />}

      {step === 6 && (
        <ReviewScreen
          name={name}
          onNameChange={setName}
          whoMode={whoMode}
          buddyEmail={buddies.find((b) => b.userId === buddyId)?.email ?? null}
          startDate={startDate}
          endDate={endDate}
          rules={rules}
          stakeText={stakeText}
          blindMode={blindMode}
          submitError={submitError}
        />
      )}

      <div className="flex items-center justify-between pt-2">
        <button
          type="button"
          onClick={() => setStep((s) => Math.max(1, s - 1))}
          disabled={step === 1}
          className={ghostBtn + " disabled:opacity-40"}
        >
          Back
        </button>

        {step < 6 ? (
          <button
            type="button"
            onClick={() => setStep((s) => Math.min(6, s + 1))}
            disabled={!canProceed[step]}
            className={primaryBtn}
          >
            Next
          </button>
        ) : (
          <button type="button" onClick={handleSubmit} disabled={submitting} className={primaryBtn}>
            {submitting ? "Creating…" : "Create challenge"}
          </button>
        )}
      </div>
    </div>
  );
}

function StepDots({ step }: { step: number }) {
  return (
    <div className="flex items-center justify-center gap-1.5">
      {[1, 2, 3, 4, 5, 6].map((s) => (
        <span
          key={s}
          className={`h-1.5 w-1.5 rounded-full ${
            s === step ? "bg-black dark:bg-white" : "bg-zinc-200 dark:bg-zinc-800"
          }`}
        />
      ))}
    </div>
  );
}

function WhoScreen({
  buddies,
  whoMode,
  buddyId,
  onModeChange,
  onBuddyChange,
}: {
  buddies: BuddyOption[];
  whoMode: WhoMode;
  buddyId: string | null;
  onModeChange: (mode: WhoMode) => void;
  onBuddyChange: (id: string) => void;
}) {
  return (
    <div className="space-y-3">
      <h2 className="text-sm font-semibold text-black dark:text-zinc-50">Who&rsquo;s this with?</h2>

      {buddies.length > 0 && (
        <div className="space-y-2">
          {buddies.map((b) => (
            <label
              key={b.userId}
              className={`flex cursor-pointer items-center justify-between rounded-lg border px-3 py-2.5 text-sm ${
                whoMode === "buddy" && buddyId === b.userId
                  ? "border-black dark:border-white"
                  : "border-zinc-200 dark:border-zinc-800"
              }`}
            >
              <span className="truncate text-black dark:text-zinc-50">{b.email}</span>
              <input
                type="radio"
                name="buddy"
                checked={whoMode === "buddy" && buddyId === b.userId}
                onChange={() => {
                  onModeChange("buddy");
                  onBuddyChange(b.userId);
                }}
              />
            </label>
          ))}
        </div>
      )}

      <label
        className={`flex cursor-pointer items-center justify-between rounded-lg border px-3 py-2.5 text-sm ${
          whoMode === "link" ? "border-black dark:border-white" : "border-zinc-200 dark:border-zinc-800"
        }`}
      >
        <span className="text-black dark:text-zinc-50">
          Send a link{buddies.length === 0 ? " (no buddies yet)" : " instead"}
        </span>
        <input type="radio" name="buddy" checked={whoMode === "link"} onChange={() => onModeChange("link")} />
      </label>
    </div>
  );
}

function KindScreen({
  presetId,
  onPick,
}: {
  presetId: ChallengePresetId | null;
  onPick: (id: ChallengePresetId) => void;
}) {
  return (
    <div className="space-y-3">
      <h2 className="text-sm font-semibold text-black dark:text-zinc-50">What kind of challenge?</h2>
      <div className="space-y-2">
        {CHALLENGE_PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            onClick={() => onPick(preset.id)}
            className={`w-full rounded-lg border px-4 py-3 text-left ${
              presetId === preset.id ? "border-black dark:border-white" : "border-zinc-200 dark:border-zinc-800"
            }`}
          >
            <p className="text-sm font-medium text-black dark:text-zinc-50">{preset.name}</p>
            <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">{preset.blurb}</p>
          </button>
        ))}
      </div>
    </div>
  );
}

function DurationScreen({
  durationMode,
  startDate,
  endDate,
  onPick,
  onStartChange,
  onEndChange,
}: {
  durationMode: DurationMode;
  startDate: string;
  endDate: string;
  onPick: (mode: DurationMode) => void;
  onStartChange: (v: string) => void;
  onEndChange: (v: string) => void;
}) {
  const chips: { mode: DurationMode; label: string }[] = [
    { mode: "1w", label: "1 week" },
    { mode: "30d", label: "30 days" },
    { mode: "90d", label: "90 days" },
    { mode: "custom", label: "Custom dates" },
  ];

  return (
    <div className="space-y-3">
      <h2 className="text-sm font-semibold text-black dark:text-zinc-50">How long?</h2>
      <div className="flex flex-wrap gap-2">
        {chips.map((c) => (
          <button
            key={c.mode}
            type="button"
            onClick={() => onPick(c.mode)}
            className={`rounded-full border px-4 py-2 text-sm ${
              durationMode === c.mode
                ? "border-black bg-black text-white dark:border-white dark:bg-white dark:text-black"
                : "border-zinc-300 text-black dark:border-zinc-700 dark:text-zinc-50"
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>

      {durationMode === "custom" && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Start</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => onStartChange(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>End</label>
            <input
              type="date"
              value={endDate}
              min={startDate}
              onChange={(e) => onEndChange(e.target.value)}
              className={inputClass}
            />
          </div>
        </div>
      )}

      {durationMode !== "custom" && (
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          {startDate} &rarr; {endDate}
        </p>
      )}
    </div>
  );
}

function RulesScreen({
  rules,
  rulesErrors,
  advancedOpen,
  blindMode,
  addableMetrics,
  addMetricKey,
  onUpdateRule,
  onRemoveRule,
  onToggleAdvanced,
  onBlindModeChange,
  onAddMetricKeyChange,
  onAddRule,
}: {
  rules: RuleDraft[];
  rulesErrors: string[];
  advancedOpen: boolean;
  blindMode: boolean;
  addableMetrics: typeof BUILTIN_METRICS;
  addMetricKey: string;
  onUpdateRule: (key: string, patch: Partial<RuleDraft>) => void;
  onRemoveRule: (key: string) => void;
  onToggleAdvanced: () => void;
  onBlindModeChange: (v: boolean) => void;
  onAddMetricKeyChange: (v: string) => void;
  onAddRule: () => void;
}) {
  return (
    <div className="space-y-4">
      <h2 className="text-sm font-semibold text-black dark:text-zinc-50">The rules</h2>

      <div className="space-y-3">
        {rules.map((rule) => (
          <Card key={rule.key} className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-black dark:text-zinc-50">{rule.label}</p>
              {rules.length > 1 && (
                <button
                  type="button"
                  onClick={() => onRemoveRule(rule.key)}
                  className="text-xs text-red-600 underline dark:text-red-400"
                >
                  Remove
                </button>
              )}
            </div>

            <RuleEditor rule={rule} onChange={(patch) => onUpdateRule(rule.key, patch)} showAdvanced={advancedOpen} />
          </Card>
        ))}
      </div>

      {addableMetrics.length > 0 && (
        <div className="flex gap-2">
          <MetricPicker
            metrics={addableMetrics}
            value={addMetricKey}
            onChange={onAddMetricKeyChange}
            className="flex-1"
          />
          <button
            type="button"
            onClick={onAddRule}
            disabled={!addMetricKey}
            className={ghostBtn + " disabled:opacity-40"}
          >
            Add
          </button>
        </div>
      )}

      <button
        type="button"
        onClick={onToggleAdvanced}
        className="text-xs text-zinc-500 underline dark:text-zinc-400"
      >
        {advancedOpen ? "Hide advanced" : "Advanced (weights, proof, fixed gym days, blind mode)"}
      </button>

      {advancedOpen && (
        <label className="flex items-center justify-between rounded-lg border border-zinc-200 px-3 py-2.5 text-sm dark:border-zinc-800">
          <span className="text-black dark:text-zinc-50">Blind mode (hide today&rsquo;s number until you log)</span>
          <input type="checkbox" checked={blindMode} onChange={(e) => onBlindModeChange(e.target.checked)} />
        </label>
      )}

      {rulesErrors.length > 0 && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {rulesErrors[0]}
        </p>
      )}
    </div>
  );
}

function StakeScreen({ stakeText, onChange }: { stakeText: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-3">
      <h2 className="text-sm font-semibold text-black dark:text-zinc-50">Stake (optional)</h2>
      <input
        type="text"
        value={stakeText}
        maxLength={200}
        placeholder="Loser buys coffee"
        onChange={(e) => onChange(e.target.value)}
        className={inputClass}
      />
    </div>
  );
}

function ReviewScreen({
  name,
  onNameChange,
  whoMode,
  buddyEmail,
  startDate,
  endDate,
  rules,
  stakeText,
  blindMode,
  submitError,
}: {
  name: string;
  onNameChange: (v: string) => void;
  whoMode: WhoMode;
  buddyEmail: string | null;
  startDate: string;
  endDate: string;
  rules: RuleDraft[];
  stakeText: string;
  blindMode: boolean;
  submitError: string | null;
}) {
  return (
    <div className="space-y-4">
      <h2 className="text-sm font-semibold text-black dark:text-zinc-50">Review &amp; send</h2>

      <div>
        <label className={labelClass}>Name</label>
        <input
          type="text"
          value={name}
          maxLength={60}
          onChange={(e) => onNameChange(e.target.value)}
          className={inputClass}
        />
      </div>

      <Card className="space-y-2 text-sm">
        <p className="text-black dark:text-zinc-50">
          <span className="text-zinc-500 dark:text-zinc-400">With: </span>
          {whoMode === "buddy" ? buddyEmail : "anyone with the link"}
        </p>
        <p className="text-black dark:text-zinc-50">
          <span className="text-zinc-500 dark:text-zinc-400">Duration: </span>
          {startDate} &rarr; {endDate}
        </p>
        <ul className="mt-1 space-y-1">
          {rules.map((r) => (
            <li key={r.key} className="text-black dark:text-zinc-50">
              &middot; {describeRule(r)}
            </li>
          ))}
        </ul>
        {stakeText && (
          <p className="text-black dark:text-zinc-50">
            <span className="text-zinc-500 dark:text-zinc-400">Stake: </span>
            {stakeText}
          </p>
        )}
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          Blind mode is {blindMode ? "on" : "off"}.
        </p>
      </Card>

      {submitError && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {submitError}
        </p>
      )}
    </div>
  );
}
