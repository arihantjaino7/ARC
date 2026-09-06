"use client";

// Community Step C2: a short form, not a six-screen wizard — name,
// description, public/private, then the challenge template's rules and
// dates. Reuses RuleEditor/MetricPicker (src/components/RuleEditor.tsx) for
// the per-rule fields, same as the buddy wizard and the change-request panel.

import { useMemo, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/Screen";
import { MetricPicker, RuleEditor } from "@/components/RuleEditor";
import { createCommunity, type CreateCommunityInput } from "@/lib/communities/actions";
import type { CommunityVisibility } from "@/lib/communities/types";
import { newCustomRule, toRuleInput, validateRule, type RuleDraft } from "@/lib/challenges/types";
import { shiftDate } from "@/lib/time/day";
import { BUILTIN_METRICS } from "@/lib/metrics/types";

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

function pillClass(active: boolean): string {
  return `flex-1 rounded-lg border px-3 py-2.5 text-left text-sm ${
    active
      ? "border-black bg-black text-white dark:border-white dark:bg-white dark:text-black"
      : "border-zinc-300 text-black dark:border-zinc-700 dark:text-zinc-50"
  }`;
}

export function NewCommunityForm() {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState<CommunityVisibility>("public");
  const [startDate, setStartDate] = useState(todayIso());
  const [endDate, setEndDate] = useState(shiftDate(todayIso(), 29));
  const [rules, setRules] = useState<RuleDraft[]>([]);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [addMetricKey, setAddMetricKey] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [result, setResult] = useState<{ communityId: string } | null>(null);

  const usedMetricKeys = useMemo(() => new Set(rules.map((r) => r.metricKey)), [rules]);
  const addableMetrics = BUILTIN_METRICS.filter((m) => !usedMetricKeys.has(m.key));

  function updateRule(key: string, patch: Partial<RuleDraft>) {
    setRules((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  function removeRule(key: string) {
    setRules((prev) => prev.filter((r) => r.key !== key));
  }

  function addRule() {
    const metric = addableMetrics.find((m) => m.key === addMetricKey);
    if (!metric) return;
    setRules((prev) => [...prev, newCustomRule(metric.key, metric.label, metric.default_shape)]);
    setAddMetricKey("");
  }

  // Reuses the same validateRule the server re-checks (src/lib/challenges/types.ts)
  // rather than a second, drifting copy of "is this rule filled in" logic.
  const rulesErrors = rules.map((r) => validateRule(toRuleInput(r))).filter((e): e is string => Boolean(e));

  const canSubmit =
    name.trim().length > 0 &&
    rules.length > 0 &&
    rulesErrors.length === 0 &&
    Boolean(startDate) &&
    Boolean(endDate) &&
    endDate >= startDate;

  async function handleSubmit() {
    setSubmitting(true);
    setSubmitError(null);

    const input: CreateCommunityInput = {
      name: name.trim(),
      description: description.trim() || null,
      visibility,
      startDate,
      endDate,
      rules: rules.map(toRuleInput),
    };

    const res = await createCommunity(input);
    setSubmitting(false);

    if ("error" in res) {
      setSubmitError(res.error);
      return;
    }
    setResult(res);
  }

  if (result) {
    return (
      <Card className="space-y-4 text-center">
        <p className="text-lg font-semibold text-black dark:text-zinc-50">Community created 🎉</p>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          You&rsquo;re its admin.{" "}
          {visibility === "public"
            ? "Anyone signed in can find and join it instantly."
            : "Others can find it and request to join — you'll approve them."}
        </p>
        <Link
          href="/community"
          className="block rounded-md bg-black px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-black"
        >
          Back to Community
        </Link>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <label className={labelClass}>Name</label>
        <input
          type="text"
          value={name}
          maxLength={60}
          placeholder="Morning Club"
          onChange={(e) => setName(e.target.value)}
          className={inputClass}
        />
      </div>

      <div>
        <label className={labelClass}>Description (optional)</label>
        <textarea
          value={description}
          maxLength={500}
          rows={2}
          placeholder="What's this group about?"
          onChange={(e) => setDescription(e.target.value)}
          className={inputClass}
        />
      </div>

      <div>
        <label className={labelClass}>Who can join</label>
        <div className="mt-1 flex gap-2">
          <button type="button" onClick={() => setVisibility("public")} className={pillClass(visibility === "public")}>
            <span className="block font-medium">Public</span>
            <span className="block text-xs opacity-80">Anyone joins instantly</span>
          </button>
          <button
            type="button"
            onClick={() => setVisibility("private")}
            className={pillClass(visibility === "private")}
          >
            <span className="block font-medium">Private</span>
            <span className="block text-xs opacity-80">You approve requests</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelClass}>Start</label>
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>End</label>
          <input
            type="date"
            value={endDate}
            min={startDate}
            onChange={(e) => setEndDate(e.target.value)}
            className={inputClass}
          />
        </div>
      </div>

      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-black dark:text-zinc-50">The rules</h2>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          What every member of this community is scored on. You can propose changes later, but
          members join this read-only.
        </p>

        <div className="space-y-3">
          {rules.map((rule) => (
            <Card key={rule.key} className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-black dark:text-zinc-50">{rule.label}</p>
                <button
                  type="button"
                  onClick={() => removeRule(rule.key)}
                  className="text-xs text-red-600 underline dark:text-red-400"
                >
                  Remove
                </button>
              </div>
              <RuleEditor rule={rule} onChange={(patch) => updateRule(rule.key, patch)} showAdvanced={advancedOpen} />
            </Card>
          ))}
        </div>

        {rules.length === 0 && (
          <p className="text-xs text-zinc-500 dark:text-zinc-400">Add at least one rule below.</p>
        )}

        {addableMetrics.length > 0 && (
          <div className="flex gap-2">
            <MetricPicker
              metrics={addableMetrics}
              value={addMetricKey}
              onChange={setAddMetricKey}
              className="flex-1"
            />
            <button
              type="button"
              onClick={addRule}
              disabled={!addMetricKey}
              className={ghostBtn + " disabled:opacity-40"}
            >
              Add
            </button>
          </div>
        )}

        {rules.length > 0 && (
          <button
            type="button"
            onClick={() => setAdvancedOpen((v) => !v)}
            className="text-xs text-zinc-500 underline dark:text-zinc-400"
          >
            {advancedOpen ? "Hide advanced" : "Advanced (weights, proof, fixed gym days)"}
          </button>
        )}

        {rulesErrors.length > 0 && (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            {rulesErrors[0]}
          </p>
        )}
      </div>

      {submitError && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {submitError}
        </p>
      )}

      <button
        type="button"
        onClick={handleSubmit}
        disabled={!canSubmit || submitting}
        className={primaryBtn + " w-full"}
      >
        {submitting ? "Creating…" : "Create community"}
      </button>
    </div>
  );
}
