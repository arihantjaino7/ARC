"use client";

// Tap feedback everywhere — one wrapper, `whileTap={{ scale: 0.97 }}` plus a
// short haptic buzz where supported. §3.1 #7: does more for "feels like an
// app" than any other single item in the motion plan.

import { motion, useReducedMotion, type HTMLMotionProps } from "motion/react";

type PressableProps = HTMLMotionProps<"button"> & {
  /** Milliseconds for `navigator.vibrate`. Set to 0 to skip the haptic. */
  haptic?: number;
};

export function Pressable({ haptic = 8, onTapStart, children, ...rest }: PressableProps) {
  const reduceMotion = useReducedMotion();

  return (
    <motion.button
      whileTap={reduceMotion ? undefined : { scale: 0.97 }}
      onTapStart={(event, info) => {
        if (haptic > 0 && typeof navigator !== "undefined" && navigator.vibrate) {
          navigator.vibrate(haptic);
        }
        onTapStart?.(event, info);
      }}
      {...rest}
    >
      {children}
    </motion.button>
  );
}
