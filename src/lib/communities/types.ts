// Plain module: types shared by communities/actions.ts (a "use server" file,
// which may only export async functions — see the Step 5 bugfix note in
// PROGRESS.md) and the client components that build/render a community.

import type { InviteRule } from "@/lib/challenges/actions";
import type { ScoreboardRuleSummary } from "@/lib/challenges/types";
import type { ScoredGoal } from "@/lib/scoring/types";

export type CommunityVisibility = "public" | "private";

export type Community = {
  id: string;
  name: string;
  description: string | null;
  visibility: CommunityVisibility;
  adminId: string;
  templateChallengeId: string | null;
  createdAt: string;
};

// ---------------------------------------------------------------------------
// Discovery, joining, and membership (Community Steps C3 + C4).
// ---------------------------------------------------------------------------

export type CommunityMemberSummary = { userId: string; label: string; role: "admin" | "member" };
export type PendingRequestSummary = { userId: string; label: string };
export type MyCommunityStatus = "admin" | "member" | "requested" | "removed" | "none";

/**
 * The community_detail RPC's own field names/shapes deliberately match
 * InviteRule (challenge_invite_preview) exactly, so this reuses that type
 * instead of redefining an identical one.
 */
export type CommunityDetail =
  | { error: "not_found" }
  | {
      id: string;
      name: string;
      description: string | null;
      visibility: CommunityVisibility;
      adminId: string;
      isAdmin: boolean;
      myStatus: MyCommunityStatus;
      rules: InviteRule[];
      members: CommunityMemberSummary[];
      pendingRequests: PendingRequestSummary[];
    };

// ---------------------------------------------------------------------------
// The leaderboard (Community Step C5). Deliberately just scores, a role, and
// aggregate badge counts — never raw log values — matching
// challenge_scoreboard's own privacy boundary (see step21_leaderboard.sql's
// header comment).
// ---------------------------------------------------------------------------

export type LeaderboardMember = {
  userId: string;
  label: string;
  role: "admin" | "member";
  isCaller: boolean;
  todayLogged: boolean;
  /** True when this member's value for `callerToday` is currently withheld (blind mode, own day not yet logged). */
  todayHidden: boolean;
  total: number;
  perRule: Record<string, ScoredGoal>;
  badges: { late: number; edited: number; flagged: number; suspicious: number };
  trustScore: number;
};

export type LeaderboardResult = {
  communityId: string;
  challengeId: string;
  name: string;
  startDate: string;
  endDate: string;
  blindMode: boolean;
  callerToday: string;
  rules: ScoreboardRuleSummary[];
  /** Ranked by total, highest first. */
  members: LeaderboardMember[];
  /** The mean of every member's total — "the community competes as a unit too" (docs/PLAN-V2.md §6). */
  groupAggregate: number;
};
