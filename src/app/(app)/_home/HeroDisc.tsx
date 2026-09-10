"use client";

// The Home hero: the big circular object from the reference, sat inside two
// bleeding concentric rings that the screen edges crop. Everything here is
// decoration plus two floating status chips — the numbers themselves live in
// TodayControl below it, so this never competes with them for attention.
//
// The centre is a slot. Drop a square image at `HERO_IMAGE_SRC` (see
// page.tsx) and it becomes the disc; until then the CSS fallback below draws
// a speaker-grille of concentric hairlines with the app monogram, so the
// screen is never a broken image or an empty hole.

import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { springs } from "@/components/ui/motion";
import { scoreColor } from "@/components/ui/scoreColor";
import { FlameIcon } from "@/components/ui/icons";

const DISC = 276;
const RIM = 304;
const RING_MID = 388;
const RING_OUT = 478;
const BOX = 316;

/** Swings the rim lettering off the top and round to the upper-left, clear of
 *  the chip stack — where the reference prints its own curved text. */
const RIM_TEXT_ROTATION = -54;

/** Concentric hairlines + a top-left gloss over a dark body. */
const FALLBACK_SURFACE = [
  "repeating-radial-gradient(circle at 50% 50%, rgba(255,255,255,0.055) 0px, rgba(255,255,255,0.055) 1px, rgba(0,0,0,0) 1px, rgba(0,0,0,0) 6px)",
  "radial-gradient(circle at 36% 28%, rgba(255,255,255,0.13), rgba(255,255,255,0) 48%)",
  "radial-gradient(circle at 50% 50%, #16211b 0%, #0d1310 58%, #080b09 100%)",
].join(", ");

function Chip({ children, delay }: { children: React.ReactNode; delay: number }) {
  const reduceMotion = useReducedMotion();

  return (
    <motion.div
      initial={reduceMotion ? { opacity: 0 } : { opacity: 0, x: 12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ ...springs.soft, delay }}
      className="flex items-center gap-1.5 rounded-full border border-glass-2-border bg-glass-2 py-1.5 pl-2 pr-3 text-caption font-medium text-ink"
      style={{
        backgroundImage:
          "linear-gradient(155deg, rgba(255,255,255,0.10) 0%, rgba(255,255,255,0.02) 60%, rgba(255,255,255,0) 100%)",
        boxShadow: "var(--shadow-glass-hairline), 0 6px 18px rgba(0,0,0,0.34)",
      }}
    >
      {children}
    </motion.div>
  );
}

