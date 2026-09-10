"use client";

// Route transitions — docs/PLAN-DESIGN.md §3.1 #2. Forward: slide in 24px
// from the right + slight scale on the outgoing screen. Back: reverse.
// Direction is inferred from a simple in-memory stack of visited pathnames:
// landing on the entry just below the current top means "back", anything
// else is "forward" (including a fresh push). Dev-mode Strict Mode double
// renders can occasionally push a duplicate entry — worst case that just
// picks "forward" instead of "back" for one transition, never a functional
// bug.
//
// Children are wrapped in Stagger here too, so every screen inherits the
// entrance animation (§3.1 #1) without being touched individually.

import { usePathname } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useMemo } from "react";
import { Stagger } from "@/components/ui/Stagger";
import { ease, times } from "@/components/ui/motion";

const visitedStack: string[] = [];

function resolveDirection(pathname: string): "forward" | "back" {
  const backIndex = visitedStack.length - 2;
  if (backIndex >= 0 && visitedStack[backIndex] === pathname) {
    visitedStack.pop();
    return "back";
  }
  if (visitedStack[visitedStack.length - 1] !== pathname) {
    visitedStack.push(pathname);
  }
  return "forward";
}

export default function Template({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const reduceMotion = useReducedMotion();
  const direction = useMemo(() => resolveDirection(pathname), [pathname]);
  const offset = direction === "back" ? -24 : 24;

  return (
    <AnimatePresence mode="popLayout" initial={false}>
      <motion.div
        key={pathname}
        initial={reduceMotion ? { opacity: 0 } : { opacity: 0, x: offset, scale: 0.98 }}
        animate={{ opacity: 1, x: 0, scale: 1 }}
        exit={reduceMotion ? { opacity: 0 } : { opacity: 0, x: -offset, scale: 0.98 }}
        transition={{ duration: times.enter, ease }}
      >
        <Stagger>{children}</Stagger>
      </motion.div>
    </AnimatePresence>
  );
}
