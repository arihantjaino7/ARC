import Link from "next/link";
import { Card, EmptyState, Screen } from "@/components/Screen";
import { getCommunityDetail, getCommunityLeaderboard } from "@/lib/communities/actions";
import type { LeaderboardMember, LeaderboardResult } from "@/lib/communities/types";
import { getMetrics } from "@/lib/metrics/actions";
import { findMetric, type MetricDef } from "@/lib/metrics/types";
import { Bar } from "@/components/ui/Bar";
import { Chip } from "@/components/ui/Chip";
import { MemberHeader } from "./MemberHeader";
import { HeatStrip } from "./HeatStrip";

// Community Step: per-member drill-down. Clicking a row on the leaderboard
// (src/app/(app)/community/[id]/Leaderboard.tsx) lands here — the community
// equivalent of the buddy comparison screen's per-rule bars and heat strip
// (src/app/(app)/buddies/[id]/page.tsx), just for one member at a time
// instead of "you vs them". Reuses getCommunityLeaderboard() unchanged (it
// already computes every member's rules/heatStrip/badges) rather than a
// second RPC — this page just finds one member in that same result.
// MemberHeader carries the other half of the leaderboard row's shared-element
// morph (same `member-${communityId}-${userId}` layoutId).

function ruleLabel(metricKey: string, metrics: readonly MetricDef[]): string {
  return findMetric(metrics, metricKey)?.label ?? metricKey;
}

function MemberDetail({
  board,
  member,
  metrics,
  communityId,
}: {
  board: LeaderboardResult;
  member: LeaderboardMember;
  metrics: MetricDef[];
  communityId: string;
}) {
  const parts = [
    member.badges.late > 0 && `${member.badges.late} late`,
    member.badges.edited > 0 && `${member.badges.edited} edited`,
    member.badges.flagged > 0 && `${member.badges.flagged} flagged`,
    member.badges.suspicious > 0 && `${member.badges.suspicious} suspicious`,
  ].filter((s): s is string => Boolean(s));

  return (
    <div className="space-y-4">
      <Card>
        <p className="text-overline text-ink-faint">Overall</p>
        <div className="mt-3">
          <MemberHeader communityId={communityId} member={member} />
          <div className="mt-2">
            <Bar score={member.todayHidden ? 0 : member.total} />
          </div>
        </div>
        <p className="mt-3 text-caption text-ink-faint">
          {board.startDate} &rarr; {board.endDate}
        </p>
      </Card>

      <div>
        <p className="mb-2 text-overline text-ink-faint">By rule</p>
        <div className="space-y-3">
          {board.rules.map((rule) => (
            <Card key={rule.id}>
              <div className="flex items-center justify-between">
                <p className="text-body font-medium text-ink">{ruleLabel(rule.metricKey, metrics)}</p>
                <span className="text-caption tabular-nums text-ink-muted">
                  {member.perRule[rule.id]?.score ?? 0}
                </span>
              </div>
              <div className="mt-2">
                <Bar score={member.perRule[rule.id]?.score ?? 0} />
              </div>
            </Card>
          ))}
        </div>
      </div>

      <div>
        <p className="mb-2 text-overline text-ink-faint">Last {member.heatStrip.length} days</p>
        <Card>
          <HeatStrip cells={member.heatStrip} />
          <p className="mt-3 text-caption text-ink-faint">
            Blank cells are rest days &mdash; not misses.
            {member.todayHidden && " Today's cell is hidden until you log your own."}
          </p>
        </Card>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {parts.length > 0 ? (
          parts.map((p) => (
            <Chip key={p} tone={p.includes("flagged") || p.includes("suspicious") ? "clay" : "ochre"}>
              {p}
            </Chip>
          ))
        ) : (
          <Chip tone="sage">Clean so far</Chip>
        )}
        {member.trustScore > 0 && <span className="text-caption text-ink-faint">trust {member.trustScore}</span>}
      </div>
    </div>
  );
}

export default async function CommunityMemberPage(props: PageProps<"/community/[id]/member/[userId]">) {
  const { id, userId } = await props.params;

  const detail = await getCommunityDetail(id);
  if ("error" in detail) {
    return (
      <Screen title="Not found" back={{ href: "/community", label: "Community" }}>
        <p className="text-body text-ink-muted">
          This community doesn&rsquo;t exist, or you don&rsquo;t have access to it.
        </p>
      </Screen>
    );
  }

  const isMember = detail.myStatus === "admin" || detail.myStatus === "member";
  if (!isMember) {
    return (
      <Screen title={detail.name} back={{ href: `/community/${id}`, label: detail.name }}>
        <EmptyState title="Members only" body="Join this community to see a member's breakdown." />
      </Screen>
    );
  }

  const [board, metrics] = await Promise.all([getCommunityLeaderboard(id), getMetrics()]);

  if ("error" in board) {
    return (
      <Screen title={detail.name} back={{ href: `/community/${id}`, label: detail.name }}>
        <p className="text-body text-clay">{board.error}</p>
      </Screen>
    );
  }

  const member = board.members.find((m) => m.userId === userId);
  if (!member) {
    return (
      <Screen title={detail.name} back={{ href: `/community/${id}`, label: detail.name }}>
        <EmptyState title="Not found" body="This person isn't a member of this community." />
      </Screen>
    );
  }

  return (
    <Screen
      title={member.isCaller ? "You" : member.label}
      subtitle={detail.name}
      back={{ href: `/community/${id}`, label: detail.name }}
    >
      <MemberDetail board={board} member={member} metrics={metrics} communityId={id} />
      <p className="mt-6 text-caption text-ink-faint">
        <Link href={`/community/${id}`} className="underline">
          Back to leaderboard
        </Link>
      </p>
    </Screen>
  );
}
