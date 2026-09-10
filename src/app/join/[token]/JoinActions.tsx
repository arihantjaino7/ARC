"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Surface } from "@/components/ui/Surface";
import { Field } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { acceptInvite, declineInvite } from "@/lib/challenges/actions";
import type { GoalShape } from "@/lib/goals/types";

type OwnRule = { ruleId: string; metricKey: string; shape: GoalShape; label: string; defaultTarget: number };

export function JoinActions({ token, ownRules }: { token: string; ownRules: OwnRule[] }) {
  const router = useRouter();
  const [targets, setTargets] = useState<Record<string, number>>(
    Object.fromEntries(ownRules.map((r) => [r.ruleId, r.defaultTarget])),
  );
  const [pending, setPending] = useState<"accept" | "decline" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleAccept() {
    setPending("accept");
    setError(null);
    const res = await acceptInvite(
      token,
      ownRules.map((r) => ({ ruleId: r.ruleId, target: targets[r.ruleId] })),
    );
    setPending(null);
    if ("error" in res) {
      setError(res.error);
      return;
    }
    router.push("/buddies");
  }

  async function handleDecline() {
    setPending("decline");
    setError(null);
    const res = await declineInvite(token);
    setPending(null);
    if (res.error) {
      setError(res.error);
      return;
    }
    router.push("/buddies");
  }

  return (
    <div className="mt-6 space-y-4">
      {ownRules.length > 0 && (
        <Surface tier={1} radius="card" className="space-y-3 p-3">
          <p className="text-overline text-ink-faint">Your own numbers</p>
          {ownRules.map((r) => (
            <Field
              key={r.ruleId}
              label={r.label}
              type="number"
              inputMode="decimal"
              step="any"
              value={targets[r.ruleId] ?? ""}
              onChange={(e) => setTargets((prev) => ({ ...prev, [r.ruleId]: Number(e.target.value) }))}
            />
          ))}
        </Surface>
      )}

      {error && (
        <p role="alert" className="text-body text-clay">
          {error}
        </p>
      )}

      <div className="flex gap-3">
        <Button type="button" onClick={handleAccept} disabled={pending !== null} className="flex-1">
          {pending === "accept" ? "Joining…" : "Accept"}
        </Button>
        <Button type="button" variant="glass" onClick={handleDecline} disabled={pending !== null} className="flex-1">
          {pending === "decline" ? "Declining…" : "Decline"}
        </Button>
      </div>
    </div>
  );
}