export function HeroDisc({
  src,
  score,
  streak,
  goalsMet,
  goalsTotal,
  rimText,
}: {
  src: string;
  /** 0-100 — drawn as a soft arc on the rim, never as a number. */
  score: number;
  streak: number;
  goalsMet: number;
  goalsTotal: number;
  rimText: string;
}) {
  const reduceMotion = useReducedMotion();
  const [hasImage, setHasImage] = useState(false);

  // Probed rather than rendered with an onError fallback, so a missing file
  // never paints a broken-image frame first.
  useEffect(() => {
    let cancelled = false;
    const probe = new window.Image();
    probe.onload = () => {
      if (!cancelled) setHasImage(true);
    };
    probe.src = src;
    return () => {
      cancelled = true;
    };
  }, [src]);

  const clamped = Math.max(0, Math.min(100, score));
  const r = (RIM - 3) / 2;
  const circumference = 2 * Math.PI * r;
  // Top arc: glyphs only sit upright on this sweep. The whole SVG is then
  // rotated so the lettering rides the upper-left of the disc instead of
  // running straight under the chips.
  const textR = DISC / 2 - 13;
  const rimPath = `M ${RIM / 2 - textR} ${RIM / 2} A ${textR} ${textR} 0 0 1 ${RIM / 2 + textR} ${RIM / 2}`;
  const goalSweep = goalsTotal > 0 ? (goalsMet / goalsTotal) * 360 : 0;

  return (
    // Full-bleed and clipped: the outer rings are wider than the phone on
    // purpose, and without the clip they add ~45px of horizontal scroll.
    <div
      className="relative -mx-gutter flex items-center justify-center overflow-x-clip"
      style={{ height: BOX }}
    >
      {/* The two rings the screen crops — the reference's sense of a much
          larger object sitting behind the viewport. */}
      <div
        aria-hidden
        className="pointer-events-none absolute rounded-full border border-white/[0.045]"
        style={{ width: RING_OUT, height: RING_OUT }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute rounded-full border border-white/[0.07]"
        style={{ width: RING_MID, height: RING_MID }}
      />

      {/* Bloom directly behind the disc, so the glass chips sitting over it
          have colour variance to lift off. */}
      <div
        aria-hidden
        className="pointer-events-none absolute rounded-full"
        style={{
          width: RING_MID,
          height: RING_MID,
          background:
            "radial-gradient(circle, rgba(163,201,168,0.20) 0%, rgba(79,122,91,0.10) 42%, rgba(0,0,0,0) 68%)",
        }}
      />

      <motion.div
        initial={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.92 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={springs.soft}
        className="relative"
        style={{ width: RIM, height: RIM }}
      >
        {/* Rim: a static hairline track with today's score drawn over it.
            Quiet on purpose — reinforcement for the slider, not a rival. */}
        <svg
          aria-hidden
          className="absolute inset-0 -rotate-90"
          width={RIM}
          height={RIM}
          viewBox={`0 0 ${RIM} ${RIM}`}
        >
          <circle
            cx={RIM / 2}
            cy={RIM / 2}
            r={r}
            fill="none"
            stroke="rgba(255,255,255,0.09)"
            strokeWidth={1.5}
          />
          <motion.circle
            cx={RIM / 2}
            cy={RIM / 2}
            r={r}
            fill="none"
            stroke={scoreColor(clamped)}
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeOpacity={0.75}
            strokeDasharray={circumference}
            initial={{ strokeDashoffset: circumference }}
            animate={{ strokeDashoffset: circumference * (1 - clamped / 100) }}
            transition={reduceMotion ? { duration: 0 } : springs.soft}
          />
        </svg>

        {/* The disc itself — the image slot. */}
        <div
          className="absolute overflow-hidden rounded-full"
          style={{
            inset: (RIM - DISC) / 2,
            backgroundImage: hasImage ? `url(${src})` : FALLBACK_SURFACE,
            backgroundSize: "cover",
            backgroundPosition: "center",
            boxShadow: "inset 0 1px 0 rgba(255,255,255,0.10), 0 24px 60px rgba(0,0,0,0.55)",
          }}
        >
          {!hasImage && (
            <div className="flex h-full w-full items-center justify-center">
              <span
                className="text-[76px] font-bold leading-none text-sage"
                style={{
                  letterSpacing: "-0.05em",
                  textShadow: "0 2px 24px rgba(163,201,168,0.35)",
                }}
              >
                G
              </span>
            </div>
          )}
        </div>
        {/* Curved lettering printed onto the disc, the way the reference
            prints text onto its product. Must come after the disc above:
            it rides a radius *inside* the disc edge, so painted before it
            the disc covers it completely. */}
        <svg
          aria-hidden
          className="absolute inset-0"
          width={RIM}
          height={RIM}
          viewBox={`0 0 ${RIM} ${RIM}`}
          style={{
            transform: `rotate(${RIM_TEXT_ROTATION}deg)`,
            // Keeps the lettering legible once a photo replaces the fallback.
            filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.7))",
          }}
        >
          <defs>
            <path id="hero-rim-path" fill="none" d={rimPath} />
          </defs>
          <text fill="var(--sage)" fillOpacity={0.62} fontSize={8} letterSpacing={2.4} fontWeight={600}>
            <textPath href="#hero-rim-path" startOffset="50%" textAnchor="middle">
              {rimText}
            </textPath>
          </text>
        </svg>

      </motion.div>

      {/* Floating status, in the reference's top-right chip stack. */}
      <div className="absolute right-gutter top-8 flex flex-col items-end gap-2">
        <Chip delay={0.1}>
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-ochre/20 text-ochre">
            <FlameIcon size={13} />
          </span>
          {streak > 0 ? `${streak} day streak` : "No streak yet"}
        </Chip>
        <Chip delay={0.16}>
          <span
            className="h-5 w-5 rounded-full"
            style={{
              background: `conic-gradient(${scoreColor(clamped)} ${goalSweep}deg, rgba(255,255,255,0.10) ${goalSweep}deg)`,
            }}
          />
          {goalsTotal > 0 ? `${goalsMet}/${goalsTotal} goals` : "No goals yet"}
        </Chip>
      </div>
    </div>
  );
}
