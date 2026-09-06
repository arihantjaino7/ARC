"use client";

// Buddy verification's confirm/flag control (V2 Step 11, docs/PLAN-V2.md §4
// layer 5): the buddy's last 48 hours of entries, each with a button to
// confirm ('ok') or flag ('disputed'). A disputed entry drops to 0 in the
// scoreboard (challenge_scoreboard excludes it, same as an unlogged day)
// until it's changed back — see supabase/step16_verifications.sql.

import { useState } from "react";
import { useRouter } from "next/navigation";
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
      <p className="text-xs text-zinc-500 dark:text-zinc-400">
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
    <li className="flex items-center justify-between gap-3 rounded-lg border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-800">
      <div className="min-w-0">
        <p className="truncate text-black dark:text-zinc-50">
          {entry.logDate} &middot; {metricDef ? metricLabel(metricDef) : entry.metricKey}
        </p>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          {formatValue(entry)}
          {entry.isLate && " · late"}
          {entry.implausible && " · flagged"}
        </p>
      </div>

      {state === "disputed" ? (
        <button
          type="button"
          onClick={() => verify("ok")}
          disabled={pending}
          className="shrink-0 rounded-md border border-red-300 px-2.5 py-1 text-xs font-medium text-red-700 disabled:opacity-40 dark:border-red-900 dark:text-red-400"
        >
          Disputed — undo
        </button>
      ) : state === "ok" ? (
        <span className="shrink-0 text-xs font-medium text-emerald-600 dark:text-emerald-400">Confirmed</span>
      ) : (
        <div className="flex shrink-0 gap-1.5">
          <button
            type="button"
            onClick={() => verify("ok")}
            disabled={pending}
            className="rounded-md border border-zinc-300 px-2.5 py-1 text-xs font-medium text-black disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-50"
          >
            Confirm
          </button>
          <button
            type="button"
            onClick={() => verify("disputed")}
            disabled={pending}
            className="rounded-md border border-red-300 px-2.5 py-1 text-xs font-medium text-red-700 disabled:opacity-40 dark:border-red-900 dark:text-red-400"
          >
            Flag
          </button>
        </div>
      )}
    </li>
  );
}
