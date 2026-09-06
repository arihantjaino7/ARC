import { Screen } from "@/components/Screen";
import { getGoals } from "@/lib/goals/actions";
import { GoalsForm } from "./GoalsForm";

export default async function GoalsPage() {
  const goals = await getGoals();

  return (
    <Screen
      title="Your goals"
      subtitle="Your own baseline, always on. Challenges add their own rules on top."
      back={{ href: "/progress", label: "Progress" }}
    >
      <GoalsForm goals={goals} />
    </Screen>
  );
}
