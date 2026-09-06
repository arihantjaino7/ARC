"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// The five sections, in the order the spec asks for them:
// Buddies | Community | Home (centre) | Progress | Settings.
const TABS = [
  { href: "/buddies", label: "Buddies", icon: BuddiesIcon },
  { href: "/community", label: "Community", icon: CommunityIcon },
  { href: "/", label: "Home", icon: HomeIcon },
  { href: "/progress", label: "Progress", icon: ProgressIcon },
  { href: "/settings", label: "Settings", icon: SettingsIcon },
] as const;

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

  return (
    <nav
      aria-label="Sections"
      className="sticky bottom-0 z-20 border-t border-zinc-200 bg-white/90 backdrop-blur dark:border-zinc-800 dark:bg-black/90"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="mx-auto flex max-w-md">
        {TABS.map(({ href, label, icon: Icon }) => {
          const active = isActive(pathname, href);
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={`relative flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition-colors ${
                  active
                    ? "text-black dark:text-zinc-50"
                    : "text-zinc-400 hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300"
                }`}
              >
                <span className="relative">
                  <Icon active={active} />
                  {/* The dot lives on whichever tab the notification's own
                      payload points at (Buddies for change_*, Community for
                      community_join_*) — see getUnreadSections. */}
                  {UNREAD_HREF[href] && unread[UNREAD_HREF[href]] && (
                    <span
                      aria-label="Unread"
                      className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-red-500"
                    />
                  )}
                </span>
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

// Inline SVGs rather than an icon package — five icons isn't worth a dependency,
// and these inherit currentColor so the active state needs no extra wiring.

type IconProps = { active: boolean };

function svgProps(active: boolean) {
  return {
    width: 22,
    height: 22,
    viewBox: "0 0 24 24",
    fill: active ? "currentColor" : "none",
    stroke: "currentColor",
    strokeWidth: active ? 1.5 : 1.75,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
}

function BuddiesIcon({ active }: IconProps) {
  return (
    <svg {...svgProps(active)}>
      <circle cx="8.5" cy="8" r="3.25" />
      <circle cx="17" cy="9.5" r="2.5" />
      <path d="M2.5 19.5a6 6 0 0 1 12 0" />
      <path d="M15 15.2a5 5 0 0 1 6.5 4.3" />
    </svg>
  );
}

function CommunityIcon({ active }: IconProps) {
  return (
    <svg {...svgProps(active)}>
      <circle cx="12" cy="6" r="2.6" />
      <circle cx="5.5" cy="16.5" r="2.6" />
      <circle cx="18.5" cy="16.5" r="2.6" />
      <path d="M10.2 7.7 7.3 14.3M13.8 7.7l2.9 6.6M8.1 16.5h7.8" />
    </svg>
  );
}

function HomeIcon({ active }: IconProps) {
  return (
    <svg {...svgProps(active)}>
      <path d="M3.5 10.2 12 3.5l8.5 6.7v9.3a1 1 0 0 1-1 1h-15a1 1 0 0 1-1-1z" />
      {!active && <path d="M9.5 20.5v-6h5v6" />}
    </svg>
  );
}

function ProgressIcon({ active }: IconProps) {
  return (
    <svg {...svgProps(active)} fill="none">
      <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
    </svg>
  );
}

function SettingsIcon({ active }: IconProps) {
  return (
    <svg {...svgProps(active)} fill="none">
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2.5v2.2M12 19.3v2.2M21.5 12h-2.2M4.7 12H2.5M18.7 5.3l-1.6 1.6M6.9 17.1l-1.6 1.6M18.7 18.7l-1.6-1.6M6.9 6.9 5.3 5.3" />
    </svg>
  );
}
