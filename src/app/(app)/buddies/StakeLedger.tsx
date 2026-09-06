"use client";

// The stake ledger (V2 Step 13, docs/PLAN-V2.md §5): who owes whom across
// every completed, staked challenge. Settling only ever flips the caller's
// own confirmation — see mark_stake_settled in supabase/step17_polish.sql.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/Screen";
import { markStakeSettled } from "@/lib/challenges/actions";
import type { StakeEntry } from "@/lib/challenges/types";

export function StakeLedger({ entries }: { entries: StakeEntry[] }) {
  if (entries.length === 0) return null;

  return (
    <section className="mt-6">
      <h2 className="text-sm font-semibold text-black dark:text-zinc-50">Stake ledger</h2>
      <ul className="mt-2 space-y-2">
        {entries.map((entry) => (
          <li key={entry.challengeId}>
            <LedgerRow entry={entry} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function LedgerRow({ entry }: { entry: StakeEntry }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const bothSettled = entry.mySettled && entry.theirSettled;

  async function settle() {
    setPending(true);
    setError(null);
    const res = await markStakeSettled(entry.challengeId);
    setPending(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    router.refresh();
  }

  const verdict = entry.isTie
    ? "Tied — nobody owes anybody."
    : entry.iAmWinner
      ? `${entry.buddyLabel} owes you: ${entry.stakeText}`
      : `You owe ${entry.buddyLabel}: ${entry.stakeText}`;

  return (
    <Card className={bothSettled ? "opacity-60" : ""}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-black dark:text-zinc-50">{entry.name}</p>
          <p className={`mt-0.5 text-xs text-zinc-500 dark:text-zinc-400 ${bothSettled ? "line-through" : ""}`}>
            {verdict}
          </p>
        </div>
        {!entry.isTie && (
          <span className="shrink-0 text-xs text-zinc-400 dark:text-zinc-600">
            {bothSettled ? "Settled ✓" : entry.mySettled ? "Waiting on them" : ""}
          </span>
        )}
      </div>

      {error && (
        <p role="alert" className="mt-1 text-xs text-red-600 dark:text-red-400">
          {error}
        </p>
      )}

      {!entry.isTie && !entry.mySettled && (
        <button
          type="button"
          onClick={settle}
          disabled={pending}
          className="mt-2 rounded-md border border-zinc-300 px-2.5 py-1 text-xs font-medium text-black disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-50"
        >
          {pending ? "Marking…" : "Mark settled"}
        </button>
      )}
    </Card>
  );
}
