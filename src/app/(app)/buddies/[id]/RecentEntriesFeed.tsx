"use client";

// Buddy verification's confirm/flag control (V2 Step 11, docs/PLAN-V2.md §4
// layer 5): the buddy's last 48 hours of entries, each with a button to
// confirm ('ok') or flag ('disputed'). A disputed entry drops to 0 in the
// scoreboard (challenge_scoreboard excludes it, same as an unlogged day)
// until it's changed back — see supabase/step16_verifications.sql.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/Screen";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { submitVerification } from "@/lib/challenges/actions";
import type { RecentEntry } from "@/lib/challenges/types";
import { findMetric, metricLabel, BUILTIN_METRICS } from "@/lib/metrics/types";

function formatValue(entry: RecentEntry): string {
  if (typeof entry.value === "boolean") return entry.value ? "Done" : "Not done";
  const metric = findMetric(BUILTIN_METRICS, entry.metricKey);
  return metric ? `${entry.value} ${metric.unit ?? ""}`.trim() : String(entry.value);
}

export function RecentEntriesFeed({ entries }: { entries: RecentEntry[] }) {
  if (entries.length === 0) {
    return (
      <p className="text-caption text-ink-muted">
        Nothing logged by them in the last 48 hours yet.
      </p>
    );
  }

  return (
    <ul className="space-y-2">
      {entries.map((entry) => (
        <EntryRow key={entry.entryId} entry={entry} />
      ))}
    </ul>
  );
}

function EntryRow({ entry }: { entry: RecentEntry }) {
  const router = useRouter();
  const [state, setState] = useState(entry.myVerification);
  const [pending, setPending] = useState(false);

  async function verify(next: "ok" | "disputed") {
    setPending(true);
    const res = await submitVerification(entry.entryId, next);
    setPending(false);
    if (!res.error) {
      setState(next);
      router.refresh();
    }
  }

  const metricDef = findMetric(BUILTIN_METRICS, entry.metricKey);

  return (
    <li>
      <Card className="flex items-center justify-between gap-3 p-3">
        <div className="min-w-0">
          <p className="truncate text-body text-ink">
            {entry.logDate} &middot; {metricDef ? metricLabel(metricDef) : entry.metricKey}
          </p>
          <p className="text-caption text-ink-muted">
            {formatValue(entry)}
            {entry.isLate && " · late"}
            {entry.implausible && " · flagged"}
          </p>
        </div>

        {state === "disputed" ? (
          <Button type="button" variant="danger" size="sm" onClick={() => verify("ok")} disabled={pending} className="shrink-0">
            Disputed — undo
          </Button>
        ) : state === "ok" ? (
          <Chip tone="sage" className="shrink-0">
            Confirmed
          </Chip>
        ) : (
          <div className="flex shrink-0 gap-1.5">
            <Button type="button" variant="glass" size="sm" onClick={() => verify("ok")} disabled={pending}>
              Confirm
            </Button>
            <Button type="button" variant="danger" size="sm" onClick={() => verify("disputed")} disabled={pending}>
              Flag
            </Button>
          </div>
        )}
      </Card>
    </li>
  );
}
