import Link from "next/link";
import { Card, EmptyState, Screen } from "@/components/Screen";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { createClient } from "@/lib/supabase/server";
import {
  cancelFriendRequest,
  getFriendData,
  respondToFriendRequest,
} from "@/lib/friends/actions";
import { getMyChallengesByBuddy, getPendingChangeCounts, getStakeLedger } from "@/lib/challenges/actions";
import { SendInviteForm } from "./SendInviteForm";
import { StakeLedger } from "./StakeLedger";

const STATUS_LABEL: Record<string, string> = {
  pending: "Waiting to be accepted",
  active: "Active",
  completed: "Completed",
  cancelled: "Cancelled",
};

export default async function BuddiesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ incoming, outgoing, friends }, challengesByBuddy, pendingChanges, stakeLedger] = await Promise.all([
    getFriendData(),
    getMyChallengesByBuddy(),
    getPendingChangeCounts(),
    getStakeLedger(),
  ]);
  const hasAnything = friends.length + incoming.length + outgoing.length > 0;

  return (
    <Screen
      title="Buddies"
      subtitle="One-on-one challenges. Just you and them."
      action={
        <Link href="/buddies/new">
          <Button size="sm">New challenge</Button>
        </Link>
      }
    >
      {!hasAnything && (
        <EmptyState
          title="No buddies yet"
          body="Invite someone you'll actually compete with. You set the challenge, they accept it, and you're both scored on your own targets."
          cta={
            <Link href="/buddies/new">
              <Button>Start a challenge with a link</Button>
            </Link>
          }
        />
      )}

      {incoming.length > 0 && (
        <section className="mt-6">
          <h2 className="text-section text-ink">Waiting on you</h2>
          <ul className="mt-2 space-y-2">
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
        <section className="mt-6">
          <h2 className="text-section text-ink">Your buddies</h2>
          <ul className="mt-2 space-y-2">
            {friends.map((f) => {
              const email =
                f.requesterId === user?.id ? f.addresseeEmail : f.requesterEmail;
              const otherId = f.requesterId === user?.id ? f.addresseeId : f.requesterId;
              const challenges = (otherId && challengesByBuddy[otherId]) || [];
              return (
                <li key={f.id}>
                  <Card className="space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      {otherId ? (
                        <Link
                          href={`/buddies/${otherId}`}
                          className="min-w-0 truncate text-body font-medium text-ink underline underline-offset-2"
                        >
                          {email}
                        </Link>
                      ) : (
                        <p className="min-w-0 truncate text-body font-medium text-ink">{email}</p>
                      )}
                      <Link href={otherId ? `/buddies/new?buddy=${otherId}` : "/buddies/new"} className="shrink-0">
                        <Button variant="glass" size="sm">
                          Start a challenge
                        </Button>
                      </Link>
                    </div>
                    {challenges.length > 0 ? (
                      <ul className="space-y-1.5">
                        {challenges.map((c) => (
                          <li key={c.id} className="flex items-center justify-between gap-2 text-caption text-ink-muted">
                            <span className="min-w-0 truncate text-ink">{c.name}</span>
                            <span className="flex shrink-0 items-center gap-1.5">
                              {(pendingChanges[c.id] ?? 0) > 0 && (
                                <Chip tone="clay">
                                  {pendingChanges[c.id]} change{pendingChanges[c.id] > 1 ? "s" : ""}
                                </Chip>
                              )}
                              {STATUS_LABEL[c.status] ?? c.status}
                            </span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-caption text-ink-muted">No challenge running yet</p>
                    )}
                  </Card>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {outgoing.length > 0 && (
        <section className="mt-6">
          <h2 className="text-section text-ink">Sent</h2>
          <ul className="mt-2 space-y-2">
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

      <StakeLedger entries={stakeLedger} />

      <section className="mt-8 border-t border-glass-1-border pt-6">
        <h2 className="text-section text-ink">Invite a buddy</h2>
        <p className="mt-1 text-caption text-ink-muted">
          They need an account already &mdash; invites go by email. Invite links
          arrive with the challenge builder.
        </p>
        <div className="mt-3">
          <SendInviteForm />
        </div>
      </section>
    </Screen>
  );
}
