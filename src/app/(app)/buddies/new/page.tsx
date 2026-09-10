import { Screen } from "@/components/Screen";
import { createClient } from "@/lib/supabase/server";
import { getFriendData } from "@/lib/friends/actions";
import { getMetrics } from "@/lib/metrics/actions";
import { getProfile } from "@/lib/profile/actions";
import { calculateRecommendations, isValidRecommendationInput } from "@/lib/profile/recommendations";
import { NewChallengeWizard, type BuddyOption } from "./NewChallengeWizard";

export default async function NewChallengePage(props: PageProps<"/buddies/new">) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ friends }, profile, metrics, params] = await Promise.all([
    getFriendData(),
    getProfile(),
    getMetrics(),
    props.searchParams,
  ]);

  const buddies: BuddyOption[] = friends
    .map((f) => ({
      userId: f.requesterId === user?.id ? f.addresseeId : f.requesterId,
      email: f.requesterId === user?.id ? f.addresseeEmail : f.requesterEmail,
    }))
    .filter((b): b is BuddyOption => Boolean(b.userId));

  const recommendations =
    profile && isValidRecommendationInput(profile) ? calculateRecommendations(profile) : null;

  const preselect = params?.buddy;
  const initialBuddyId = typeof preselect === "string" && buddies.some((b) => b.userId === preselect)
    ? preselect
    : null;

  return (
    <Screen
      title="New challenge"
      subtitle="Six quick screens. Nothing's sent until the last one."
      back={{ href: "/buddies", label: "Buddies" }}
    >
      <NewChallengeWizard
        buddies={buddies}
        recommendations={recommendations}
        initialBuddyId={initialBuddyId}
        metrics={metrics}
      />
    </Screen>
  );
}
