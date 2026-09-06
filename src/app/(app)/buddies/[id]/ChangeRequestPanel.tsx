"use client";

// The propose-and-approve flow (V2 Step 10). Deliberately a smaller editor
// than the challenge builder wizard (src/app/(app)/buddies/new/NewChallengeWizard.tsx):
// an "edit" here doesn't need the OLD rule's numbers to prefill from (the
// scoreboard never exposes a scope='own' rule's target for privacy reasons
// anyway) — it just collects a fresh set of numbers for whichever shape was
// picked, same fields "add" collects, and the approve RPC is what actually
// closes out the old row and starts the replacement tomorrow.

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/Screen";
import { MetricPicker, RuleEditor } from "@/components/RuleEditor";
import { proposeChange, respondToChange, type ProposeChangeInput } from "@/lib/challenges/actions";
import {
  newCustomRule,
  toRuleInput,
  type ChangeRequest,
  type RuleDraft,
  type ScoreboardRuleSummary,
} from "@/lib/challenges/types";
import { BUILTIN_METRICS, findMetric } from "@/lib/metrics/types";
import type { GoalShape } from "@/lib/goals/types";

const inputClass =
  "mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-black outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50";
const labelClass = "block text-xs font-medium text-zinc-600 dark:text-zinc-400";
const primaryBtn =
  "rounded-md bg-black px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40 dark:bg-white dark:text-black";
const ghostBtn =
  "rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium text-black disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-50";

type Mode = "add" | "edit" | "remove";

function describeProposedRule(rule: ChangeRequest["rule"]): string {
  if (!rule) return "";
  const label = findMetric(BUILTIN_METRICS, rule.metricKey)?.label ?? rule.metricKey;
  const scopeNote = rule.scope === "own" ? " (each sets their own)" : "";
  if (rule.shape === "boolean" && rule.schedule?.mode === "flexible") {
    return `${label} — ${rule.schedule.sessionsPerWeek}x/week`;
  }
  if (rule.shape === "boolean") return `${label} — on schedule`;
  if (rule.shape === "at_least") return `${label} — at least ${rule.target}${scopeNote}`;
  if (rule.shape === "at_most") return `${label} — no more than ${rule.target}${scopeNote}`;
  return `${label} — between ${rule.min} and ${rule.max}${scopeNote}`;
}

