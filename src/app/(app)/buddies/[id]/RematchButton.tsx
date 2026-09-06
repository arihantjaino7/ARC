"use client";

// "Run it back" (V2 Step 13, docs/PLAN-V2.md §5): one tap clones the ended
// challenge's current ruleset into a fresh one starting tomorrow, via the
// same createChallenge codepath the wizard uses. Shown only once the
// challenge has ended — see the `ended` check in page.tsx.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { rematchChallenge } from "@/lib/challenges/actions";

export function RematchButton({ challengeId }: { challengeId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function run() {
    setPending(true);
    setError(null);
    const res = await rematchChallenge(challengeId);
    setPending(false);

    if ("error" in res) {
      setError(res.error);
      return;
    }
    setLink(typeof window !== "undefined" ? `${window.location.origin}/join/${res.token}` : res.token);
    router.refresh();
  }

  if (link) {
    return (
      <div className="rounded-lg border border-zinc-200 p-3 text-xs dark:border-zinc-800">
        <p className="font-medium text-black dark:text-zinc-50">
          New challenge created — same rules, starting tomorrow.
        </p>
        <p className="mt-1 break-all text-zinc-500 dark:text-zinc-400">{link}</p>
        <button
          type="button"
          onClick={() => navigator.clipboard.writeText(link).then(() => setCopied(true))}
          className="mt-2 rounded-md bg-black px-2.5 py-1 text-xs font-medium text-white dark:bg-white dark:text-black"
        >
          {copied ? "Copied!" : "Copy link"}
        </button>
      </div>
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={run}
        disabled={pending}
        className="w-full rounded-lg bg-black px-3 py-2 text-xs font-medium text-white disabled:opacity-50 dark:bg-white dark:text-black"
      >
        {pending ? "Setting up…" : "Run it back"}
      </button>
      {error && (
        <p role="alert" className="mt-1 text-xs text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}
