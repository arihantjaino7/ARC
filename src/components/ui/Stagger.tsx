"use client";

// Screen/list entrance: children stagger in, 14px up + fade, 28ms apart.
// §3.1 #1 — one primitive so every screen inherits it without being touched.
// `useReducedMotion` is handled here, once, per docs/PLAN-DESIGN.md §3.2:
// under reduced motion this collapses to an opacity-only fade with no stagger
// delay between children.

import { motion, useReducedMotion, type HTMLMotionProps } from "motion/react";
import {
  enterVariants,
  enterVariantsReduced,
  springs,
  STAGGER_GAP,
} from "./motion";

type StaggerProps = HTMLMotionProps<"div">;

/** Wraps a list of `Stagger.Item`s (or any children) and staggers their entrance. */
export function Stagger({ children, ...rest }: StaggerProps) {
  const reduceMotion = useReducedMotion();

  return (
    <motion.div
      initial="hidden"
      animate="show"
      variants={{
        hidden: {},
        show: {
          transition: { staggerChildren: reduceMotion ? 0 : STAGGER_GAP },
        },
      }}
      {...rest}
    >
      {children}
    </motion.div>
  );
}

Stagger.Item = function StaggerItem({ children, ...rest }: HTMLMotionProps<"div">) {
  const reduceMotion = useReducedMotion();

  return (
    <motion.div
      variants={reduceMotion ? enterVariantsReduced : enterVariants}
      transition={springs.soft}
      {...rest}
    >
      {children}
    </motion.div>
  );
};
