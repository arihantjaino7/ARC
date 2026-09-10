"use client";

// Numbers count up — §3.1 #5. ~700ms ease-out, tabular figures so nothing
// jitters as digit widths change mid-count.

import { useEffect, useRef, useState } from "react";
import { animate, useReducedMotion } from "motion/react";

export function Ticker({
  value,
  duration = 0.7,
  round = true,
  format,
  className = "",
}: {
  value: number;
  duration?: number;
  round?: boolean;
  format?: (value: number) => string;
  className?: string;
}) {
  const reduceMotion = useReducedMotion();
  const [displayed, setDisplayed] = useState(value);
  const previousValue = useRef(value);

  useEffect(() => {
    if (reduceMotion) {
      previousValue.current = value;
      return;
    }
    const controls = animate(previousValue.current, value, {
      duration,
      ease: [0.32, 0.72, 0, 1],
      onUpdate: (latest) => setDisplayed(round ? Math.round(latest) : latest),
    });
    previousValue.current = value;
    return () => controls.stop();
  }, [value, duration, round, reduceMotion]);

  const shown = reduceMotion ? value : displayed;
  return <span className={`tabular-nums ${className}`}>{format ? format(shown) : shown}</span>;
}
