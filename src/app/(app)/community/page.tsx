import Link from "next/link";
import { Card, EmptyState, Screen } from "@/components/Screen";
import { Chip } from "@/components/ui/Chip";
import { getBrowsableCommunities, getMyCommunities } from "@/lib/communities/actions";
import { SearchCommunities } from "./SearchCommunities";

// No blur (D11 blur-budget fix): this renders inside Screen's action slot,
// which Screen itself mounts twice (full-title row + sticky glass-3 header) —
// a blurred instance there would stack a second live backdrop-filter right on
// top of the header's own, over docs/PLAN-DESIGN.md §1.2's two-live-blur cap.
const glassLinkClass =
  "inline-flex min-h-11 items-center justify-center rounded-row border border-glass-2-border bg-glass-2 px-3.5 text-caption font-medium text-ink";
const primaryLinkClass =
  "inline-flex min-h-11 items-center justify-center rounded-row bg-sage px-5 text-body font-medium text-bg-void";

export default async function CommunityPage() {
  const [communities, browsable] = await Promise.all([getMyCommunities(), getBrowsableCommunities()]);

  return (
    <Screen
      title="Community"
      subtitle="Group challenges, set by a group admin."
      action={
        <Link href="/community/new" className={glassLinkClass}>
          New
        </Link>
      }
    >
      {communities.length === 0 ? (
        <EmptyState
          title="Not in one yet"
          body="An admin sets one challenge template, and anyone who likes it joins — public groups instantly, private ones by request. Start your own, or wait for a link."
          cta={
            <Link href="/community/new" className={primaryLinkClass}>
              Start a community
            </Link>
          }
        />
      ) : (
        <section>
          <h2 className="text-section text-ink">Yours</h2>
          <ul className="mt-2 space-y-2">
            {communities.map((c) => (
              <li key={c.id}>
                <Link href={`/community/${c.id}`} className="block">
                  <Card className="flex items-center justify-between gap-3">
                    <span className="min-w-0 truncate text-body font-medium text-ink">{c.name}</span>
                    <span className="flex shrink-0 items-center gap-1.5">
                      {c.memberRole === "admin" && <Chip tone="sage">Admin</Chip>}
                      <Chip>{c.visibility === "private" ? "Private" : "Public"}</Chip>
                    </span>
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {browsable.length > 0 && (
        <section className="mt-6">
          <h2 className="text-section text-ink">Browse public communities</h2>
          <ul className="mt-2 space-y-2">
            {browsable.map((c) => (
              <li key={c.id}>
                <Link href={`/community/${c.id}`} className="block">
                  <Card className="space-y-1">
                    <p className="truncate text-body font-medium text-ink">{c.name}</p>
                    {c.description && (
                      <p className="line-clamp-2 text-caption text-ink-muted">{c.description}</p>
                    )}
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <SearchCommunities />

      <ul className="mt-6 space-y-2">
        <li>
          <Card className="text-body text-ink-muted">
            Admin writes the challenge; members join it, nobody else can edit it.
          </Card>
        </li>
        <li>
          <Card className="text-body text-ink-muted">
            Public groups join instantly. Private groups approve requests.
          </Card>
        </li>
        <li>
          <Card className="text-body text-ink-muted">
            Whole-group progress, separate from anything in Buddies. A private community isn&rsquo;t
            listed above &mdash; search for it by name to request to join.
          </Card>
        </li>
      </ul>
    </Screen>
  );
}
