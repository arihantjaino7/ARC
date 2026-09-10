"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Field } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { joinCommunity } from "@/lib/communities/actions";
import type { GoalShape } from "@/lib/goals/types";
import type { CommunityVisibility } from "@/lib/communities/types";

type OwnRule = { ruleId: string; metricKey: string; shape: GoalShape; label: string; defaultTarget: number };

export function JoinCommunityActions({
  communityId,
  visibility,
  ownRules,
}: {
  communityId: string;
  visibility: CommunityVisibility;
  ownRules: OwnRule[];
}) {
  const router = useRouter();
  const [targets, setTargets] = useState<Record<string, number>>(
    Object.fromEntries(ownRules.map((r) => [r.ruleId, r.defaultTarget])),
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleJoin() {
    setPending(true);
    setError(null);
    const res = await joinCommunity(
      communityId,
      ownRules.map((r) => ({ ruleId: r.ruleId, target: targets[r.ruleId] })),
    );
    setPending(false);
    if ("error" in res) {
      setError(res.error);
      return;
    }
    router.refresh();
  }

  return (
    <div className="mt-6 space-y-4">
      {ownRules.length > 0 && (
        <div className="space-y-3 rounded-card border border-glass-1-border bg-glass-1 p-4">
          <p className="text-caption text-ink-muted">Your own numbers</p>
          {ownRules.map((r) => (
            <Field
              key={r.ruleId}
              label={r.label}
              type="number"
              inputMode="decimal"
              enterKeyHint="done"
              step="any"
              value={targets[r.ruleId] ?? ""}
              onChange={(e) => setTargets((prev) => ({ ...prev, [r.ruleId]: Number(e.target.value) }))}
            />
          ))}
        </div>
      )}

      {error && (
        <p role="alert" className="text-body text-clay">
          {error}
        </p>
      )}

      <Button type="button" onClick={handleJoin} disabled={pending} className="w-full">
        {pending ? "Joining…" : visibility === "public" ? "Join" : "Request to join"}
      </Button>
    </div>
  );
}
