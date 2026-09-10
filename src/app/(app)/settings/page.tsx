import Link from "next/link";
import { Card, Screen } from "@/components/Screen";
import { Button } from "@/components/ui/Button";
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
        <h2 className="text-section text-ink">You</h2>
        <p className="mt-1 text-caption text-ink-muted">
          Body stats and daily targets. These pre-fill every challenge you set
          up, so getting them right once saves filling in numbers later.
        </p>
        <Link href="/settings/profile" className="mt-3 inline-block">
          <Button variant="glass" size="sm">
            {profile ? "Edit profile" : "Set up your profile"}
          </Button>
        </Link>
      </Card>

      <Card className="mt-4">
        <h2 className="text-section text-ink">Time zone</h2>
        <p className="mt-1 text-caption text-ink-muted">
          Decides when your day starts and ends. Your day currently reads as{" "}
          <span className="font-medium text-ink">{localDate(tz)}</span>
          . Set this before a challenge starts &mdash; changing it mid-challenge
          shows up to your buddy.
        </p>
        <TimezoneForm current={tz} />
      </Card>

      <Card className="mt-4">
        <h2 className="text-section text-ink">Fair play</h2>
        <ul className="mt-2 space-y-1.5 text-caption text-ink-muted">
          <li>
            &bull; You can edit today, and yesterday until 10:00 your time. After
            that a day is locked for good.
          </li>
          <li>
            &bull; Entries written after their day closed are marked{" "}
            <span className="font-medium text-ink">late</span>, and every change is
            counted &mdash; your buddy sees both.
          </li>
          <li>&bull; Impossible numbers get flagged automatically.</li>
          <li>
            &bull; Inside a challenge, your buddy can confirm or flag your day within 48
            hours. A flagged day is worth 0 until it&rsquo;s resolved.
          </li>
          <li>
            &bull; Rule changes on a running challenge need both sides to agree, and only
            ever take effect starting tomorrow &mdash; never today.
          </li>
        </ul>
        <p className="mt-3 text-caption text-ink-faint">Proof photos stay a future addition.</p>
      </Card>

      <Card className="mt-4">
        <h2 className="text-section text-ink">Account</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link href="/reset-password">
            <Button variant="glass" size="sm">
              Change password
            </Button>
          </Link>
          <form action={logout}>
            <Button type="submit" variant="glass" size="sm">
              Log out
            </Button>
          </form>
        </div>
      </Card>
    </Screen>
  );
}
