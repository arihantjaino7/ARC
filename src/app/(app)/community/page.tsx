import Link from "next/link";
import { Card, EmptyState, Screen } from "@/components/Screen";
import { getBrowsableCommunities, getMyCommunities } from "@/lib/communities/actions";
import { SearchCommunities } from "./SearchCommunities";

export default async function CommunityPage() {
  const [communities, browsable] = await Promise.all([getMyCommunities(), getBrowsableCommunities()]);

  return (
    <Screen
      title="Community"
      subtitle="Group challenges, set by a group admin."
      action={
        <Link
          href="/community/new"
          className="shrink-0 rounded-md bg-black px-3 py-1.5 text-xs font-medium text-white dark:bg-white dark:text-black"
        >
          New community
        </Link>
      }
    >
      {communities.length === 0 ? (
        <EmptyState
          title="Not in one yet"
          body="An admin sets one challenge template, and anyone who likes it joins — public groups instantly, private ones by request. Start your own, or wait for a link."
          cta={
            <Link
              href="/community/new"
              className="rounded-md bg-black px-3 py-2 text-sm font-medium text-white dark:bg-white dark:text-black"
            >
              Start a community
            </Link>
          }
        />
      ) : (
        <section>
          <h2 className="text-sm font-semibold text-black dark:text-zinc-50">Yours</h2>
          <ul className="mt-2 space-y-2">
            {communities.map((c) => (
              <li key={c.id}>
                <Link href={`/community/${c.id}`} className="block">
                  <Card className="flex items-center justify-between gap-3">
                    <span className="min-w-0 truncate text-sm font-medium text-black dark:text-zinc-50">
                      {c.name}
                    </span>
                    <span className="flex shrink-0 items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400">
                      {c.memberRole === "admin" && (
                        <span className="rounded-full bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                          Admin
                        </span>
                      )}
                      {c.visibility === "private" ? "Private" : "Public"}
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
          <h2 className="text-sm font-semibold text-black dark:text-zinc-50">Browse public communities</h2>
          <ul className="mt-2 space-y-2">
            {browsable.map((c) => (
              <li key={c.id}>
                <Link href={`/community/${c.id}`} className="block">
                  <Card className="space-y-1">
                    <p className="truncate text-sm font-medium text-black dark:text-zinc-50">{c.name}</p>
                    {c.description && (
                      <p className="line-clamp-2 text-xs text-zinc-500 dark:text-zinc-400">{c.description}</p>
                    )}
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <SearchCommunities />

      <ul className="mt-6 space-y-2 text-sm text-zinc-500 dark:text-zinc-400">
        <li className="rounded-lg border border-zinc-200 px-3 py-2.5 dark:border-zinc-800">
          Admin writes the challenge; members join it, nobody else can edit it.
        </li>
        <li className="rounded-lg border border-zinc-200 px-3 py-2.5 dark:border-zinc-800">
          Public groups join instantly. Private groups approve requests.
        </li>
        <li className="rounded-lg border border-zinc-200 px-3 py-2.5 dark:border-zinc-800">
          Whole-group progress, separate from anything in Buddies. A private community isn&rsquo;t
          listed above &mdash; search for it by name to request to join.
        </li>
      </ul>
    </Screen>
  );
}
