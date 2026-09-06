"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { joinCommunity } from "@/lib/communities/actions";
import type { GoalShape } from "@/lib/goals/types";
import type { CommunityVisibility } from "@/lib/communities/types";

type OwnRule = { ruleId: string; metricKey: string; shape: GoalShape; label: string; defaultTarget: number };

const inputClass =
  "mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-black outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50";

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
        <div className="space-y-3 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
          <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Your own numbers</p>
          {ownRules.map((r) => (
            <div key={r.ruleId}>
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">{r.label}</label>
              <input
                type="number"
                step="any"
                value={targets[r.ruleId] ?? ""}
                onChange={(e) => setTargets((prev) => ({ ...prev, [r.ruleId]: Number(e.target.value) }))}
                className={inputClass}
              />
            </div>
          ))}
        </div>
      )}

      {error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={handleJoin}
        disabled={pending}
        className="w-full rounded-md bg-black px-3 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-black"
      >
        {pending ? "Joining…" : visibility === "public" ? "Join" : "Request to join"}
      </button>
    </div>
  );
}
