import { Screen } from "@/components/Screen";
import { NewCommunityForm } from "./NewCommunityForm";

export default function NewCommunityPage() {
  return (
    <Screen
      title="New community"
      subtitle="Name it, set who can join, and write the challenge everyone competes on."
      back={{ href: "/community", label: "Community" }}
    >
      <NewCommunityForm />
    </Screen>
  );
}
