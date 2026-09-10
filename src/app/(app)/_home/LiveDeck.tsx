"use client";

// The reference's now-playing card and transport row, re-pointed at the three
// sections the Home screen actually has something to say about: an active
// buddy challenge, a community you are in, and your own trend. One "track"
// shows at a time; prev / next move through them and the big centre control
// opens whichever one is showing.
//
// The deck is a native snap-scroller rather than a hand-rolled drag, so a
// swipe gets the platform's own momentum, rubber-banding and interruptibility
// for free — the transport buttons just drive the same scroll position.

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
import { Surface } from "@/components/ui/Surface";
import { springs } from "@/components/ui/motion";
import { scoreColor } from "@/components/ui/scoreColor";
import { ChevronLeftIcon, ChevronRightIcon } from "@/components/ui/icons";
import { RoundButton } from "./RoundButton";

export type DeckTone = "sage" | "ochre" | "lime" | "clay";

export type DeckTrack = {
  id: string;
  overline: string;
  title: string;
  subtitle: string;
  href: string;
  /** Up to two characters, shown in the round thumbnail. */
  badge: string;
  tone: DeckTone;
  /** 0-100, or null when there is nothing to score yet. */
  you: number | null;
  youLabel: string;
  /** The other side of the bar — an opponent, a group average, or null. */
  them: number | null;
  themLabel: string;
  /** The one-line verdict under the bar. */
  note: string;
};

const TONE_BADGE: Record<DeckTone, string> = {
  sage: "bg-sage/15 text-sage",
  ochre: "bg-ochre/15 text-ochre",
  lime: "bg-lime/15 text-lime",
  clay: "bg-clay/15 text-clay",
};

const TONE_TEXT: Record<DeckTone, string> = {
  sage: "text-sage",
  ochre: "text-ochre",
  lime: "text-lime",
  clay: "text-clay",
};

function TrackCard({ track }: { track: DeckTrack }) {
  const reduceMotion = useReducedMotion();
  const you = track.you;
  const them = track.them;

  return (
    <Surface tier={1} radius="card" className="p-4">
      <div className="flex items-center gap-3">
        <span
          className={`flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-full text-section font-semibold ${TONE_BADGE[track.tone]}`}
          style={{ boxShadow: "var(--shadow-glass-hairline)" }}
          aria-hidden
        >
          {track.badge}
        </span>

        <div className="min-w-0 flex-1">
          <p className={`text-overline uppercase ${TONE_TEXT[track.tone]}`}>{track.overline}</p>
          <p className="mt-0.5 truncate text-body font-medium text-ink">{track.title}</p>
          <p className="truncate text-caption text-ink-muted">{track.subtitle}</p>
        </div>
      </div>

      {/* The scrubber: your fill, with the other side marked on the same
          track so the comparison is one glance rather than two numbers. */}
      <div className="mt-4">
        <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-glass-1">
          {you !== null && (
            <motion.div
              className="h-full rounded-full"
              style={{ backgroundColor: scoreColor(you) }}
              initial={{ width: "0%" }}
              animate={{ width: `${Math.max(0, Math.min(100, you))}%` }}
              transition={reduceMotion ? { duration: 0 } : springs.soft}
            />
          )}
          {them !== null && (
            <span
              aria-hidden
              className="absolute top-0 h-full w-0.5 rounded-full bg-ink/70"
              style={{ left: `calc(${Math.max(0, Math.min(100, them))}% - 1px)` }}
            />
          )}
        </div>

        <div className="mt-2 flex items-baseline justify-between gap-2">
          <span className="text-caption text-ink-muted">{track.youLabel}</span>
          <span className="truncate text-caption text-ink-faint">{track.note}</span>
          <span className="text-caption text-ink-muted">{track.themLabel}</span>
        </div>
      </div>
    </Surface>
  );
}

export function LiveDeck({ tracks }: { tracks: DeckTrack[] }) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);

  const goTo = useCallback((next: number) => {
    const el = scrollerRef.current;
    if (!el) return;
    const count = el.children.length;
    if (count === 0) return;
    // Wraps, so neither control is ever a dead button.
    const target = ((next % count) + count) % count;
    el.scrollTo({ left: target * el.clientWidth, behavior: "smooth" });
  }, []);

  // Position comes from the scroller itself, so a swipe and a button press
  // end up in exactly the same state. Computed straight in the handler rather
  // than deferred to rAF: it is one divide and a round, and `setIndex` bails
  // out when the value is unchanged, so the common case costs nothing — while
  // an rAF hop would leave the dots stale for any scroll that lands while the
  // page isn't being painted.
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const onScroll = () => {
      if (el.clientWidth === 0) return;
      setIndex(Math.round(el.scrollLeft / el.clientWidth));
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  if (tracks.length === 0) return null;

  const current = tracks[Math.min(index, tracks.length - 1)];
  const many = tracks.length > 1;

  return (
    <section aria-label="Your challenges, communities and progress">
      <div className="mb-2.5 flex items-center justify-between px-1">
        <span className="text-overline uppercase text-ink-faint">Live now</span>
        {many && (
          <div className="flex items-center gap-1.5" role="presentation">
            {tracks.map((t, i) => (
              <span
                key={t.id}
                className={`h-1.5 rounded-full transition-all duration-200 ${
                  i === index ? "w-4 bg-sage" : "w-1.5 bg-ink-faint/45"
                }`}
              />
            ))}
          </div>
        )}
      </div>

      <div
        ref={scrollerRef}
        className="flex snap-x snap-mandatory overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        style={{ scrollbarWidth: "none" }}
      >
        {tracks.map((track) => (
          <div key={track.id} className="w-full shrink-0 snap-center">
            <Link href={track.href} className="block">
              <TrackCard track={track} />
            </Link>
          </div>
        ))}
      </div>

      {/* Transport. The centre control opens whatever is showing. */}
      <div className="mt-3.5 flex items-center justify-center gap-5">
        {many && (
          <RoundButton label="Previous" size={46} tone="muted" onClick={() => goTo(index - 1)}>
            <ChevronLeftIcon size={20} />
          </RoundButton>
        )}

        <RoundButton href={current.href} label={`Open ${current.title}`} size={66} emphasis>
          <ChevronRightIcon size={26} />
        </RoundButton>

        {many && (
          <RoundButton label="Next" size={46} tone="muted" onClick={() => goTo(index + 1)}>
            <ChevronRightIcon size={20} />
          </RoundButton>
        )}
      </div>
    </section>
  );
}
