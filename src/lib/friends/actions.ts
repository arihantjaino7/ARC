"use server";

import { createClient } from "@/lib/supabase/server";
import type { FriendRequest, FriendRequestStatus } from "./types";

export type FriendState = {
  error?: string;
  message?: string;
};

type FriendRequestRow = {
  id: string;
  requester_id: string;
  requester_email: string;
  addressee_email: string;
  addressee_id: string | null;
  status: FriendRequestStatus;
  created_at: string;
};

function toFriendRequest(row: FriendRequestRow): FriendRequest {
  return {
    id: row.id,
    requesterId: row.requester_id,
    requesterEmail: row.requester_email,
    addresseeEmail: row.addressee_email,
    addresseeId: row.addressee_id,
    status: row.status,
    createdAt: row.created_at,
  };
}

export type FriendData = {
  incoming: FriendRequest[];
  outgoing: FriendRequest[];
  friends: FriendRequest[];
};

const EMPTY_FRIEND_DATA: FriendData = { incoming: [], outgoing: [], friends: [] };

export async function getFriendData(): Promise<FriendData> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !user.email) return EMPTY_FRIEND_DATA;

  const { data } = await supabase
    .from("friend_requests")
    .select(
      "id, requester_id, requester_email, addressee_email, addressee_id, status, created_at",
    )
    .order("created_at", { ascending: false });

  const rows = (data ?? []).map(toFriendRequest);
  const email = user.email.toLowerCase();

  return {
    incoming: rows.filter(
      (r) => r.status === "pending" && r.addresseeEmail.toLowerCase() === email,
    ),
    outgoing: rows.filter((r) => r.status === "pending" && r.requesterId === user.id),
    friends: rows.filter((r) => r.status === "accepted"),
  };
}

export async function sendFriendRequest(
  _prevState: FriendState,
  formData: FormData,
): Promise<FriendState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !user.email) {
    return { error: "You're not logged in." };
  }

  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();

  if (!email || !email.includes("@")) {
    return { error: "Enter a valid email." };
  }
  if (email === user.email.toLowerCase()) {
    return { error: "You can't friend yourself." };
  }

  const { error } = await supabase.from("friend_requests").insert({
    requester_id: user.id,
    requester_email: user.email,
    addressee_email: email,
  });

  if (error) {
    if (error.code === "23505") {
      return { error: "You already have a pending invite to that email." };
    }
    return { error: error.message };
  }

  return { message: "Invite sent." };
}

export async function respondToFriendRequest(
  id: string,
  status: "accepted" | "declined",
): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return;

  await supabase
    .from("friend_requests")
    .update({ status, addressee_id: user.id, responded_at: new Date().toISOString() })
    .eq("id", id);
}

export async function cancelFriendRequest(id: string): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return;

  await supabase.from("friend_requests").delete().eq("id", id).eq("requester_id", user.id);
}
