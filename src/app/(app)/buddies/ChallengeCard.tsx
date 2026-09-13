"use client";

// One buddy, one card, one tap: the compact Sheet preview (docs/PLAN-DESIGN.md
// §3.1 pattern already used by RuleEditor's custom-metric form) before
// committing to the full scoreboard at /buddies/<buddyId>. Populated entirely
// from the summary already loaded for the card list — no extra fetch.

import { useState } from "react";
import Link from "next/link";
import { Surface } from "@/components/ui/Surface";
import { Chip } from "@/components/ui/Chip";
import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import type { BuddyChallengeSummary } from "@/lib/challenges/actions";

const STATUS_LABEL: Record<string, string> = {
  pending: "Waiting to be accepted",
  active: "Active",
  completed: "Completed",
  cancelled: "Cancelled",
};

const STATUS_TONE: Record<string, "sage" | "ochre" | "clay" | "neutral"> = {
  active: "sage",
  pending: "ochre",
  completed: "neutral",
  cancelled: "clay",
};

export function ChallengeCard({
  buddyId,
  buddyEmail,
  challenge,
}: {
  buddyId: string;
  buddyEmail: string;
  challenge: BuddyChallengeSummary;
}) {
  const [open, setOpen] = useState(false);
  const statusTone = STATUS_TONE[challenge.status] ?? "neutral";
  const statusLabel = STATUS_LABEL[challenge.status] ?? challenge.status;

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="block w-full text-left">
        <Surface tier={1} radius="card" className="p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="min-w-0 truncate text-body font-medium text-ink">{buddyEmail}</p>
            <Chip tone={statusTone}>{statusLabel}</Chip>
          </div>
          <p className="mt-1 truncate text-caption text-ink-muted">{challenge.name}</p>
        </Surface>
      </button>

      <Sheet open={open} onClose={() => setOpen(false)} title={challenge.name}>
        <div className="space-y-3">
          <p className="text-body text-ink-muted">
            With <span className="font-medium text-ink">{buddyEmail}</span>
          </p>
          <div className="flex items-center gap-2">
            <Chip tone={statusTone}>{statusLabel}</Chip>
            <span className="text-caption text-ink-faint">
              {challenge.startDate} &rarr; {challenge.endDate}
            </span>
          </div>
          <Link href={`/buddies/${buddyId}`} className="block">
            <Button type="button" className="w-full">
              View details
            </Button>
          </Link>
        </div>
      </Sheet>
    </>
  );
}
