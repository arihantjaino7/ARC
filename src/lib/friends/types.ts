export type FriendRequestStatus = "pending" | "accepted" | "declined";

export type FriendRequest = {
  id: string;
  requesterId: string;
  requesterEmail: string;
  addresseeEmail: string;
  addresseeId: string | null;
  status: FriendRequestStatus;
  createdAt: string;
};
