"use client";

// The translucent circular control from the Home reference (the power /
// volume / transport buttons). Deliberately *not* a `Surface` tier-2: those
// carry `backdrop-blur(20px)`, and docs/PLAN-DESIGN.md §1.2 caps the screen
// at two live backdrop-filter layers — the TabBar owns one and the control
// bar owns the other. So the translucency here comes from a layered fill plus
// a directional gloss instead of blur, which over the hero gradient reads the
// same but costs nothing to composite.

import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";
import { springs } from "@/components/ui/motion";

/** Light catching the top-left of the material — §12 of the Apple material notes. */
export const GLASS_GLOSS =
  "linear-gradient(155deg, rgba(255,255,255,0.11) 0%, rgba(255,255,255,0.035) 44%, rgba(255,255,255,0) 100%)";

export const GLASS_BUTTON_SHADOW =
  "var(--shadow-glass-hairline), 0 8px 22px rgba(0,0,0,0.32)";

const TONE_CLASS = {
  ink: "text-ink",
  muted: "text-ink-muted",
  sage: "text-sage",
  ochre: "text-ochre",
  lime: "text-lime",
} as const;

export function RoundButton({
  href,
  label,
  children,
  size = 52,
  tone = "ink",
  /** A filled, opaque treatment for the one primary control in a cluster. */
  emphasis = false,
  className = "",
  onClick,
  disabled = false,
}: {
  href?: string;
  /** Accessible name — these are icon-only, so it is required. */
  label: string;
  children: ReactNode;
  size?: number;
  tone?: keyof typeof TONE_CLASS;
  emphasis?: boolean;
  className?: string;
  onClick?: () => void;
  disabled?: boolean;
}) {
  const reduceMotion = useReducedMotion();

  const inner = (
    <>
      <span className="sr-only">{label}</span>
      {children}
    </>
  );

  const style = {
    width: size,
    height: size,
    backgroundImage: emphasis ? undefined : GLASS_GLOSS,
    boxShadow: emphasis
      ? "inset 0 1px 0 rgba(255,255,255,0.22), 0 10px 26px rgba(0,0,0,0.4)"
      : GLASS_BUTTON_SHADOW,
  };

  const shared = `inline-flex shrink-0 items-center justify-center rounded-full border transition-colors ${
    emphasis
      ? "border-sage/40 bg-sage/22 text-sage"
      : `border-glass-2-border bg-glass-2 ${TONE_CLASS[tone]}`
  } ${disabled ? "opacity-40" : ""} ${className}`;

  // Feedback on press-down, not release — the press scale is what sells the
  // control as a physical thing (Apple "Response" + "Direct manipulation").
  const press = reduceMotion || disabled ? undefined : { scale: 0.94 };
  const transition = springs.snappy;

  if (href && !disabled) {
    return (
      <motion.div whileTap={press} transition={transition} className="shrink-0">
        <Link href={href} aria-label={label} className={shared} style={style}>
          {inner}
        </Link>
      </motion.div>
    );
  }

  return (
    <motion.button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      whileTap={press}
      transition={transition}
      className={shared}
      style={style}
    >
      {inner}
    </motion.button>
  );
}
