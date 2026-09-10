import { Screen } from "@/components/Screen";
import { getMetrics } from "@/lib/metrics/actions";
import { NewCommunityForm } from "./NewCommunityForm";

export default async function NewCommunityPage() {
  const metrics = await getMetrics();

  return (
    <Screen
      title="New community"
      subtitle="Name it, set who can join, and write the challenge everyone competes on."
      back={{ href: "/community", label: "Community" }}
    >
      <NewCommunityForm metrics={metrics} />
    </Screen>
  );
}