export function ChangeRequestPanel({
  challengeId,
  currentUserId,
  buddyLabel,
  liveRules,
  pending,
}: {
  challengeId: string;
  currentUserId: string;
  buddyLabel: string;
  liveRules: ScoreboardRuleSummary[];
  pending: ChangeRequest[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("add");
  const [targetRuleId, setTargetRuleId] = useState<string>(liveRules[0]?.id ?? "");
  const [draft, setDraft] = useState<RuleDraft | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const usedMetricKeys = useMemo(() => new Set(liveRules.map((r) => r.metricKey)), [liveRules]);
  const addableMetrics = BUILTIN_METRICS.filter((m) => !usedMetricKeys.has(m.key));

  const waitingOnMe = pending.filter((r) => r.proposedBy !== currentUserId);
  const waitingOnThem = pending.filter((r) => r.proposedBy === currentUserId);

  function startAdd() {
    setMode("add");
    setDraft(addableMetrics[0] ? newCustomRule(addableMetrics[0].key, addableMetrics[0].label, addableMetrics[0].default_shape) : null);
    setOpen(true);
    setError(null);
  }

  function startEdit() {
    const rule = liveRules.find((r) => r.id === targetRuleId) ?? liveRules[0];
    if (!rule) return;
    setMode("edit");
    setTargetRuleId(rule.id);
    const label = findMetric(BUILTIN_METRICS, rule.metricKey)?.label ?? rule.metricKey;
    setDraft(newCustomRule(rule.metricKey, label, rule.shape));
    setOpen(true);
    setError(null);
  }

  function startRemove() {
    const rule = liveRules.find((r) => r.id === targetRuleId) ?? liveRules[0];
    if (!rule) return;
    setMode("remove");
    setTargetRuleId(rule.id);
    setDraft(null);
    setOpen(true);
    setError(null);
  }

  function changeAddMetric(key: string) {
    const metric = addableMetrics.find((m) => m.key === key);
    if (!metric) return;
    setDraft(newCustomRule(metric.key, metric.label, metric.default_shape));
  }

  async function submit() {
    setSubmitting(true);
    setError(null);

    const input: ProposeChangeInput = {
      challengeId,
      kind: mode,
      ruleId: mode === "add" ? null : targetRuleId,
      rule: mode === "remove" || !draft ? null : toRuleInput(draft),
      ownTarget: draft && draft.scope === "own" && mode !== "remove" ? { target: draft.target, min: draft.min, max: draft.max } : null,
    };

    const res = await proposeChange(input);
    setSubmitting(false);

    if ("error" in res) {
      setError(res.error);
      return;
    }
    setOpen(false);
    router.refresh();
  }

  return (
    <Card className="space-y-3">
      <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        Rule changes
      </p>

      {waitingOnMe.length > 0 && (
        <div className="space-y-2">
          {waitingOnMe.map((req) => (
            <RespondCard key={req.id} request={req} buddyLabel={buddyLabel} onDone={() => router.refresh()} />
          ))}
        </div>
      )}

      {waitingOnThem.map((req) => (
        <p key={req.id} className="text-xs text-zinc-500 dark:text-zinc-400">
          {req.kind === "add" ? "Adding" : req.kind === "remove" ? "Removing" : "Editing"}
          {req.rule ? ` ${describeProposedRule(req.rule)}` : ""} — waiting on {buddyLabel} to respond.
        </p>
      ))}

      {!open && (
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={startAdd} disabled={addableMetrics.length === 0} className={ghostBtn}>
            Propose adding a rule
          </button>
          {liveRules.length > 0 && (
            <>
              <button type="button" onClick={startEdit} className={ghostBtn}>
                Propose an edit
              </button>
              <button type="button" onClick={startRemove} className={ghostBtn}>
                Propose removing a rule
              </button>
            </>
          )}
        </div>
      )}

      {open && (
        <div className="space-y-3 border-t border-zinc-200 pt-3 dark:border-zinc-800">
          {(mode === "edit" || mode === "remove") && (
            <div>
              <label className={labelClass}>Which rule</label>
              <select
                value={targetRuleId}
                onChange={(e) => {
                  setTargetRuleId(e.target.value);
                  if (mode === "edit") {
                    const rule = liveRules.find((r) => r.id === e.target.value);
                    if (rule) {
                      const label = findMetric(BUILTIN_METRICS, rule.metricKey)?.label ?? rule.metricKey;
                      setDraft(newCustomRule(rule.metricKey, label, rule.shape));
                    }
                  }
                }}
                className={inputClass}
              >
                {liveRules.map((r) => (
                  <option key={r.id} value={r.id}>
                    {findMetric(BUILTIN_METRICS, r.metricKey)?.label ?? r.metricKey}
                  </option>
                ))}
              </select>
            </div>
          )}

          {mode === "add" && (
            <div>
              <label className={labelClass}>Metric</label>
              <MetricPicker
                metrics={addableMetrics}
                value={draft?.metricKey ?? ""}
                onChange={changeAddMetric}
                placeholder="Choose a metric…"
              />
            </div>
          )}

          {draft && mode !== "remove" && (
            <RuleEditor rule={draft} onChange={(patch) => setDraft({ ...draft, ...patch })} showAdvanced />
          )}

          {error && (
            <p role="alert" className="text-xs text-red-600 dark:text-red-400">
              {error}
            </p>
          )}

          <div className="flex gap-2">
            <button type="button" onClick={submit} disabled={submitting} className={primaryBtn}>
              {submitting ? "Sending…" : "Send to " + buddyLabel}
            </button>
            <button type="button" onClick={() => setOpen(false)} className={ghostBtn}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </Card>
  );
}

function RespondCard({
  request,
  buddyLabel,
  onDone,
}: {
  request: ChangeRequest;
  buddyLabel: string;
  onDone: () => void;
}) {
  const [ownTarget, setOwnTarget] = useState<{ target: string; min: string; max: string }>({
    target: "",
    min: "",
    max: "",
  });
  const [submitting, setSubmitting] = useState<"approve" | "reject" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const needsOwnTarget = request.kind !== "remove" && request.rule?.scope === "own";
  const shape: GoalShape | undefined = request.rule?.shape;

  async function respond(approve: boolean) {
    setSubmitting(approve ? "approve" : "reject");
    setError(null);

    const target =
      needsOwnTarget && approve
        ? {
            target: shape === "range" ? null : ownTarget.target === "" ? null : Number(ownTarget.target),
            min: shape === "range" ? (ownTarget.min === "" ? null : Number(ownTarget.min)) : null,
            max: shape === "range" ? (ownTarget.max === "" ? null : Number(ownTarget.max)) : null,
          }
        : null;

    const res = await respondToChange(request.id, approve, target);
    setSubmitting(null);

    if ("error" in res) {
      setError(res.error);
      return;
    }
    onDone();
  }

  return (
    <div className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
      <p className="text-sm text-black dark:text-zinc-50">
        {buddyLabel} wants to {request.kind === "add" ? "add" : request.kind === "remove" ? "remove" : "change"}
        {request.rule ? ` ${describeProposedRule(request.rule)}` : " a rule"}
        {request.kind !== "remove" && ", starting tomorrow."}
      </p>

      {needsOwnTarget && (
        <div className="mt-2">
          {shape === "range" ? (
            <div className="grid grid-cols-2 gap-2">
              <input
                type="number"
                placeholder="Min"
                value={ownTarget.min}
                onChange={(e) => setOwnTarget((v) => ({ ...v, min: e.target.value }))}
                className={inputClass}
              />
              <input
                type="number"
                placeholder="Max"
                value={ownTarget.max}
                onChange={(e) => setOwnTarget((v) => ({ ...v, max: e.target.value }))}
                className={inputClass}
              />
            </div>
          ) : (
            <input
              type="number"
              placeholder="Your number"
              value={ownTarget.target}
              onChange={(e) => setOwnTarget((v) => ({ ...v, target: e.target.value }))}
              className={inputClass}
            />
          )}
        </div>
      )}

      {error && (
        <p role="alert" className="mt-1 text-xs text-red-600 dark:text-red-400">
          {error}
        </p>
      )}

      <div className="mt-2 flex gap-2">
        <button type="button" onClick={() => respond(true)} disabled={submitting !== null} className={primaryBtn}>
          {submitting === "approve" ? "Approving…" : "Approve"}
        </button>
        <button type="button" onClick={() => respond(false)} disabled={submitting !== null} className={ghostBtn}>
          {submitting === "reject" ? "Rejecting…" : "Reject"}
        </button>
      </div>
    </div>
  );
}
