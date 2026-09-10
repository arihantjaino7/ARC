"use client";

// Score-coloured animated bar — §1.3 "Score-driven colour" and §3.1 #4.
// Interpolates ink-faint → moss → sage → lime across 0-100 rather than one
// flat green, so a 12% bar doesn't look as triumphant as a 96% bar.

import { motion, useReducedMotion } from "motion/react";
import { springs } from "./motion";
import { scoreColor } from "./scoreColor";

export function Bar({
  score,
  index = 0,
  className = "",
  trackClassName = "",
}: {
  /** 0-100 */
  score: number;
  /** stagger index — 60ms per-index, per §3.1 #4 */
  index?: number;
  className?: string;
  trackClassName?: string;
}) {
  const reduceMotion = useReducedMotion();
  const clamped = Math.max(0, Math.min(100, score));

  return (
    <div
      className={`h-2 w-full overflow-hidden rounded-full bg-glass-1 ${trackClassName}`}
      role="progressbar"
      aria-valuenow={Math.round(clamped)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <motion.div
        className={`h-full rounded-full ${className}`}
        style={{ backgroundColor: scoreColor(clamped) }}
        initial={{ width: "0%" }}
        animate={{ width: `${clamped}%` }}
        transition={
          reduceMotion
            ? { duration: 0 }
            : { ...springs.soft, delay: index * 0.06 }
        }
      />
    </div>
  );
}
