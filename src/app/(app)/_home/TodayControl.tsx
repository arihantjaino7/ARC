"use client";

// The reference's power / brightness-slider / volume row, re-pointed at
// today's status:
//
//   power   -> log or update today (the screen's primary action)
//   slider  -> today's day score against your goals, 0-100
//   volume  -> straight into Progress
//
// This row owns the screen's one permitted `backdrop-filter` layer
// (docs/PLAN-DESIGN.md §1.2 caps it at two live blurs and the TabBar holds
// the other), which is why the glass here reads deeper than anywhere else on
// the screen. Everything above and below uses unblurred translucency.

import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
import { Ticker } from "@/components/ui/Ticker";
import { springs } from "@/components/ui/motion";
import { scoreColor } from "@/components/ui/scoreColor";
import { LogIcon, ProgressIcon } from "@/components/ui/icons";
import { RoundButton } from "./RoundButton";

const THUMB_W = 74;

export function TodayControl({
  score,
  logged,
  goalsMet,
  goalsTotal,
  hasGoals,
}: {
  /** 0-100 */
  score: number;
  logged: boolean;
  goalsMet: number;
  goalsTotal: number;
  hasGoals: boolean;
}) {
  const reduceMotion = useReducedMotion();
  const clamped = Math.max(0, Math.min(100, score));
  const tint = scoreColor(clamped);

  return (
    <div>
      {/* Context for the bare number, so the control doesn't need a legend
          to be readable — "adding context simplifies". */}
      <div className="mb-2.5 flex items-baseline justify-between px-1">
        <span className="text-overline uppercase text-ink-faint">Day score</span>
        <span className="text-caption text-ink-muted">
          {!hasGoals
            ? "No goals set yet"
            : `${goalsMet} of ${goalsTotal} ${goalsTotal === 1 ? "goal" : "goals"} met`}
        </span>
      </div>

      <div className="flex items-stretch gap-2.5">
        <RoundButton
          href="/progress"
          label={logged ? "Update today's log" : "Log today"}
          size={64}
          tone={logged ? "ink" : "sage"}
          className="self-stretch"
        >
          <LogIcon size={23} />
        </RoundButton>

        {/* The slider. A track with a proportional fill plus a raised thumb
            carrying the number — at 0 a pure fill would vanish and take the
            label with it, so the thumb is what actually reads the value. */}
        <Link
          href="/progress"
          aria-label={`Day score ${Math.round(clamped)} out of 100. Open Progress.`}
          className="relative min-w-0 flex-1 overflow-hidden rounded-[26px] border border-glass-2-border bg-glass-2 backdrop-blur-[20px]"
          style={{ boxShadow: "var(--shadow-glass-hairline), 0 8px 22px rgba(0,0,0,0.3)" }}
        >
          <span className="sr-only">
            Day score {Math.round(clamped)} out of 100
          </span>

          <motion.span
            aria-hidden
            className="absolute inset-y-0 left-0 block"
            style={{ backgroundColor: tint, opacity: 0.18 }}
            initial={{ width: "0%" }}
            animate={{ width: `${clamped}%` }}
            transition={reduceMotion ? { duration: 0 } : springs.soft}
          />

          <motion.span
            aria-hidden
            className="absolute inset-y-1.5 flex items-center justify-center rounded-[20px] border border-white/[0.14]"
            style={{
              width: THUMB_W,
              backgroundImage:
                "linear-gradient(160deg, rgba(255,255,255,0.17) 0%, rgba(255,255,255,0.07) 100%)",
              boxShadow: "inset 0 1px 0 rgba(255,255,255,0.2), 0 6px 16px rgba(0,0,0,0.34)",
            }}
            initial={{ left: 6 }}
            // Kept fully inside the track at both ends: the thumb travels the
            // usable width, it doesn't hang off the edge at 0 or 100.
            animate={{ left: `calc(6px + (100% - ${THUMB_W + 12}px) * ${clamped / 100})` }}
            transition={reduceMotion ? { duration: 0 } : springs.soft}
          >
            <Ticker value={clamped} className="text-body font-semibold text-ink" format={(v) => `${Math.round(v)}%`} />
          </motion.span>
        </Link>

        <RoundButton href="/progress" label="Open progress" size={64} className="self-stretch">
          <ProgressIcon size={21} />
        </RoundButton>
      </div>
    </div>
  );
}
