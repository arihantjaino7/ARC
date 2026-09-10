import Link from "next/link";
import { Card, Screen } from "@/components/Screen";
import { Surface } from "@/components/ui/Surface";
import { Chip } from "@/components/ui/Chip";
import { Button } from "@/components/ui/Button";
import {
  getCommunityDetail,
  getCommunityLeaderboard,
  leaveCommunity,
  removeCommunityMember,
  respondToJoinRequest,
} from "@/lib/communities/actions";
import type { InviteRule } from "@/lib/challenges/actions";
import { getProfile } from "@/lib/profile/actions";
import { calculateRecommendations, isValidRecommendationInput, type Recommendations } from "@/lib/profile/recommendations";
import { getMetrics } from "@/lib/metrics/actions";
import { findMetric, type MetricDef } from "@/lib/metrics/types";
import { markCommunityNotificationsRead } from "@/lib/notifications/actions";
import { JoinCommunityActions } from "./JoinCommunityActions";
import { CommunityRulePanel } from "./CommunityRulePanel";
import { CommunityInviteLink } from "./CommunityInviteLink";
import { Leaderboard } from "./Leaderboard";

function defaultOwnValue(metricKey: string, rec: Recommendations | null): number {
  switch (metricKey) {
    case "calories":
      return rec?.calories ?? 2000;
    case "protein_g":
      return rec?.protein_g ?? 140;
    case "water_ml":
      return rec?.water_ml ?? 3000;
    case "sleep_hours":
      return rec?.sleep_hours ?? 8;
    default:
      return 0;
  }
}

function describeRule(rule: InviteRule, metrics: readonly MetricDef[]): string {
  const label = findMetric(metrics, rule.metricKey)?.label ?? rule.metricKey;
  const scopeNote = rule.scope === "own" ? " — each sets their own" : "";
  if (rule.shape === "boolean" && rule.schedule?.mode === "flexible") {
    return `${label} — ${rule.schedule.sessionsPerWeek}x/week`;
  }
  if (rule.shape === "boolean" && rule.schedule?.mode === "fixed_days") {
    return `${label} — ${rule.schedule.days.length} fixed days/week`;
  }
  if (rule.shape === "at_least") return `${label} — at least ${rule.target}${scopeNote}`;
  if (rule.shape === "at_most") return `${label} — no more than ${rule.target}${scopeNote}`;
  if (rule.shape === "range") return `${label} — between ${rule.min} and ${rule.max}${scopeNote}`;
  return label;
}

export default async function CommunityDetailPage(props: PageProps<"/community/[id]">) {
  const { id } = await props.params;
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

  if (detail.myStatus === "admin" || detail.myStatus === "member") {
    await markCommunityNotificationsRead(id);
  }

  const isMember = detail.myStatus === "admin" || detail.myStatus === "member";
  const [leaderboard, profile, metrics] = await Promise.all([
    isMember ? getCommunityLeaderboard(id) : Promise.resolve(null),
    getProfile(),
    getMetrics(),
  ]);
  const recommendations = profile && isValidRecommendationInput(profile) ? calculateRecommendations(profile) : null;

  const ownRules = detail.rules
    .filter((r) => r.scope === "own" && r.shape !== "boolean")
    .map((r) => ({
      ruleId: r.id,
      metricKey: r.metricKey,
      shape: r.shape,
      label: findMetric(metrics, r.metricKey)?.label ?? r.metricKey,
      defaultTarget: defaultOwnValue(r.metricKey, recommendations),
    }));

  return (
    <Screen title={detail.name} back={{ href: "/community", label: "Community" }}>
      <div className="flex items-center gap-2">
        <Chip>{detail.visibility === "private" ? "Private" : "Public"}</Chip>
        {detail.isAdmin && <Chip tone="sage">Admin</Chip>}
      </div>

      {detail.description && <p className="mt-3 text-body text-ink-muted">{detail.description}</p>}

      <section className="mt-5">
        <h2 className="text-section text-ink">Rules</h2>
        <ul className="mt-2 space-y-1.5 text-body text-ink">
          {detail.rules.map((r) => (
            <li key={r.id}>&middot; {describeRule(r, metrics)}</li>
          ))}
        </ul>
      </section>

      {detail.isAdmin && <CommunityInviteLink communityId={id} />}

      {isMember && leaderboard && !("error" in leaderboard) && (
        <Leaderboard board={leaderboard} communityId={id} metrics={metrics} />
      )}
      {isMember && leaderboard && "error" in leaderboard && (
        <p className="mt-5 text-body text-clay">{leaderboard.error}</p>
      )}

      {detail.myStatus === "requested" && (
        <Surface tier={1} radius="row" className="mt-5 px-3 py-2.5 text-body text-ink-muted">
          Waiting for the admin to approve your request.
        </Surface>
      )}

      {(detail.myStatus === "none" || detail.myStatus === "removed") && (
        <JoinCommunityActions communityId={id} visibility={detail.visibility} ownRules={ownRules} />
      )}

      {(detail.myStatus === "admin" || detail.myStatus === "member") && (
        <section className="mt-6">
          <h2 className="text-section text-ink">Members</h2>
          <ul className="mt-2 space-y-2">
            {detail.members.map((m) => (
              <li key={m.userId}>
                <Card className="flex items-center justify-between gap-3">
                  <span className="flex min-w-0 items-center gap-2 truncate text-body text-ink">
                    <span className="truncate">{m.label}</span>
                    {m.role === "admin" && <Chip tone="sage">Admin</Chip>}
                  </span>
                  {detail.isAdmin && m.role !== "admin" && (
                    <form action={removeCommunityMember.bind(null, id, m.userId)}>
                      <button type="submit" className="shrink-0 text-caption text-clay underline">
                        Remove
                      </button>
                    </form>
                  )}
                </Card>
              </li>
            ))}
          </ul>
        </section>
      )}

      {detail.isAdmin && detail.pendingRequests.length > 0 && (
        <section className="mt-6">
          <h2 className="text-section text-ink">Pending requests</h2>
          <ul className="mt-2 space-y-2">
            {detail.pendingRequests.map((r) => (
              <li key={r.userId}>
                <Card className="flex items-center justify-between gap-3">
                  <span className="min-w-0 truncate text-body text-ink">{r.label}</span>
                  <div className="flex shrink-0 gap-3">
                    <form action={respondToJoinRequest.bind(null, id, r.userId, true)}>
                      <button type="submit" className="text-caption font-medium text-sage underline">
                        Approve
                      </button>
                    </form>
                    <form action={respondToJoinRequest.bind(null, id, r.userId, false)}>
                      <button type="submit" className="text-caption text-clay underline">
                        Decline
                      </button>
                    </form>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        </section>
      )}

      {detail.isAdmin && <CommunityRulePanel communityId={id} liveRules={detail.rules} metrics={metrics} />}

      {detail.myStatus === "member" && (
        <form action={leaveCommunity.bind(null, id)} className="mt-6">
          <Button type="submit" variant="danger" size="sm">
            Leave community
          </Button>
        </form>
      )}

      {detail.myStatus === "admin" && (
        <p className="mt-6 text-caption text-ink-faint">As the admin, you can&rsquo;t leave your own community.</p>
      )}

      {!detail.isAdmin && (
        <p className="mt-2 text-caption text-ink-faint">
          <Link href="/community" className="underline">
            Back to Community
          </Link>
        </p>
      )}
    </Screen>
  );
}
