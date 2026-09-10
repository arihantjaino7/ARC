"use client";

// Grace tokens (V2 Step 13, docs/PLAN-V2.md §5): one excused day per 30-day
// period per challenge, declared before the day ends. `usedThisPeriod` is
// computed server-side in page.tsx from the scoreboard's `gracedDates` — this
// component just renders the button and calls the action.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
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
      <Button type="button" variant="glass" onClick={use} disabled={usedThisPeriod || pending} className="w-full">
        {usedThisPeriod
          ? "Grace token used this period"
          : pending
            ? "Using today's grace token…"
            : "Use a grace token for today"}
      </Button>
      {error && (
        <p role="alert" className="mt-1 text-caption text-clay">
          {error}
        </p>
      )}
    </div>
  );
}
