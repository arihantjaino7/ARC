"use client";

// Admin-direct rule editing (Community Step C6): "members join a template
// read-only, so the admin edits it directly, no approval flow" —
// docs/PLAN-COMMUNITY.md's own answer to whether buddy-style change requests
// (V2 Step 10) apply to communities. Reuses RuleEditor/MetricPicker (lifted
// in Step C2) instead of a third copy of "edit one rule's fields". Only
// scope='shared' rules are offered here — see editCommunityRule's own
// comment for why scope='own' community edits are a deliberately deferred
// gap, not silently missing.

import { useState, useTransition } from "react";
import { Card } from "@/components/Screen";
import { MetricPicker, RuleEditor } from "@/components/RuleEditor";
import { editCommunityRule } from "@/lib/communities/actions";
import { newCustomRule, toRuleInput, type RuleDraft } from "@/lib/challenges/types";
import type { InviteRule } from "@/lib/challenges/actions";
import { findMetric, BUILTIN_METRICS } from "@/lib/metrics/types";

function ruleToDraft(rule: InviteRule): RuleDraft {
  return {
    key: rule.id,
    metricKey: rule.metricKey,
    label: findMetric(BUILTIN_METRICS, rule.metricKey)?.label ?? rule.metricKey,
    shape: rule.shape,
    scope: "shared",
    target: rule.target,
    min: rule.min,
    max: rule.max,
    weight: rule.weight,
    period: rule.period,
    schedule: rule.schedule,
    requiresProof: rule.requiresProof,
    scopeLocked: true,
  };
}

export function CommunityRulePanel({ communityId, liveRules }: { communityId: string; liveRules: InviteRule[] }) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<RuleDraft | null>(null);
  const [addMetricKey, setAddMetricKey] = useState("");
  const [adding, setAdding] = useState<RuleDraft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const usedMetrics = new Set(liveRules.map((r) => r.metricKey));
  const addableMetrics = BUILTIN_METRICS.filter((m) => !usedMetrics.has(m.key));

  function startEdit(rule: InviteRule) {
    setError(null);
    setEditingId(rule.id);
    setDraft(ruleToDraft(rule));
  }

  function submitEdit(ruleId: string) {
    if (!draft) return;
    setError(null);
    startTransition(async () => {
      const result = await editCommunityRule(communityId, { kind: "edit", ruleId, rule: toRuleInput(draft) });
      if ("error" in result) setError(result.error);
      else {
        setEditingId(null);
        setDraft(null);
      }
    });
  }

  function remove(ruleId: string) {
    setError(null);
    startTransition(async () => {
      const result = await editCommunityRule(communityId, { kind: "remove", ruleId });
      if ("error" in result) setError(result.error);
    });
  }

  function beginAdd() {
    const metric = addableMetrics.find((m) => m.key === addMetricKey);
    if (!metric) return;
    const rule = newCustomRule(metric.key, metric.label, metric.default_shape);
    setAdding({ ...rule, scope: "shared", scopeLocked: true });
  }

  function submitAdd() {
    if (!adding) return;
    setError(null);
    startTransition(async () => {
      const result = await editCommunityRule(communityId, { kind: "add", rule: toRuleInput(adding) });
      if ("error" in result) setError(result.error);
      else {
        setAdding(null);
        setAddMetricKey("");
      }
    });
  }

  return (
    <section className="mt-6">
      <h2 className="text-sm font-semibold text-black dark:text-zinc-50">Edit rules</h2>
      <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
        Changes start tomorrow — today still scores against the current rules.
      </p>

      {error && <p className="mt-2 text-xs text-red-600 dark:text-red-400">{error}</p>}

      <div className="mt-3 space-y-3">
        {liveRules.map((rule) => {
          const label = findMetric(BUILTIN_METRICS, rule.metricKey)?.label ?? rule.metricKey;
          const editable = rule.scope === "shared";
          return (
            <Card key={rule.id}>
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-black dark:text-zinc-50">{label}</span>
                <div className="flex shrink-0 gap-3 text-xs">
                  {editable && editingId !== rule.id && (
                    <button
                      type="button"
                      onClick={() => startEdit(rule)}
                      className="text-zinc-600 underline dark:text-zinc-400"
                    >
                      Edit
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => remove(rule.id)}
                    className="text-red-600 underline disabled:opacity-40 dark:text-red-400"
                  >
                    Remove
                  </button>
                </div>
              </div>
              {!editable && (
                <p className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
                  Each member sets their own number for this rule — editing it here isn&rsquo;t supported yet.
                </p>
              )}
              {editable && editingId === rule.id && draft && (
                <div className="mt-3 space-y-3 border-t border-zinc-200 pt-3 dark:border-zinc-800">
                  <RuleEditor rule={draft} onChange={(patch) => setDraft({ ...draft, ...patch })} showAdvanced />
                  <div className="flex gap-3">
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => submitEdit(rule.id)}
                      className="rounded-md bg-black px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40 dark:bg-white dark:text-black"
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingId(null);
                        setDraft(null);
                      }}
                      className="text-xs text-zinc-600 underline dark:text-zinc-400"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </Card>
          );
        })}
      </div>

      {adding ? (
        <Card className="mt-3">
          <p className="text-sm font-medium text-black dark:text-zinc-50">{adding.label}</p>
          <div className="mt-3 space-y-3">
            <RuleEditor rule={adding} onChange={(patch) => setAdding({ ...adding, ...patch })} showAdvanced />
            <div className="flex gap-3">
              <button
                type="button"
                disabled={pending}
                onClick={submitAdd}
                className="rounded-md bg-black px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40 dark:bg-white dark:text-black"
              >
                Add rule
              </button>
              <button
                type="button"
                onClick={() => setAdding(null)}
                className="text-xs text-zinc-600 underline dark:text-zinc-400"
              >
                Cancel
              </button>
            </div>
          </div>
        </Card>
      ) : (
        addableMetrics.length > 0 && (
          <div className="mt-3 flex gap-2">
            <MetricPicker metrics={addableMetrics} value={addMetricKey} onChange={setAddMetricKey} className="flex-1" />
            <button
              type="button"
              onClick={beginAdd}
              disabled={!addMetricKey}
              className="shrink-0 rounded-md border border-zinc-300 px-3 py-2 text-xs text-zinc-700 disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-300"
            >
              Add
            </button>
          </div>
        )
      )}
    </section>
  );
}
