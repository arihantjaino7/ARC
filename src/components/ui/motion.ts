// The one motion spec every primitive imports from — consistency matters more
// than any individual animation. See docs/PLAN-DESIGN.md §3.

import type { Transition, Variants } from "motion/react";

export const springs = {
  /** tap feedback, the tab indicator */
  snappy: { type: "spring", stiffness: 420, damping: 32, mass: 0.8 } satisfies Transition,
  /** screen entrances, bars/rings filling in */
  soft: { type: "spring", stiffness: 260, damping: 30 } satisfies Transition,
  /** bottom sheets */
  sheet: { type: "spring", stiffness: 320, damping: 34 } satisfies Transition,
};

/** out-expo, iOS-ish — for plain CSS/tween transitions, not springs. */
export const ease = [0.32, 0.72, 0, 1] as const;

export const times = {
  micro: 0.14,
  base: 0.22,
  enter: 0.32,
  sheet: 0.42,
};

/** Screen/list entrance: 14px up + fade. Pair with `Stagger` for the 28ms gap. */
export const enterVariants: Variants = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0 },
};

/** Reduced-motion twin of `enterVariants` — opacity only, no travel. */
export const enterVariantsReduced: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1 },
};

export const STAGGER_GAP = 0.028;
