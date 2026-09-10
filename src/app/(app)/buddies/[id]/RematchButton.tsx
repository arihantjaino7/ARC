"use client";

// "Run it back" (V2 Step 13, docs/PLAN-V2.md §5): one tap clones the ended
// challenge's current ruleset into a fresh one starting tomorrow, via the
// same createChallenge codepath the wizard uses. Shown only once the
// challenge has ended — see the `ended` check in page.tsx. Copy button uses
// the same morph-to-check + glow pattern as CommunityInviteLink (§3.1 #11).

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Surface } from "@/components/ui/Surface";
import { Button } from "@/components/ui/Button";
import { Pressable } from "@/components/ui/Pressable";
import { CheckIcon, LinkIcon } from "@/components/ui/icons";
import { springs } from "@/components/ui/motion";
import { rematchChallenge } from "@/lib/challenges/actions";

export function RematchButton({ challengeId }: { challengeId: string }) {
  const router = useRouter();
  const reduceMotion = useReducedMotion();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1800);
    return () => clearTimeout(t);
  }, [copied]);

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
      <Surface tier={1} radius="card" className="p-3 text-caption">
        <p className="font-medium text-ink">New challenge created — same rules, starting tomorrow.</p>
        <motion.div
          animate={copied ? { boxShadow: "0 0 0 2px rgba(163,201,168,0.5)" } : { boxShadow: "0 0 0 0px rgba(163,201,168,0)" }}
          transition={{ duration: reduceMotion ? 0 : 0.5 }}
        >
          <p className="mt-1 break-all text-ink-muted">{link}</p>
        </motion.div>
        <Pressable
          type="button"
          onClick={() => navigator.clipboard.writeText(link).then(() => setCopied(true))}
          className="mt-2 inline-flex min-h-9 items-center justify-center gap-1.5 rounded-row bg-sage px-4 text-caption font-medium text-bg-void"
        >
          <AnimatePresence mode="popLayout" initial={false}>
            {copied ? (
              <motion.span
                key="check"
                initial={reduceMotion ? { opacity: 0 } : { scale: 0.5, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={reduceMotion ? { opacity: 0 } : { scale: 0.5, opacity: 0 }}
                transition={reduceMotion ? { duration: 0 } : springs.snappy}
                className="inline-flex items-center gap-1.5"
              >
                <CheckIcon size={14} />
                Copied
              </motion.span>
            ) : (
              <motion.span
                key="copy"
                initial={reduceMotion ? { opacity: 0 } : { scale: 0.5, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={reduceMotion ? { opacity: 0 } : { scale: 0.5, opacity: 0 }}
                transition={reduceMotion ? { duration: 0 } : springs.snappy}
                className="inline-flex items-center gap-1.5"
              >
                <LinkIcon size={14} />
                Copy link
              </motion.span>
            )}
          </AnimatePresence>
        </Pressable>
      </Surface>
    );
  }

  return (
    <div>
      <Button type="button" onClick={run} disabled={pending} className="w-full">
        {pending ? "Setting up…" : "Run it back"}
      </Button>
      {error && (
        <p role="alert" className="mt-1 text-caption text-clay">
          {error}
        </p>
      )}
    </div>
  );
}
