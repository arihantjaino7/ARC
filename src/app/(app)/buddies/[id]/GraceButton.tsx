"use client";

// Grace tokens (V2 Step 13, docs/PLAN-V2.md §5): one excused day per 30-day
// period per challenge, declared before the day ends. `usedThisPeriod` is
// computed server-side in page.tsx from the scoreboard's `gracedDates` — this
// component just renders the button and calls the action.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { declareGraceDay } from "@/lib/challenges/actions";

export function GraceButton({ challengeId, usedThisPeriod }: { challengeId: string; usedThisPeriod: boolean }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function use() {
    setPending(true);
    setError(null);
    const res = await declareGraceDay(challengeId);
    setPending(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    router.refresh();
  }

  return (
    <div>
      <button
        type="button"
        onClick={use}
        disabled={usedThisPeriod || pending}
        className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-xs font-medium text-black disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-50"
      >
        {usedThisPeriod
          ? "Grace token used this period"
          : pending
            ? "Using today's grace token…"
            : "Use a grace token for today"}
      </button>
      {error && (
        <p role="alert" className="mt-1 text-xs text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}
