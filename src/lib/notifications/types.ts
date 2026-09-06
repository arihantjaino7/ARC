// Plain types for the generic notifications inbox (docs/PLAN-V2.md §2, V2 Step
// 10). Kept out of actions.ts for the usual reason: a "use server" file may
// only export async functions.

export type NotificationKind =
  | "change_proposed"
  | "change_approved"
  | "change_rejected"
  | "community_join_requested"
  | "community_join_approved"
  | "community_join_declined";

/** change_proposed/change_approved/change_rejected are always about a buddy challenge (V2 Step 10). */
export const BUDDY_NOTIFICATION_KINDS: NotificationKind[] = ["change_proposed", "change_approved", "change_rejected"];
/** community_join_* are always about a community (Community Step C4). */
export const COMMUNITY_NOTIFICATION_KINDS: NotificationKind[] = [
  "community_join_requested",
  "community_join_approved",
  "community_join_declined",
];

export type Notification = {
  id: string;
  kind: NotificationKind;
  payload: {
    requestId?: string;
    challengeId?: string;
    challengeName?: string;
    communityId?: string;
    communityName?: string;
    requesterId?: string;
    kind?: string;
    effectiveFrom?: string;
  };
  readAt: string | null;
  createdAt: string;
};
