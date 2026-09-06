import Link from "next/link";
import { Card, EmptyState, Screen } from "@/components/Screen";
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
        <Link
          href="/buddies/new"
          className="shrink-0 rounded-md bg-black px-3 py-1.5 text-xs font-medium text-white dark:bg-white dark:text-black"
        >
          New challenge
        </Link>
      }
    >
      {!hasAnything && (
        <EmptyState
          title="No buddies yet"
          body="Invite someone you'll actually compete with. You set the challenge, they accept it, and you're both scored on your own targets."
          cta={
            <Link
              href="/buddies/new"
              className="rounded-md bg-black px-3 py-2 text-sm font-medium text-white dark:bg-white dark:text-black"
            >
              Start a challenge with a link
            </Link>
          }
        />
      )}

      {incoming.length > 0 && (
        <section className="mt-6">
          <h2 className="text-sm font-semibold text-black dark:text-zinc-50">
            Waiting on you
          </h2>
          <ul className="mt-2 space-y-2">
            {incoming.map((req) => (
              <li
                key={req.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-zinc-200 px-3 py-2.5 dark:border-zinc-800"
              >
                <span className="min-w-0 truncate text-sm text-black dark:text-zinc-50">
                  {req.requesterEmail}
                </span>
                <div className="flex shrink-0 gap-3">
                  <form action={respondToFriendRequest.bind(null, req.id, "accepted")}>
                    <button
                      type="submit"
                      className="text-xs font-medium text-emerald-600 underline dark:text-emerald-400"
                    >
                      Accept
                    </button>
                  </form>
                  <form action={respondToFriendRequest.bind(null, req.id, "declined")}>
                    <button
                      type="submit"
                      className="text-xs text-red-600 underline dark:text-red-400"
                    >
                      Decline
                    </button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {friends.length > 0 && (
        <section className="mt-6">
          <h2 className="text-sm font-semibold text-black dark:text-zinc-50">
            Your buddies
          </h2>
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
                          className="min-w-0 truncate text-sm font-medium text-black underline underline-offset-2 dark:text-zinc-50"
                        >
                          {email}
                        </Link>
                      ) : (
                        <p className="min-w-0 truncate text-sm font-medium text-black dark:text-zinc-50">
                          {email}
                        </p>
                      )}
                      <Link
                        href={otherId ? `/buddies/new?buddy=${otherId}` : "/buddies/new"}
                        className="shrink-0 rounded-md border border-zinc-200 px-2.5 py-1 text-xs font-medium text-black dark:border-zinc-800 dark:text-zinc-50"
                      >
                        Start a challenge
                      </Link>
                    </div>
                    {challenges.length > 0 ? (
                      <ul className="space-y-1">
                        {challenges.map((c) => (
                          <li
                            key={c.id}
                            className="flex items-center justify-between gap-2 text-xs text-zinc-500 dark:text-zinc-400"
                          >
                            <span className="min-w-0 truncate text-black dark:text-zinc-50">{c.name}</span>
                            <span className="flex shrink-0 items-center gap-1.5">
                              {(pendingChanges[c.id] ?? 0) > 0 && (
                                <span className="rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-medium text-red-700 dark:bg-red-950 dark:text-red-400">
                                  {pendingChanges[c.id]} change{pendingChanges[c.id] > 1 ? "s" : ""}
                                </span>
                              )}
                              {STATUS_LABEL[c.status] ?? c.status}
                            </span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-xs text-zinc-500 dark:text-zinc-400">No challenge running yet</p>
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
          <h2 className="text-sm font-semibold text-black dark:text-zinc-50">
            Sent
          </h2>
          <ul className="mt-2 space-y-2">
            {outgoing.map((req) => (
              <li
                key={req.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-zinc-200 px-3 py-2.5 dark:border-zinc-800"
              >
                <span className="min-w-0 truncate text-sm text-black dark:text-zinc-50">
                  {req.addresseeEmail}
                </span>
                <form action={cancelFriendRequest.bind(null, req.id)}>
                  <button
                    type="submit"
                    className="shrink-0 text-xs text-red-600 underline dark:text-red-400"
                  >
                    Cancel
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </section>
      )}

      <StakeLedger entries={stakeLedger} />

      <section className="mt-8 border-t border-zinc-200 pt-6 dark:border-zinc-800">
        <h2 className="text-sm font-semibold text-black dark:text-zinc-50">
          Invite a buddy
        </h2>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
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
