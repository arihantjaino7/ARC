"use client";

// Same stagger-in + tap-for-popover behavior as Progress's and the community
// member drill-down's heat strips (progress/HeatStrip.tsx,
// community/[id]/member/[userId]/HeatStrip.tsx). This one additionally takes
// `hideDate` — the buddy's own today-cell, greyed out (not colored) rather
// than scored, while blind mode is withholding it.

import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { springs } from "@/components/ui/motion";
import { scoreColor } from "@/components/ui/scoreColor";
import type { ScoreboardParticipant } from "@/lib/challenges/types";

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.012 } },
};

const cellVariants = {
  hidden: { opacity: 0, scale: 0.4 },
  show: { opacity: 1, scale: 1 },
};

const cellVariantsReduced = {
  hidden: { opacity: 0 },
  show: { opacity: 1 },
};

// Explicit "en-US" (not `undefined`) — see progress/HeatStrip.tsx's identical
// note: an unset locale renders differently on the server than in a browser,
// which is a hydration mismatch React can't patch up.
function formatDate(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

export function HeatStrip({
  label,
  cells,
  hideDate,
}: {
  label: string;
  cells: ScoreboardParticipant["heatStrip"];
  hideDate?: string | null;
}) {
  const reduceMotion = useReducedMotion();
  const [selected, setSelected] = useState<number | null>(null);

  return (
    <div>
      <div className="flex items-center gap-2">
        <span className="w-16 shrink-0 truncate text-caption text-ink-muted">{label}</span>
        <div className="relative flex-1">
          <AnimatePresence>
            {selected !== null && (
              <motion.div
                className="absolute bottom-full z-10 mb-2 -translate-x-1/2 whitespace-nowrap rounded-chip border border-glass-3-border bg-glass-3 px-3 py-1.5 text-caption text-ink backdrop-blur-[40px] backdrop-saturate-[1.6]"
                style={{
                  left: `${((selected + 0.5) / cells.length) * 100}%`,
                  boxShadow: "var(--shadow-glass-hairline)",
                }}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 4 }}
                transition={{ duration: 0.14 }}
              >
                <span className="text-ink-muted">{formatDate(cells[selected].date)}</span>{" "}
                <span className="font-medium tabular-nums">
                  {hideDate === cells[selected].date
                    ? "hidden"
                    : cells[selected].score === null
                      ? "rest day"
                      : `${cells[selected].score}`}
                </span>
              </motion.div>
            )}
          </AnimatePresence>

          <motion.div className="flex gap-[3px]" initial="hidden" animate="show" variants={container}>
            {cells.map((cell, i) => {
              const hidden = hideDate === cell.date;
              return (
                <motion.button
                  key={cell.date}
                  type="button"
                  variants={reduceMotion ? cellVariantsReduced : cellVariants}
                  transition={springs.soft}
                  onClick={() => setSelected((prev) => (prev === i ? null : i))}
                  className="h-4 flex-1 rounded-sm"
                  style={{
                    backgroundColor: hidden
                      ? "var(--glass-2-border)"
                      : cell.score === null
                        ? "var(--glass-1)"
                        : scoreColor(cell.score),
                    outline: selected === i ? "1.5px solid var(--ink-muted)" : undefined,
                    outlineOffset: 1,
                  }}
                  aria-label={`${formatDate(cell.date)}: ${hidden ? "hidden" : cell.score === null ? "rest day" : `${cell.score}%`}`}
                />
              );
            })}
          </motion.div>
        </div>
      </div>
    </div>
  );
}
