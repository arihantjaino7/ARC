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
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { MetricPicker, RuleEditor } from "@/components/RuleEditor";
import { editCommunityRule } from "@/lib/communities/actions";
import { newCustomRule, toRuleInput, type RuleDraft } from "@/lib/challenges/types";
import type { InviteRule } from "@/lib/challenges/actions";
import { findMetric, type MetricDef } from "@/lib/metrics/types";

function ruleToDraft(rule: InviteRule, metrics: readonly MetricDef[]): RuleDraft {
  return {
    key: rule.id,
    metricKey: rule.metricKey,
    label: findMetric(metrics, rule.metricKey)?.label ?? rule.metricKey,
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

export function CommunityRulePanel({
  communityId,
  liveRules,
  metrics: initialMetrics,
}: {
  communityId: string;
  liveRules: InviteRule[];
  metrics: MetricDef[];
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<RuleDraft | null>(null);
  const [addMetricKey, setAddMetricKey] = useState("");
  const [adding, setAdding] = useState<RuleDraft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [metrics, setMetrics] = useState<MetricDef[]>(initialMetrics);

  const usedMetrics = new Set(liveRules.map((r) => r.metricKey));
  const addableMetrics = metrics.filter((m) => !usedMetrics.has(m.key));

  function startEdit(rule: InviteRule) {
    setError(null);
    setEditingId(rule.id);
    setDraft(ruleToDraft(rule, metrics));
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
      <h2 className="text-section text-ink">Edit rules</h2>
      <p className="mt-1 text-caption text-ink-muted">
        Changes start tomorrow — today still scores against the current rules.
      </p>

      {error && <p className="mt-2 text-caption text-clay">{error}</p>}

      <div className="mt-3 space-y-3">
        {liveRules.map((rule) => {
          const label = findMetric(metrics, rule.metricKey)?.label ?? rule.metricKey;
          const editable = rule.scope === "shared";
          return (
            <Card key={rule.id}>
              <div className="flex items-center justify-between gap-2">
                <span className="text-body font-medium text-ink">{label}</span>
                <div className="flex shrink-0 gap-3 text-caption">
                  {editable && editingId !== rule.id && (
                    <button type="button" onClick={() => startEdit(rule)} className="text-ink-muted underline">
                      Edit
                    </button>
                  )}
                  <button type="button" disabled={pending} onClick={() => remove(rule.id)} className="text-clay underline disabled:opacity-40">
                    Remove
                  </button>
                </div>
              </div>
              {!editable && (
                <p className="mt-1">
                  <Chip>Each sets their own</Chip>
                </p>
              )}
              {editable && editingId === rule.id && draft && (
                <div className="mt-3 space-y-3 border-t border-glass-1-border pt-3">
                  <RuleEditor rule={draft} onChange={(patch) => setDraft({ ...draft, ...patch })} showAdvanced />
                  <div className="flex gap-3">
                    <Button type="button" size="sm" disabled={pending} onClick={() => submitEdit(rule.id)}>
                      Save
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setEditingId(null);
                        setDraft(null);
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </Card>
          );
        })}
      </div>

      {adding ? (
        <Card className="mt-3">
          <p className="text-body font-medium text-ink">{adding.label}</p>
          <div className="mt-3 space-y-3">
            <RuleEditor rule={adding} onChange={(patch) => setAdding({ ...adding, ...patch })} showAdvanced />
            <div className="flex gap-3">
              <Button type="button" size="sm" disabled={pending} onClick={submitAdd}>
                Add rule
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setAdding(null)}>
                Cancel
              </Button>
            </div>
          </div>
        </Card>
      ) : (
        <div className="mt-3 flex gap-2">
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
          <Button type="button" variant="glass" size="sm" onClick={beginAdd} disabled={!addMetricKey}>
            Add
          </Button>
        </div>
      )}
    </section>
  );
}
