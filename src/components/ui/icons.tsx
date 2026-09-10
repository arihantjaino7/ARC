// One stroke language for the whole app: 1.6px stroke, round caps/joins,
// 24px box. Replaces the five inconsistent inline SVGs in TabBar.tsx (mixed
// weights, mixed corner treatment) plus a handful more the rest of the design
// pass needs. All inherit `currentColor` — no fill color wiring required.

import type { SVGProps } from "react";

export type IconProps = SVGProps<SVGSVGElement> & {
  size?: number;
};

function baseProps({ size = 24, ...rest }: IconProps) {
  return {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.6,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
    ...rest,
  };
}

export function HomeIcon(props: IconProps) {
  return (
    <svg {...baseProps(props)}>
      <path d="M3.5 10.2 12 3.5l8.5 6.7v9.3a1 1 0 0 1-1 1h-15a1 1 0 0 1-1-1z" />
      <path d="M9.5 20.5v-6h5v6" />
    </svg>
  );
}

export function BuddiesIcon(props: IconProps) {
  return (
    <svg {...baseProps(props)}>
      <circle cx="8.5" cy="8" r="3.25" />
      <circle cx="17" cy="9.5" r="2.5" />
      <path d="M2.5 19.5a6 6 0 0 1 12 0" />
      <path d="M15 15.2a5 5 0 0 1 6.5 4.3" />
    </svg>
  );
}

export function CommunityIcon(props: IconProps) {
  return (
    <svg {...baseProps(props)}>
      <circle cx="12" cy="6" r="2.6" />
      <circle cx="5.5" cy="16.5" r="2.6" />
      <circle cx="18.5" cy="16.5" r="2.6" />
      <path d="M10.2 7.7 7.3 14.3M13.8 7.7l2.9 6.6M8.1 16.5h7.8" />
    </svg>
  );
}

export function ProgressIcon(props: IconProps) {
  return (
    <svg {...baseProps(props)}>
      <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
    </svg>
  );
}

export function SettingsIcon(props: IconProps) {
  return (
    <svg {...baseProps(props)}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2.5v2.2M12 19.3v2.2M21.5 12h-2.2M4.7 12H2.5M18.7 5.3l-1.6 1.6M6.9 17.1l-1.6 1.6M18.7 18.7l-1.6-1.6M6.9 6.9 5.3 5.3" />
    </svg>
  );
}

export function LogIcon(props: IconProps) {
  return (
    <svg {...baseProps(props)}>
      <path d="M6 3.5h9l3 3v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-16a1 1 0 0 1 1-1z" />
      <path d="M15 3.5v3h3M8.5 12h7M8.5 15.5h7M8.5 8.5h3" />
    </svg>
  );
}

export function GoalIcon(props: IconProps) {
  return (
    <svg {...baseProps(props)}>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="4.5" />
      <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function FlameIcon(props: IconProps) {
  return (
    <svg {...baseProps(props)}>
      <path d="M12 2.5c1 3 3.5 4.5 3.5 8a3.5 3.5 0 0 1-7 0c0-1.2.5-2 1-2.7.3.9 1 1.4 1.5 1.4.9 0 .3-1.5.3-2.8C11.3 4.8 12 3.5 12 2.5z" />
      <path d="M8.2 12.8a5.8 5.8 0 0 0 11.3 2c0-2.6-1.2-4-2.2-5.4" />
    </svg>
  );
}

export function TrophyIcon(props: IconProps) {
  return (
    <svg {...baseProps(props)}>
      <path d="M7 3.5h10v5a5 5 0 0 1-10 0z" />
      <path d="M7 5H4v1.5A3.5 3.5 0 0 0 7.5 10M17 5h3v1.5A3.5 3.5 0 0 1 16.5 10" />
      <path d="M12 13.5v3.5M9 20.5h6M8.5 20.5v-2a3.5 3.5 0 0 1 7 0v2" />
    </svg>
  );
}

export function CheckIcon(props: IconProps) {
  return (
    <svg {...baseProps(props)}>
      <path d="M4.5 12.5 9.5 17.5 19.5 6.5" />
    </svg>
  );
}

export function CloseIcon(props: IconProps) {
  return (
    <svg {...baseProps(props)}>
      <path d="M5.5 5.5 18.5 18.5M18.5 5.5 5.5 18.5" />
    </svg>
  );
}

export function ChevronLeftIcon(props: IconProps) {
  return (
    <svg {...baseProps(props)}>
      <path d="M15 4.5 7.5 12l7.5 7.5" />
    </svg>
  );
}

export function ChevronRightIcon(props: IconProps) {
  return (
    <svg {...baseProps(props)}>
      <path d="M9 4.5 16.5 12 9 19.5" />
    </svg>
  );
}

export function PlusIcon(props: IconProps) {
  return (
    <svg {...baseProps(props)}>
      <path d="M12 4.5v15M4.5 12h15" />
    </svg>
  );
}

export function LinkIcon(props: IconProps) {
  return (
    <svg {...baseProps(props)}>
      <path d="M9.5 14.5 14.5 9.5" />
      <path d="M11 6.5 12.8 4.7a3.5 3.5 0 0 1 5 5L15.8 11.5" />
      <path d="M13 17.5l-1.8 1.8a3.5 3.5 0 0 1-5-5l2-2" />
    </svg>
  );
}

export function BellIcon(props: IconProps) {
  return (
    <svg {...baseProps(props)}>
      <path d="M6 10a6 6 0 0 1 12 0c0 4 1.5 5.5 1.5 5.5h-15S6 14 6 10z" />
      <path d="M9.8 19a2.3 2.3 0 0 0 4.4 0" />
    </svg>
  );
}

export function ClockIcon(props: IconProps) {
  return (
    <svg {...baseProps(props)}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </svg>
  );
}

export function FlagIcon(props: IconProps) {
  return (
    <svg {...baseProps(props)}>
      <path d="M6 3.5v17" />
      <path d="M6 4.5h9.5l-2 3.5 2 3.5H6" />
    </svg>
  );
}

export function LockIcon(props: IconProps) {
  return (
    <svg {...baseProps(props)}>
      <rect x="5.5" y="10.5" width="13" height="9.5" rx="2" />
      <path d="M8.5 10.5V7.5a3.5 3.5 0 0 1 7 0v3" />
    </svg>
  );
}

export function EyeOffIcon(props: IconProps) {
  return (
    <svg {...baseProps(props)}>
      <path d="M4 4.5 20 19.5" />
      <path d="M10.6 6.4A9.9 9.9 0 0 1 12 6.3c5 0 8.5 3.7 9.5 5.7-.5 1-1.6 2.5-3.2 3.8M6.3 8.2C4.6 9.5 3.4 11 3 12c1 2 4.5 5.7 9 5.7 1.1 0 2.2-.2 3.1-.6" />
      <path d="M9.9 12a2.1 2.1 0 0 0 3 2.9" />
    </svg>
  );
}

export function DotsIcon(props: IconProps) {
  return (
    <svg {...baseProps(props)} fill="currentColor" strokeWidth={0}>
      <circle cx="5" cy="12" r="1.4" />
      <circle cx="12" cy="12" r="1.4" />
      <circle cx="19" cy="12" r="1.4" />
    </svg>
  );
}

export function UserIcon(props: IconProps) {
  return (
    <svg {...baseProps(props)}>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M4.5 20.5a7.5 7.5 0 0 1 15 0" />
    </svg>
  );
}
