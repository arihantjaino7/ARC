"use client";

// Circular progress, score-coloured — the Home hero stat. Shares its
// score → colour interpolation with Bar.tsx so a ring and a bar showing the
// same number always agree on colour.

import { motion, useReducedMotion } from "motion/react";
import { springs } from "./motion";
import { scoreColor } from "./scoreColor";

export function Ring({
  score,
  size = 160,
  strokeWidth = 12,
  children,
}: {
  /** 0-100 */
  score: number;
  size?: number;
  strokeWidth?: number;
  children?: React.ReactNode;
}) {
  const reduceMotion = useReducedMotion();
  const clamped = Math.max(0, Math.min(100, score));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - clamped / 100);

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--glass-1-border)"
          strokeWidth={strokeWidth}
        />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={scoreColor(clamped)}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={reduceMotion ? { duration: 0 } : springs.soft}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">{children}</div>
    </div>
  );
}
