"use client";

// The other half of the leaderboard row's shared-element morph
// (src/app/(app)/community/[id]/Leaderboard.tsx's LeaderboardRow carries the
// first half) — same `member-${communityId}-${userId}` layoutId, so this
// header block physically morphs from wherever the row sat on the
// leaderboard when the route transitions here.

import { motion, useReducedMotion } from "motion/react";
import type { LeaderboardMember } from "@/lib/communities/types";

export function MemberHeader({
  communityId,
  member,
}: {
  communityId: string;
  member: LeaderboardMember;
}) {
  const reduceMotion = useReducedMotion();

  return (
    <motion.div
      layoutId={`member-${communityId}-${member.userId}`}
      transition={reduceMotion ? { duration: 0 } : undefined}
      className="flex items-center justify-between gap-3"
    >
      <span className="min-w-0 truncate text-body font-medium text-ink">
        {member.isCaller ? "You" : member.label}
      </span>
      <span className="shrink-0 text-title text-ink">{member.todayHidden ? "🔒" : member.total}</span>
    </motion.div>
  );
}
