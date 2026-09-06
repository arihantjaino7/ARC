import { Screen } from "@/components/Screen";
import { getProfile } from "@/lib/profile/actions";
import { ProfileForm } from "./ProfileForm";

export default async function ProfilePage() {
  const profile = await getProfile();

  return (
    <Screen
      title="Your profile"
      subtitle="Your stats decide your recommended targets — and those pre-fill every challenge."
      back={{ href: "/settings", label: "Settings" }}
    >
      <ProfileForm profile={profile} />
    </Screen>
  );
}
