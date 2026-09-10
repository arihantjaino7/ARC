"use client";

// The floating glass pill — docs/PLAN-DESIGN.md §2.2. Inset 16px from the
// sides, 12px above the safe-area inset, radius 28, glass-3, a sage indicator
// that slides between tabs via `layoutId`. Labels stay always-visible (the
// plan is explicit: labels-on-active-only is a fashion, not usability).

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, useReducedMotion } from "motion/react";
import { Surface } from "@/components/ui/Surface";
import { springs } from "@/components/ui/motion";
import {
  BuddiesIcon,
  CommunityIcon,
  HomeIcon,
  ProgressIcon,
  SettingsIcon,
  type IconProps,
} from "@/components/ui/icons";
import type { ComponentType } from "react";

const TABS = [
  { href: "/buddies", label: "Buddies", icon: BuddiesIcon },
  { href: "/community", label: "Community", icon: CommunityIcon },
  { href: "/", label: "Home", icon: HomeIcon },
  { href: "/progress", label: "Progress", icon: ProgressIcon },
  { href: "/settings", label: "Settings", icon: SettingsIcon },
] as const satisfies readonly { href: string; label: string; icon: ComponentType<IconProps> }[];

function isActive(pathname: string, href: string): boolean {
  // Segment-aware, for the same reason src/proxy.ts is: "/" is a prefix of
  // everything, and "/log" is a string prefix of "/login".
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

type UnreadSections = { buddies?: boolean; community?: boolean };

const UNREAD_HREF: Record<string, keyof UnreadSections> = {
  "/buddies": "buddies",
  "/community": "community",
};

export function TabBar({ unread = {} }: { unread?: UnreadSections }) {
  const pathname = usePathname();
  const reduceMotion = useReducedMotion();

  return (
    <nav
      aria-label="Sections"
      className="fixed inset-x-4 z-30"
      style={{ bottom: "calc(env(safe-area-inset-bottom) + 12px)" }}
    >
      <Surface
        as="ul"
        tier={3}
        radius="none"
        className="mx-auto flex max-w-md list-none rounded-[28px] p-1.5"
      >
        {TABS.map(({ href, label, icon: Icon }) => {
          const active = isActive(pathname, href);
          return (
            <li key={href} className="relative flex-1">
              {active && (
                <motion.div
                  layoutId="tab-indicator"
                  className="absolute inset-0 rounded-[22px] bg-sage/15"
                  transition={reduceMotion ? { duration: 0 } : springs.snappy}
                />
              )}
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={`relative flex flex-col items-center gap-1 rounded-[22px] py-2.5 text-caption font-medium transition-colors ${
                  active ? "text-sage" : "text-ink-faint"
                }`}
              >
                <motion.span
                  className="relative flex"
                  animate={{ scale: reduceMotion ? 1 : active ? 1.08 : 1 }}
                  transition={springs.snappy}
                >
                  <Icon size={22} />
                  {/* The dot lives on whichever tab the notification's own
                      payload points at (Buddies for change_*, Community for
                      community_join_*) — see getUnreadSections. */}
                  {UNREAD_HREF[href] && unread[UNREAD_HREF[href]] && (
                    <span
                      aria-label="Unread"
                      className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-sage"
                      style={{ boxShadow: "0 0 6px 2px rgba(163, 201, 168, 0.55)" }}
                    />
                  )}
                </motion.span>
                {label}
              </Link>
            </li>
          );
        })}
      </Surface>
    </nav>
  );
}
