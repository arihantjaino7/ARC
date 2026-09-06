import Link from "next/link";
import { Card, Screen } from "@/components/Screen";
import { logout } from "@/lib/auth/actions";
import { getProfile } from "@/lib/profile/actions";
import { createClient } from "@/lib/supabase/server";
import { localDate } from "@/lib/time/day";
import { TimezoneForm } from "./TimezoneForm";

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const profile = await getProfile();
  const tz = profile?.timezone ?? "UTC";

  return (
    <Screen title="Settings" subtitle={user?.email ?? undefined}>
      <Card>
        <h2 className="text-sm font-semibold text-black dark:text-zinc-50">You</h2>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          Body stats and daily targets. These pre-fill every challenge you set
          up, so getting them right once saves filling in numbers later.
        </p>
        <Link
          href="/settings/profile"
          className="mt-3 inline-block rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium text-black dark:border-zinc-700 dark:text-zinc-50"
        >
          {profile ? "Edit profile" : "Set up your profile"}
        </Link>
      </Card>

      <Card className="mt-4">
        <h2 className="text-sm font-semibold text-black dark:text-zinc-50">
          Time zone
        </h2>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          Decides when your day starts and ends. Your day currently reads as{" "}
          <span className="font-medium text-black dark:text-zinc-50">
            {localDate(tz)}
          </span>
          . Set this before a challenge starts &mdash; changing it mid-challenge
          shows up to your buddy.
        </p>
        <TimezoneForm current={tz} />
      </Card>

      <Card className="mt-4">
        <h2 className="text-sm font-semibold text-black dark:text-zinc-50">
          Fair play
        </h2>
        <ul className="mt-2 space-y-1.5 text-xs text-zinc-500 dark:text-zinc-400">
          <li>
            &bull; You can edit today, and yesterday until 10:00 your time. After
            that a day is locked for good.
          </li>
          <li>
            &bull; Entries written after their day closed are marked{" "}
            <span className="font-medium">late</span>, and every change is
            counted &mdash; your buddy sees both.
          </li>
          <li>
            &bull; Impossible numbers get flagged automatically.
          </li>
          <li>
            &bull; Inside a challenge, your buddy can confirm or flag your day within 48
            hours. A flagged day is worth 0 until it&rsquo;s resolved.
          </li>
          <li>
            &bull; Rule changes on a running challenge need both sides to agree, and only
            ever take effect starting tomorrow &mdash; never today.
          </li>
        </ul>
        <p className="mt-3 text-xs text-zinc-400 dark:text-zinc-600">
          Proof photos stay a future addition.
        </p>
      </Card>

      <Card className="mt-4">
        <h2 className="text-sm font-semibold text-black dark:text-zinc-50">
          Account
        </h2>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link
            href="/reset-password"
            className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium text-black dark:border-zinc-700 dark:text-zinc-50"
          >
            Change password
          </Link>
          <form action={logout}>
            <button
              type="submit"
              className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium text-black dark:border-zinc-700 dark:text-zinc-50"
            >
              Log out
            </button>
          </form>
        </div>
      </Card>
    </Screen>
  );
}
