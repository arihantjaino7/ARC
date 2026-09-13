"use client";

import Link from "next/link";
import { useState } from "react";
import { LeftDrawer } from "@/components/ui/LeftDrawer";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/Screen";
import { UserIcon } from "@/components/ui/icons";
import {
  cancelFriendRequest,
  respondToFriendRequest,
} from "@/lib/friends/actions";
import { SendInviteForm } from "./SendInviteForm";
import type { FriendRequest } from "@/lib/friends/types";

type Props = {
  userId: string | undefined;
  incoming: FriendRequest[];
  outgoing: FriendRequest[];
  friends: FriendRequest[];
};

export function FriendsDrawer({ userId, incoming, outgoing, friends }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Friends"
        className="flex items-center gap-1.5 rounded-full border border-glass-1-border bg-glass-1 px-3 py-1.5 text-caption font-medium text-ink transition-colors hover:bg-glass-2"
      >
        <UserIcon size={15} />
        Friends
      </button>

      <LeftDrawer open={open} onClose={() => setOpen(false)} title="Friends">
        <div className="space-y-6">
          {incoming.length === 0 && outgoing.length === 0 && friends.length === 0 && (
            <p className="text-body text-ink-muted">
              No friends yet. Invite someone below — once they accept, you can start a challenge.
            </p>
          )}

          {incoming.length > 0 && (
            <section>
              <h3 className="text-overline text-ink-faint mb-2">Waiting on you</h3>
              <ul className="space-y-2">
                {incoming.map((req) => (
                  <li key={req.id}>
                    <Card className="flex items-center justify-between gap-3 p-3">
                      <span className="min-w-0 truncate text-body text-ink">{req.requesterEmail}</span>
                      <div className="flex shrink-0 gap-3">
                        <form action={respondToFriendRequest.bind(null, req.id, "accepted")}>
                          <button type="submit" className="text-caption font-medium text-sage underline underline-offset-2">
                            Accept
                          </button>
                        </form>
                        <form action={respondToFriendRequest.bind(null, req.id, "declined")}>
                          <button type="submit" className="text-caption text-clay underline underline-offset-2">
                            Decline
                          </button>
                        </form>
                      </div>
                    </Card>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {friends.length > 0 && (
            <section>
              <h3 className="text-overline text-ink-faint mb-2">Your friends</h3>
              <ul className="space-y-2">
                {friends.map((f) => {
                  const email = f.requesterId === userId ? f.addresseeEmail : f.requesterEmail;
                  const otherId = f.requesterId === userId ? f.addresseeId : f.requesterId;
                  return (
                    <li key={f.id}>
                      <Card className="flex items-center justify-between gap-3 p-3">
                        {otherId ? (
                          <Link
                            href={`/buddies/${otherId}`}
                            onClick={() => setOpen(false)}
                            className="min-w-0 truncate text-body font-medium text-ink underline underline-offset-2"
                          >
                            {email}
                          </Link>
                        ) : (
                          <p className="min-w-0 truncate text-body font-medium text-ink">{email}</p>
                        )}
                        <Link
                          href={otherId ? `/buddies/new?buddy=${otherId}` : "/buddies/new"}
                          onClick={() => setOpen(false)}
                          className="shrink-0"
                        >
                          <Button variant="glass" size="sm">Challenge</Button>
                        </Link>
                      </Card>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {outgoing.length > 0 && (
            <section>
              <h3 className="text-overline text-ink-faint mb-2">Sent</h3>
              <ul className="space-y-2">
                {outgoing.map((req) => (
                  <li key={req.id}>
                    <Card className="flex items-center justify-between gap-3 p-3">
                      <span className="min-w-0 truncate text-body text-ink">{req.addresseeEmail}</span>
                      <form action={cancelFriendRequest.bind(null, req.id)}>
                        <button type="submit" className="shrink-0 text-caption text-clay underline underline-offset-2">
                          Cancel
                        </button>
                      </form>
                    </Card>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="border-t border-glass-1-border pt-5">
            <h3 className="text-overline text-ink-faint mb-1">Invite a friend</h3>
            <p className="mb-3 text-caption text-ink-muted">
              They need an account — invites go by email.
            </p>
            <SendInviteForm />
          </section>
        </div>
      </LeftDrawer>
    </>
  );
}
