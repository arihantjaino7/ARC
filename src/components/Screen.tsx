"use client";

// The shared frame every tab screen sits in — rebuilt on the ui/ primitives
// (docs/PLAN-DESIGN.md §2.3). Keeps its original props (`title`, `subtitle`,
// `back`, `action`, `children`) so no page using it needs to change.

import Link from "next/link";
import { motion, useReducedMotion, useScroll, useTransform } from "motion/react";
import { Surface } from "@/components/ui/Surface";
import { ChevronLeftIcon } from "@/components/ui/icons";

const COLLAPSE_DISTANCE = 56;

export function Screen({
  title,
  subtitle,
  back,
  action,
  children,
}: {
  title: string;
  subtitle?: string;
  back?: { href: string; label: string };
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  const reduceMotion = useReducedMotion();
  const { scrollY } = useScroll();
  const collapsedOpacity = useTransform(scrollY, [0, COLLAPSE_DISTANCE], [0, 1]);
  const fullOpacity = useTransform(scrollY, [0, COLLAPSE_DISTANCE * 0.7], [1, 0]);
  const collapsedPointerEvents = useTransform(scrollY, (v) =>
    v > COLLAPSE_DISTANCE * 0.6 ? "auto" : "none",
  );

  return (
    <div className="relative mx-auto w-full max-w-md">
      {/* Sticky collapsed header — title shrinks into this glass-3 bar as you
          scroll past the full title below. */}
      <motion.div
        className="sticky top-0 z-10"
        style={
          reduceMotion
            ? undefined
            : { opacity: collapsedOpacity, pointerEvents: collapsedPointerEvents }
        }
      >
        <Surface
          tier={3}
          radius="none"
          className="flex items-center gap-3 px-gutter py-3"
        >
          {back && (
            <Link
              href={back.href}
              aria-label={back.label}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-ink-muted"
            >
              <ChevronLeftIcon size={20} />
            </Link>
          )}
          <span className="min-w-0 flex-1 truncate text-section text-ink">{title}</span>
          {action}
        </Surface>
      </motion.div>

      <div className="px-gutter pt-6">
        {back && (
          <Link
            href={back.href}
            className="inline-flex items-center gap-1 text-body text-ink-muted"
          >
            <ChevronLeftIcon size={18} />
            {back.label}
          </Link>
        )}

        <motion.div
          className={`flex items-start justify-between gap-3 ${back ? "mt-3" : ""}`}
          style={reduceMotion ? undefined : { opacity: fullOpacity }}
        >
          <div className="min-w-0">
            <h1 className="text-title text-ink break-words">{title}</h1>
            {subtitle && <p className="mt-1 text-body text-ink-muted">{subtitle}</p>}
          </div>
          {action}
        </motion.div>

        <div className="mt-6 pb-2">{children}</div>
      </div>
    </div>
  );
}

/** A resting glass card — the app's one card style, used everywhere. */
export function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Surface tier={1} radius="card" className={`p-4 ${className}`}>
      {children}
    </Surface>
  );
}

/** The "nothing here yet" state, with a single call to action. */
export function EmptyState({
  title,
  body,
  cta,
}: {
  title: string;
  body: string;
  cta?: React.ReactNode;
}) {
  return (
    <Surface tier={1} radius="card" className="border-dashed! px-5 py-10 text-center">
      <p className="text-section text-ink">{title}</p>
      <p className="mx-auto mt-1.5 max-w-xs text-body text-ink-muted">{body}</p>
      {cta && <div className="mt-5 flex justify-center gap-2">{cta}</div>}
    </Surface>
  );
}
