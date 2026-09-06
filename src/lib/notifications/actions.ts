"use server";

// Reads/writes for the notifications inbox. The rows themselves are only ever
// written by the security-definer RPCs in supabase/step15_change_requests.sql
// (propose_challenge_change / respond_challenge_change) — nothing here
// inserts a notification, only reads and marks-read, both of which the
// table's own "own rows only" RLS already covers.

import { createClient } from "@/lib/supabase/server";
import { COMMUNITY_NOTIFICATION_KINDS, type Notification, type NotificationKind } from "./types";

function toNotification(row: Record<string, unknown>): Notification {
  return {
    id: row.id as string,
    kind: row.kind as Notification["kind"],
    payload: (row.payload as Notification["payload"]) ?? {},
    readAt: (row.read_at as string | null) ?? null,
    createdAt: row.created_at as string,
  };
}

/** The current user's most recent notifications, newest first. */
export async function getNotifications(limit = 20): Promise<Notification[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data } = await supabase
    .from("notifications")
    .select("id, kind, payload, read_at, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);

  return (data ?? []).map(toNotification);
}

/** How many unread notifications the current user has — drives the tab bar's dot. */
export async function getUnreadCount(): Promise<number> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return 0;

  const { count } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .is("read_at", null);

  return count ?? 0;
}

/**
 * Which of the tab bar's sections have an unread notification — every
 * notification kind so far belongs to exactly one of Buddies (change_*) or
 * Community (community_join_*), so the dot moves to whichever tab the
 * notification is actually about instead of always sitting on Buddies.
 */
export async function getUnreadSections(): Promise<{ buddies: boolean; community: boolean }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { buddies: false, community: false };

  const { data } = await supabase.from("notifications").select("kind").is("read_at", null);
  const kinds = (data ?? []).map((r) => r.kind as NotificationKind);
  const isCommunity = (k: NotificationKind) => (COMMUNITY_NOTIFICATION_KINDS as string[]).includes(k);

  return {
    buddies: kinds.some((k) => !isCommunity(k)),
    community: kinds.some(isCommunity),
  };
}

export async function markNotificationRead(id: string): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", id);
}

/** Marks every unread notification about one challenge as read — called when its screen is opened. */
export async function markChallengeNotificationsRead(challengeId: string): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .is("read_at", null)
    .eq("payload->>challengeId", challengeId);
}

/** Marks every unread notification about one community as read — called when its screen is opened. */
export async function markCommunityNotificationsRead(communityId: string): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .is("read_at", null)
    .eq("payload->>communityId", communityId);
}
