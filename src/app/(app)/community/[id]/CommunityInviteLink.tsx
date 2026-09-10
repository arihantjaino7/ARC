"use client";

// Admin-only "invite anyone through a link" (feature request). Fetches or
// creates the community's one live invite link on mount, offers a copy
// button, and a "generate new link" escape hatch (revokes the old one).
// The copy button morphs to a check with a spring pop, and the link row
// flashes a sage glow — docs/PLAN-DESIGN.md §3.1 #11.

import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Surface } from "@/components/ui/Surface";
import { Button } from "@/components/ui/Button";
import { Pressable } from "@/components/ui/Pressable";
import { CheckIcon, LinkIcon } from "@/components/ui/icons";
import { springs } from "@/components/ui/motion";
import { getOrCreateCommunityInviteLink, regenerateCommunityInviteLink } from "@/lib/communities/actions";

export function CommunityInviteLink({ communityId }: { communityId: string }) {
  const reduceMotion = useReducedMotion();
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getOrCreateCommunityInviteLink(communityId).then((res) => {
      if (cancelled) return;
      if ("error" in res) setError(res.error);
      else setToken(res.token);
    });
    return () => {
      cancelled = true;
    };
  }, [communityId]);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1800);
    return () => clearTimeout(t);
  }, [copied]);

  const link = token && typeof window !== "undefined" ? `${window.location.origin}/community/join/${token}` : "";

  async function regenerate() {
    setPending(true);
    setError(null);
    setCopied(false);
    const res = await regenerateCommunityInviteLink(communityId);
    setPending(false);
    if ("error" in res) {
      setError(res.error);
      return;
    }
    setToken(res.token);
  }

  return (
    <section className="mt-5">
      <p className="text-overline text-ink-faint">Invite link</p>
      <p className="mt-1 text-caption text-ink-muted">
        Anyone with this link joins instantly — no request, no approval.
      </p>

      {error && <p className="mt-2 text-caption text-clay">{error}</p>}

      {link && (
        <motion.div
          animate={copied ? { boxShadow: "0 0 0 2px rgba(163,201,168,0.5)" } : { boxShadow: "0 0 0 0px rgba(163,201,168,0)" }}
          transition={{ duration: reduceMotion ? 0 : 0.5 }}
        >
          <Surface tier={1} radius="row" className="mt-2 break-all px-3 py-2.5 text-caption text-ink-muted">
            {link}
          </Surface>
        </motion.div>
      )}

      <div className="mt-2 flex items-center gap-3">
        <Pressable
          type="button"
          disabled={!link}
          onClick={() => {
            navigator.clipboard.writeText(link).then(() => setCopied(true));
          }}
          className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-row bg-sage px-5 text-body font-medium text-bg-void disabled:opacity-40"
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
                <CheckIcon size={16} />
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
                <LinkIcon size={16} />
                Copy link
              </motion.span>
            )}
          </AnimatePresence>
        </Pressable>
        <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={regenerate}>
          {pending ? "Generating…" : "Generate new link"}
        </Button>
      </div>
    </section>
  );
}
