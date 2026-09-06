import Link from "next/link";
import { Card, Screen } from "@/components/Screen";
import {
  getCommunityDetail,
  getCommunityLeaderboard,
  leaveCommunity,
  removeCommunityMember,
  respondToJoinRequest,
} from "@/lib/communities/actions";
import type { LeaderboardMember, LeaderboardResult } from "@/lib/communities/types";
import type { InviteRule } from "@/lib/challenges/actions";
import type { ScoreboardRuleSummary } from "@/lib/challenges/types";
import { getProfile } from "@/lib/profile/actions";
import { calculateRecommendations, isValidRecommendationInput, type Recommendations } from "@/lib/profile/recommendations";
import { findMetric, BUILTIN_METRICS } from "@/lib/metrics/types";
import { markCommunityNotificationsRead } from "@/lib/notifications/actions";
import { JoinCommunityActions } from "./JoinCommunityActions";
import { CommunityRulePanel } from "./CommunityRulePanel";

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

function describeRule(rule: InviteRule): string {
  const label = findMetric(BUILTIN_METRICS, rule.metricKey)?.label ?? rule.metricKey;
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
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          This community doesn&rsquo;t exist, or you don&rsquo;t have access to it.
        </p>
      </Screen>
    );
  }

  if (detail.myStatus === "admin" || detail.myStatus === "member") {
    await markCommunityNotificationsRead(id);
  }

  const isMember = detail.myStatus === "admin" || detail.myStatus === "member";
  const leaderboard = isMember ? await getCommunityLeaderboard(id) : null;

  const profile = await getProfile();
  const recommendations = profile && isValidRecommendationInput(profile) ? calculateRecommendations(profile) : null;

  const ownRules = detail.rules
    .filter((r) => r.scope === "own" && r.shape !== "boolean")
    .map((r) => ({
      ruleId: r.id,
      metricKey: r.metricKey,
      shape: r.shape,
      label: findMetric(BUILTIN_METRICS, r.metricKey)?.label ?? r.metricKey,
      defaultTarget: defaultOwnValue(r.metricKey, recommendations),
    }));

  return (
    <Screen title={detail.name} back={{ href: "/community", label: "Community" }}>
      <div className="flex items-center gap-2">
        <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
          {detail.visibility === "private" ? "Private" : "Public"}
        </span>
        {detail.isAdmin && (
          <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
            Admin
          </span>
        )}
      </div>

      {detail.description && (
        <p className="mt-3 text-sm text-zinc-500 dark:text-zinc-400">{detail.description}</p>
      )}

      <section className="mt-5">
        <h2 className="text-sm font-semibold text-black dark:text-zinc-50">Rules</h2>
        <ul className="mt-2 space-y-1.5 text-sm">
          {detail.rules.map((r) => (
            <li key={r.id} className="text-black dark:text-zinc-50">
              &middot; {describeRule(r)}
            </li>
          ))}
        </ul>
      </section>

      {isMember && leaderboard && !("error" in leaderboard) && (
        <Leaderboard board={leaderboard} />
      )}
      {isMember && leaderboard && "error" in leaderboard && (
        <p className="mt-5 text-sm text-red-600 dark:text-red-400">{leaderboard.error}</p>
      )}

      {detail.myStatus === "requested" && (
        <p className="mt-5 rounded-lg border border-zinc-200 px-3 py-2.5 text-sm text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
          Waiting for the admin to approve your request.
        </p>
      )}

      {(detail.myStatus === "none" || detail.myStatus === "removed") && (
        <JoinCommunityActions communityId={id} visibility={detail.visibility} ownRules={ownRules} />
      )}

      {(detail.myStatus === "admin" || detail.myStatus === "member") && (
        <section className="mt-6">
          <h2 className="text-sm font-semibold text-black dark:text-zinc-50">Members</h2>
          <ul className="mt-2 space-y-2">
            {detail.members.map((m) => (
              <li key={m.userId}>
                <Card className="flex items-center justify-between gap-3">
                  <span className="min-w-0 truncate text-sm text-black dark:text-zinc-50">
                    {m.label}
                    {m.role === "admin" && (
                      <span className="ml-2 rounded-full bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                        Admin
                      </span>
                    )}
                  </span>
                  {detail.isAdmin && m.role !== "admin" && (
                    <form action={removeCommunityMember.bind(null, id, m.userId)}>
                      <button type="submit" className="shrink-0 text-xs text-red-600 underline dark:text-red-400">
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
          <h2 className="text-sm font-semibold text-black dark:text-zinc-50">Pending requests</h2>
          <ul className="mt-2 space-y-2">
            {detail.pendingRequests.map((r) => (
              <li
                key={r.userId}
                className="flex items-center justify-between gap-3 rounded-lg border border-zinc-200 px-3 py-2.5 dark:border-zinc-800"
              >
                <span className="min-w-0 truncate text-sm text-black dark:text-zinc-50">{r.label}</span>
                <div className="flex shrink-0 gap-3">
                  <form action={respondToJoinRequest.bind(null, id, r.userId, true)}>
                    <button type="submit" className="text-xs font-medium text-emerald-600 underline dark:text-emerald-400">
                      Approve
                    </button>
                  </form>
                  <form action={respondToJoinRequest.bind(null, id, r.userId, false)}>
                    <button type="submit" className="text-xs text-red-600 underline dark:text-red-400">
                      Decline
                    </button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {detail.isAdmin && <CommunityRulePanel communityId={id} liveRules={detail.rules} />}

      {detail.myStatus === "member" && (
        <form action={leaveCommunity.bind(null, id)} className="mt-6">
          <button type="submit" className="text-sm text-red-600 underline dark:text-red-400">
            Leave community
          </button>
        </form>
      )}

      {detail.myStatus === "admin" && (
        <p className="mt-6 text-xs text-zinc-500 dark:text-zinc-400">
          As the admin, you can&rsquo;t leave your own community.
        </p>
      )}

      {!detail.isAdmin && (
        <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
          <Link href="/community" className="underline">
            Back to Community
          </Link>
        </p>
      )}
    </Screen>
  );
}

function ruleLabel(rule: ScoreboardRuleSummary): string {
  return findMetric(BUILTIN_METRICS, rule.metricKey)?.label ?? rule.metricKey;
}

/**
 * The leaderboard + group aggregate bar (Community Step C5,
 * docs/PLAN-V2.md §6). Ranked by total, highest first, plus a single "the
 * group" bar underneath so the community competes as a unit too — the same
 * BarRow visual language as the buddy scoreboard's you-vs-them bars
 * (src/app/(app)/buddies/[id]/page.tsx), just N rows instead of 2.
 */
function Leaderboard({ board }: { board: LeaderboardResult }) {
  return (
    <div className="mt-5 space-y-4">
      <Card>
        <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          Leaderboard
        </p>
        <div className="mt-2 space-y-1.5">
          {board.members.map((m, i) => (
            <LeaderboardRow key={m.userId} rank={i + 1} member={m} />
          ))}
        </div>
        <div className="mt-3 border-t border-zinc-200 pt-3 dark:border-zinc-800">
          <BarRow label="The group" value={board.groupAggregate} bold />
        </div>
        <p className="mt-3 text-[11px] text-zinc-500 dark:text-zinc-400">
          {board.startDate} &rarr; {board.endDate}
        </p>
      </Card>

      {board.rules.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            By rule
          </p>
          <div className="space-y-3">
            {board.rules.map((rule) => (
              <Card key={rule.id}>
                <p className="text-sm font-medium text-black dark:text-zinc-50">{ruleLabel(rule)}</p>
                <div className="mt-2 space-y-1.5">
                  {board.members.map((m) => (
                    <BarRow key={m.userId} label={m.isCaller ? "You" : m.label} value={m.perRule[rule.id]?.score ?? 0} />
                  ))}
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function LeaderboardRow({ rank, member }: { rank: number; member: LeaderboardMember }) {
  const parts = [
    member.badges.late > 0 && `${member.badges.late} late`,
    member.badges.edited > 0 && `${member.badges.edited} edited`,
    member.badges.flagged > 0 && `${member.badges.flagged} flagged`,
    member.badges.suspicious > 0 && `${member.badges.suspicious} suspicious`,
  ].filter(Boolean);

  return (
    <div>
      <BarRow
        label={`${rank}. ${member.isCaller ? "You" : member.label}`}
        value={member.total}
        hidden={member.todayHidden}
      />
      {parts.length > 0 && (
        <p className="ml-16 text-[10px] text-zinc-500 dark:text-zinc-400">{parts.join(", ")}</p>
      )}
    </div>
  );
}

function BarRow({
  label,
  value,
  hidden,
  bold,
}: {
  label: string;
  value: number;
  hidden?: boolean;
  bold?: boolean;
}) {
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div className="flex items-center gap-2">
      <span
        className={`w-20 shrink-0 truncate text-[11px] ${
          bold ? "font-semibold text-black dark:text-zinc-50" : "text-zinc-500 dark:text-zinc-400"
        }`}
      >
        {label}
      </span>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
        {!hidden && (
          <div
            className={`h-full rounded-full ${bold ? "bg-emerald-500" : "bg-black dark:bg-white"}`}
            style={{ width: `${pct}%` }}
          />
        )}
      </div>
      <span className="w-9 shrink-0 text-right text-[11px] font-medium text-black dark:text-zinc-50">
        {hidden ? "\u{1F512}" : `${pct}%`}
      </span>
    </div>
  );
}
