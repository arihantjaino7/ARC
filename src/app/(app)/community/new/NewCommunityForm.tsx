"use client";

// Community Step C2: a short form, not a six-screen wizard — name,
// description, public/private, then the challenge template's rules and
// dates. Reuses RuleEditor/MetricPicker (src/components/RuleEditor.tsx) for
// the per-rule fields, same as the buddy wizard and the change-request panel.

import { useMemo, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/Screen";
import { Field } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { MetricPicker, RuleEditor, fieldLabelClass } from "@/components/RuleEditor";
import { createCommunity, type CreateCommunityInput } from "@/lib/communities/actions";
import type { CommunityVisibility } from "@/lib/communities/types";
import { newCustomRule, toRuleInput, validateRule, type RuleDraft } from "@/lib/challenges/types";
import { shiftDate } from "@/lib/time/day";
import type { MetricDef } from "@/lib/metrics/types";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function pillClass(active: boolean): string {
  return `flex-1 rounded-row border px-3 py-2.5 text-left ${
    active ? "border-sage/30 bg-sage/15 text-sage" : "border-glass-1-border text-ink-muted"
  }`;
}

export function NewCommunityForm({ metrics: initialMetrics }: { metrics: MetricDef[] }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState<CommunityVisibility>("public");
  const [startDate, setStartDate] = useState(todayIso());
  const [endDate, setEndDate] = useState(shiftDate(todayIso(), 29));
  const [rules, setRules] = useState<RuleDraft[]>([]);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [addMetricKey, setAddMetricKey] = useState("");
  const [metrics, setMetrics] = useState<MetricDef[]>(initialMetrics);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [result, setResult] = useState<{ communityId: string } | null>(null);

  const usedMetricKeys = useMemo(() => new Set(rules.map((r) => r.metricKey)), [rules]);
  const addableMetrics = metrics.filter((m) => !usedMetricKeys.has(m.key));

  function updateRule(key: string, patch: Partial<RuleDraft>) {
    setRules((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  function removeRule(key: string) {
    setRules((prev) => prev.filter((r) => r.key !== key));
  }

  function addRule() {
    const metric = addableMetrics.find((m) => m.key === addMetricKey);
    if (!metric) return;
    // Communities have no scope='own' rules (the admin's decision is the
    // whole point of a shared template — see communities/actions.ts's
    // createCommunity for the server-side half of this rule).
    setRules((prev) => [
      ...prev,
      { ...newCustomRule(metric.key, metric.label, metric.default_shape), scope: "shared", scopeLocked: true },
    ]);
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
        <p className="text-section text-ink">Community created 🎉</p>
        <p className="text-body text-ink-muted">
          You&rsquo;re its admin.{" "}
          {visibility === "public"
            ? "Anyone signed in can find and join it instantly."
            : "Others can find it and request to join — you'll approve them."}
        </p>
        <Link href="/community" className="block">
          <Button className="w-full">Back to Community</Button>
        </Link>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Field label="Name" value={name} maxLength={60} placeholder="Morning Club" onChange={(e) => setName(e.target.value)} />

      <div>
        <label className={fieldLabelClass}>Description (optional)</label>
        <textarea
          value={description}
          maxLength={500}
          rows={2}
          placeholder="What's this group about?"
          onChange={(e) => setDescription(e.target.value)}
          style={{ fontSize: 16 }}
          className="mt-1.5 w-full rounded-row border border-glass-1-border bg-glass-1 px-4 py-3 text-ink outline-none focus:border-sage/50"
        />
      </div>

      <div>
        <label className={fieldLabelClass}>Who can join</label>
        <div className="mt-1.5 flex gap-2">
          <button type="button" onClick={() => setVisibility("public")} className={pillClass(visibility === "public")}>
            <span className="block text-body font-medium">Public</span>
            <span className="block text-caption opacity-80">Anyone joins instantly</span>
          </button>
          <button type="button" onClick={() => setVisibility("private")} className={pillClass(visibility === "private")}>
            <span className="block text-body font-medium">Private</span>
            <span className="block text-caption opacity-80">You approve requests</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field
          label="Start"
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
        />
        <Field label="End" type="date" value={endDate} min={startDate} onChange={(e) => setEndDate(e.target.value)} />
      </div>

      <div className="space-y-3">
        <h2 className="text-section text-ink">The rules</h2>
        <p className="text-caption text-ink-muted">
          What every member of this community is scored on. You can propose changes later, but
          members join this read-only.
        </p>

        <div className="space-y-3">
          {rules.map((rule) => (
            <Card key={rule.key} className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-body font-medium text-ink">{rule.label}</p>
                <button type="button" onClick={() => removeRule(rule.key)} className="text-caption text-clay underline">
                  Remove
                </button>
              </div>
              <RuleEditor rule={rule} onChange={(patch) => updateRule(rule.key, patch)} showAdvanced={advancedOpen} />
            </Card>
          ))}
        </div>

        {rules.length === 0 && <p className="text-caption text-ink-muted">Add at least one rule below.</p>}

        <div className="flex gap-2">
          <MetricPicker
            metrics={addableMetrics}
            value={addMetricKey}
            onChange={setAddMetricKey}
            onMetricCreated={(m) => {
              setMetrics((prev) => [...prev, m]);
              setAddMetricKey(m.key);
            }}
            className="flex-1"
          />
          <Button type="button" variant="glass" onClick={addRule} disabled={!addMetricKey}>
            Add
          </Button>
        </div>

        {rules.length > 0 && (
          <button type="button" onClick={() => setAdvancedOpen((v) => !v)} className="text-caption text-ink-muted underline">
            {advancedOpen ? "Hide advanced" : "Advanced (weights, proof, fixed gym days)"}
          </button>
        )}

        {rulesErrors.length > 0 && <p role="alert" className="text-body text-clay">{rulesErrors[0]}</p>}
      </div>

      {submitError && (
        <p role="alert" className="text-body text-clay">
          {submitError}
        </p>
      )}

      <Button type="button" onClick={handleSubmit} disabled={!canSubmit || submitting} className="w-full">
        {submitting ? "Creating…" : "Create community"}
      </Button>
    </div>
  );
}
