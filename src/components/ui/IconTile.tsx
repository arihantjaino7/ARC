"use client";

// The PowerPeak-influenced grid tile — §2.1. Four across on Home.

import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";

// Static class strings, not a template literal keyed by `tone` — Tailwind
// v4's scanner only picks up class names it can see literally in source.
const TONE_CLASS = {
  sage: "bg-sage/12 text-sage",
  ochre: "bg-ochre/12 text-ochre",
  clay: "bg-clay/12 text-clay",
  lime: "bg-lime/12 text-lime",
} as const;

export function IconTile({
  href,
  icon,
  label,
  tone = "sage",
}: {
  href: string;
  /** A rendered icon element, e.g. `<LogIcon size={22} />` — a component
   *  reference can't cross the server/client boundary when this is rendered
   *  from a Server Component, but a rendered element can. */
  icon: ReactNode;
  label: string;
  tone?: keyof typeof TONE_CLASS;
}) {
  const reduceMotion = useReducedMotion();

  return (
    <motion.div whileTap={reduceMotion ? undefined : { scale: 0.96 }}>
      <Link
        href={href}
        className="flex h-[76px] flex-col items-center justify-center gap-1.5 rounded-card border border-glass-1-border bg-glass-1"
        style={{ boxShadow: "var(--shadow-glass-hairline)" }}
      >
        <span
          className={`flex h-10 w-10 items-center justify-center rounded-full ${TONE_CLASS[tone]}`}
        >
          {icon}
        </span>
        <span className="text-[11px] text-ink-muted">{label}</span>
      </Link>
    </motion.div>
  );
}
