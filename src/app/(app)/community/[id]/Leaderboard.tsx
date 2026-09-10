"use client";

// The flagship screen (docs/PLAN-DESIGN.md §3.1 #3, #10, §2). A real ranked
// row (rank badge, name, animated score-coloured Bar, badges as Chips), the
// group-aggregate bar in its own Surface, `layout` on each row so ranks
// reorder physically when scores change, and the `layoutId` half of the
// shared-element morph into the member drill-down
// (community/[id]/member/[userId]/page.tsx carries the other half, same
// `member-${communityId}-${userId}` key).

import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
import { Card } from "@/components/Screen";
import { Surface } from "@/components/ui/Surface";
import { Bar } from "@/components/ui/Bar";
import { Ticker } from "@/components/ui/Ticker";
import { Chip } from "@/components/ui/Chip";
import { springs } from "@/components/ui/motion";
import type { LeaderboardMember, LeaderboardResult } from "@/lib/communities/types";
import type { ScoreboardRuleSummary } from "@/lib/challenges/types";
import { findMetric, type MetricDef } from "@/lib/metrics/types";

function ruleLabel(rule: ScoreboardRuleSummary, metrics: readonly MetricDef[]): string {
  return findMetric(metrics, rule.metricKey)?.label ?? rule.metricKey;
}

export function Leaderboard({
  board,
  communityId,
  metrics,
}: {
  board: LeaderboardResult;
  communityId: string;
  metrics: readonly MetricDef[];
}) {
  return (
    <div className="mt-5 space-y-4">
      <Card>
        <p className="text-overline text-ink-faint">Leaderboard</p>
        <ul className="mt-3 space-y-2">
          {board.members.map((m, i) => (
            <LeaderboardRow key={m.userId} rank={i + 1} member={m} communityId={communityId} index={i} />
          ))}
        </ul>
        <p className="mt-3 text-caption text-ink-faint">
          {board.startDate} &rarr; {board.endDate}
        </p>
      </Card>

      {/* tier 1, not 2 (D11 blur-budget fix) — same reasoning as
          progress/page.tsx's Today card: always-on-screen alongside the tab
          bar and Screen's sticky header already spends the §1.2 budget. */}
      <Surface tier={1} radius="card" className="p-4">
        <div className="flex items-center justify-between">
          <p className="text-body font-semibold text-ink">The group</p>
          <p className="text-title text-ink">
            <Ticker value={Math.round(board.groupAggregate)} />
          </p>
        </div>
        <div className="mt-2">
          <Bar score={board.groupAggregate} />
        </div>
      </Surface>

      {board.rules.length > 0 && (
        <div>
          <p className="mb-2 text-overline text-ink-faint">By rule</p>
          <div className="space-y-3">
            {board.rules.map((rule) => (
              <Card key={rule.id}>
                <p className="text-body font-medium text-ink">{ruleLabel(rule, metrics)}</p>
                <div className="mt-2 space-y-2">
                  {board.members.map((m, i) => (
                    <div key={m.userId}>
                      <div className="mb-1 flex items-center justify-between text-caption text-ink-muted">
                        <span className="truncate">{m.isCaller ? "You" : m.label}</span>
                        <span className="tabular-nums">{m.perRule[rule.id]?.score ?? 0}</span>
                      </div>
                      <Bar score={m.perRule[rule.id]?.score ?? 0} index={i} />
                    </div>
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

const RANK_TONE = ["text-lime", "text-ink-muted", "text-ochre"] as const;

function LeaderboardRow({
  rank,
  member,
  communityId,
  index,
}: {
  rank: number;
  member: LeaderboardMember;
  communityId: string;
  index: number;
}) {
  const parts = [
    member.badges.late > 0 && `${member.badges.late} late`,
    member.badges.edited > 0 && `${member.badges.edited} edited`,
    member.badges.flagged > 0 && `${member.badges.flagged} flagged`,
    member.badges.suspicious > 0 && `${member.badges.suspicious} suspicious`,
  ].filter((s): s is string => Boolean(s));

  const rankTone = rank <= 3 ? RANK_TONE[rank - 1] : "text-ink-faint";
  const reduceMotion = useReducedMotion();
  const layoutTransition = reduceMotion ? { duration: 0 } : springs.soft;

  return (
    <motion.li layout transition={layoutTransition} className="list-none">
      <Link href={`/community/${communityId}/member/${member.userId}`} className="block">
        <div className="rounded-row px-1 py-1.5">
          <motion.div
            layoutId={`member-${communityId}-${member.userId}`}
            transition={layoutTransition}
            className="flex items-center gap-3"
          >
            <span className={`w-5 shrink-0 text-center text-body font-semibold tabular-nums ${rankTone}`}>
              {rank}
            </span>
            <span className="min-w-0 flex-1 truncate text-body font-medium text-ink">
              {member.isCaller ? "You" : member.label}
            </span>
            <span className="shrink-0 text-body font-semibold tabular-nums text-ink">
              {member.todayHidden ? "🔒" : member.total}
            </span>
          </motion.div>
          <div className="mt-1.5 pl-8">
            <Bar score={member.todayHidden ? 0 : member.total} index={index} />
          </div>
          {parts.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1 pl-8">
              {parts.map((p) => (
                <Chip key={p} tone={p.includes("flagged") || p.includes("suspicious") ? "clay" : "ochre"}>
                  {p}
                </Chip>
              ))}
            </div>
          )}
        </div>
      </Link>
    </motion.li>
  );
}
