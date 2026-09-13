import Link from "next/link";
import { EmptyState, Screen } from "@/components/Screen";
import { Button } from "@/components/ui/Button";
import { createClient } from "@/lib/supabase/server";
import { getFriendData } from "@/lib/friends/actions";
import { getMyChallengesByBuddy, getStakeLedger, type BuddyChallengeSummary } from "@/lib/challenges/actions";
import { pickChallenge } from "@/lib/challenges/types";
import { ChallengeCard } from "./ChallengeCard";
import { StakeLedger } from "./StakeLedger";
import { FriendsDrawer } from "./FriendsDrawer";

export default async function BuddiesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ incoming, outgoing, friends }, challengesByBuddy, stakeLedger] = await Promise.all([
    getFriendData(),
    getMyChallengesByBuddy(),
    getStakeLedger(),
  ]);

  // Each buddy can only ever have one *live* challenge at a time (see
  // supabase/step24_one_buddy_challenge_at_a_time.sql), so one card per buddy
  // with something to show is the whole list — no multi-challenge-per-buddy
  // UI needed.
  const cards: { buddyId: string; email: string; challenge: BuddyChallengeSummary }[] = [];
  for (const f of friends) {
    const email = f.requesterId === user?.id ? f.addresseeEmail : f.requesterEmail;
    const buddyId = f.requesterId === user?.id ? f.addresseeId : f.requesterId;
    if (!buddyId) continue;
    const challenge = pickChallenge(challengesByBuddy[buddyId] ?? []);
    if (!challenge) continue;
    cards.push({ buddyId, email, challenge });
  }

  return (
    <Screen
      title="Buddies"
      subtitle="One-on-one challenges. Just you and them."
      leadingAction={
        <FriendsDrawer
          userId={user?.id}
          incoming={incoming}
          outgoing={outgoing}
          friends={friends}
        />
      }
      action={
        <Link href="/buddies/new">
          <Button size="sm">New challenge</Button>
        </Link>
      }
    >
      {cards.length === 0 ? (
        <EmptyState
          title="No challenges yet"
          body="Start one with a link, or pick a friend from your Friends list to challenge."
          cta={
            <Link href="/buddies/new">
              <Button>Start a challenge with a link</Button>
            </Link>
          }
        />
      ) : (
        <ul className="space-y-2">
          {cards.map(({ buddyId, email, challenge }) => (
            <li key={buddyId}>
              <ChallengeCard buddyId={buddyId} buddyEmail={email} challenge={challenge} />
            </li>
          ))}
        </ul>
      )}

      <StakeLedger entries={stakeLedger} />
    </Screen>
  );
}
