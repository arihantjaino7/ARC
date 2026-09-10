// The three glass tiers from docs/PLAN-DESIGN.md §1.2.
//
// Blur budget, non-negotiable: at most two live `backdrop-filter` layers on
// screen at once. `glass-1` has no blur at all (a pre-composited translucent
// fill) — real blur is reserved for `glass-3` (tab bar, sheets, sticky
// headers — always at most one of those open) plus whichever `glass-2` raised
// surface is active. This module can't enforce that budget across a whole
// screen by itself; it just keeps each tier honest about its own cost.

import type { ElementType, ComponentPropsWithoutRef } from "react";

export type GlassTier = 1 | 2 | 3;

const TIER_CLASS: Record<GlassTier, string> = {
  1: "bg-glass-1 border border-glass-1-border",
  2: "bg-glass-2 border border-glass-2-border backdrop-blur-[20px]",
  3: "bg-glass-3 border border-glass-3-border backdrop-blur-[40px] backdrop-saturate-[1.6]",
};

const RADIUS_CLASS = {
  chip: "rounded-chip",
  row: "rounded-row",
  card: "rounded-card",
  hero: "rounded-hero",
  none: "",
} as const;

type SurfaceProps<T extends ElementType> = {
  as?: T;
  tier?: GlassTier;
  radius?: keyof typeof RADIUS_CLASS;
  /** Adds the 1px top inner highlight every glass surface gets — §1.2. */
  hairline?: boolean;
  className?: string;
} & Omit<ComponentPropsWithoutRef<T>, "as" | "className">;

export function Surface<T extends ElementType = "div">({
  as,
  tier = 1,
  radius = "card",
  hairline = true,
  className = "",
  style,
  ...rest
}: SurfaceProps<T>) {
  const Tag = (as ?? "div") as ElementType;
  return (
    <Tag
      className={`${TIER_CLASS[tier]} ${RADIUS_CLASS[radius]} ${className}`}
      style={hairline ? { boxShadow: "var(--shadow-glass-hairline)", ...style } : style}
      {...rest}
    />
  );
}
