"use client";

import type { HTMLMotionProps } from "motion/react";
import { Pressable } from "./Pressable";

const VARIANT_CLASS = {
  primary: "bg-sage text-bg-void",
  // No blur (D11 blur-budget fix): this variant is used many times per
  // screen (row actions, form buttons) — real blur on every instance blew
  // past docs/PLAN-DESIGN.md §1.2's two-live-blur budget the moment more than
  // one was on screen at once, alongside the tab bar and Screen's sticky
  // header. glass-2's fill/border alone still reads as "raised" without it.
  glass: "bg-glass-2 border border-glass-2-border text-ink",
  ghost: "text-ink-muted",
  danger: "bg-clay text-bg-void",
} as const;

// §1.5: 44px minimum touch target, always — both sizes share that floor and
// only differ in padding/type scale.
const SIZE_CLASS = {
  sm: "min-h-11 px-3.5 text-caption",
  md: "min-h-11 px-5 text-body",
} as const;

type ButtonProps = HTMLMotionProps<"button"> & {
  variant?: keyof typeof VARIANT_CLASS;
  size?: keyof typeof SIZE_CLASS;
};

export function Button({
  variant = "primary",
  size = "md",
  className = "",
  ...rest
}: ButtonProps) {
  return (
    <Pressable
      className={`inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-row font-medium disabled:opacity-40 ${VARIANT_CLASS[variant]} ${SIZE_CLASS[size]} ${className}`}
      style={{ boxShadow: variant === "glass" ? "var(--shadow-glass-hairline)" : undefined }}
      {...rest}
    />
  );
}
