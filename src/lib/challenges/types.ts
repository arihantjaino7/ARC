// Plain module: types shared by the challenge scoring rollup (rollup.ts)
// and, later, the challenge builder/actions. No DB, no React — same reason
// as every other feature's types.ts (see the Step 5 bugfix note in
// PROGRESS.md): a "use server" file may only export async functions, so
// anything a pure module or client component needs lives here instead.

import type { Goal, ScoredGoal } from "@/lib/scoring/types";
import type { GoalShape } from "@/lib/goals/types";
import type { Recommendations } from "@/lib/profile/recommendations";

export type RuleScope = "shared" | "own";
export type RulePeriod = "daily" | "weekly";

/** The gym-style scheduling modes from docs/PLAN-V2.md §2. */
export type GymSchedule =
  | { mode: "flexible"; sessionsPerWeek: number }
  | { mode: "fixed_days"; days: number[] }; // 0 (Sun) .. 6 (Sat), Date#getUTCDay()

/**
 * A challenge rule already resolved to ONE participant's own numbers.
 * scope='own' vs 'shared' (docs/PLAN-V2.md §2) is a DB-layer concern —
 * challenge_rule_targets is joined and picked before this type exists, so
 * the rollup itself never needs to know which scope produced these numbers.
 * Deliberately the same shape as Goal (src/lib/scoring/types.ts) plus what
 * the rollup needs to place it in time, so scoreGoal/calculateDayScore are
 * reused completely unchanged.
 */
export type ResolvedRule = Goal & {
  id: string;
  metricKey: string;
  weight: number;
  period: RulePeriod;
  schedule: GymSchedule | null;
  effectiveFrom: string; // YYYY-MM-DD
  effectiveTo: string | null; // inclusive last active day; null = still active
};

/** One rule's logged values, keyed by YYYY-MM-DD. Missing = not logged that day. */
export type RuleLog = Record<string, number | boolean>;

// ---------------------------------------------------------------------------
// The challenge builder (V2 Steps 5-6): wizard state and presets.
// ---------------------------------------------------------------------------

/**
 * One rule as edited in the builder, before it becomes a challenge_rules row.
 * `target`/`min`/`max` hold the *shared* number when scope='shared'; when
 * scope='own' they instead hold the creator's own number (written into
 * challenge_rule_targets, never onto the rule row itself — see
 * supabase/step12_challenges.sql's scope check constraint) and the other
 * participant sets theirs on the join screen.
 */
export type RuleDraft = {
  /** Stable client-side key for React lists/edits — not a DB id yet. */
  key: string;
  metricKey: string;
  label: string;
  shape: GoalShape;
  scope: RuleScope;
  target: number | null;
  min: number | null;
  max: number | null;
  weight: number;
  period: RulePeriod;
  schedule: GymSchedule | null;
  requiresProof: boolean;
  /**
   * Gym-schedule rules store their number in `schedule`, which has no
   * per-participant storage in challenge_rule_targets (only target/min/max
   * do) — so "each sets their own" isn't offered for these yet. Plain
   * numeric/boolean rules can freely toggle scope.
   */
  scopeLocked?: boolean;
};

/**
 * The fields a rule needs from a client (the wizard, a change proposal, or —
 * Community Step C2 — the community form) before it's validated and written.
 * Moved here (rather than living in challenges/actions.ts, where it was
 * defined through V2 Step 10) so communities/actions.ts can validate the
 * exact same way without either duplicating the logic or importing a value
 * from a "use server" file (which may only export async functions — see the
 * Step 5 bugfix note in PROGRESS.md).
 */
export type RuleInput = Pick<
  RuleDraft,
  "metricKey" | "shape" | "scope" | "target" | "min" | "max" | "weight" | "period" | "schedule" | "requiresProof"
>;

export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function validateRule(rule: RuleInput): string | null {
  if (!rule.metricKey || rule.metricKey.length > 40) return "Every rule needs a metric.";
  if (!(["at_least", "at_most", "range", "boolean"] as GoalShape[]).includes(rule.shape)) {
    return "Every rule needs a valid shape.";
  }
  if (!(["shared", "own"] as RuleScope[]).includes(rule.scope)) return "Every rule needs a scope.";
  if (!(["daily", "weekly"] as RulePeriod[]).includes(rule.period)) return "Every rule needs a period.";
  if (!Number.isInteger(rule.weight) || rule.weight < 1 || rule.weight > 5) {
    return "Rule weight must be between 1 and 5.";
  }

  if (rule.period === "weekly") {
    if (!rule.schedule || rule.schedule.mode !== "flexible") {
      return "A weekly rule needs a flexible sessions-per-week schedule.";
    }
    if (
      !Number.isInteger(rule.schedule.sessionsPerWeek) ||
      rule.schedule.sessionsPerWeek < 1 ||
      rule.schedule.sessionsPerWeek > 14
    ) {
      return "Sessions per week must be between 1 and 14.";
    }
  } else if (rule.schedule?.mode === "fixed_days") {
    const days = rule.schedule.days;
    if (!Array.isArray(days) || days.length === 0 || days.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) {
      return "Pick at least one valid weekday.";
    }
  }

  if (rule.shape === "boolean") return null;

  if (rule.shape === "at_least" || rule.shape === "at_most") {
    if (!Number.isFinite(rule.target) || (rule.target as number) <= 0) {
      return "Enter a target greater than 0 for every numeric rule.";
    }
  } else if (rule.shape === "range") {
    if (
      !Number.isFinite(rule.min) ||
      !Number.isFinite(rule.max) ||
      (rule.min as number) < 0 ||
      (rule.max as number) <= (rule.min as number)
    ) {
      return "Enter a valid range for every range rule — max must be greater than min.";
    }
  }

  return null;
}

/** The fields a challenge_rules row itself carries, per scope's DB check constraint. */
export function ruleRowFields(rule: RuleInput): { target: number | null; min: number | null; max: number | null } {
  if (rule.scope === "own") return { target: null, min: null, max: null };
  if (rule.shape === "range") return { target: null, min: rule.min, max: rule.max };
  if (rule.shape === "boolean") return { target: null, min: null, max: null };
  return { target: rule.target, min: null, max: null };
}

/**
 * A RuleDraft already carries every field RuleInput needs — this is a pure
 * reshape (drop the client-only key/label/scopeLocked), shared by every
 * screen that submits rules: the buddy wizard, the change-request panel, and
 * the community form.
 */
export function toRuleInput(rule: RuleDraft): RuleInput {
  return {
    metricKey: rule.metricKey,
    shape: rule.shape,
    scope: rule.scope,
    target: rule.target,
    min: rule.min,
    max: rule.max,
    weight: rule.weight,
    period: rule.period,
    schedule: rule.schedule,
    requiresProof: rule.requiresProof,
  };
}

export type ChallengePresetId = "consistency30" | "cut_together" | "step_war" | "custom";

export type ChallengePreset = {
  id: ChallengePresetId;
  name: string;
  blurb: string;
  buildRules: (rec: Recommendations | null) => RuleDraft[];
};

let draftKeySeq = 0;
function draftKey(): string {
  draftKeySeq += 1;
  return `draft-${draftKeySeq}`;
}

export const FLEXIBLE_GYM: GymSchedule = { mode: "flexible", sessionsPerWeek: 4 };

export const CHALLENGE_PRESETS: readonly ChallengePreset[] = [
  {
    id: "consistency30",
    name: "Consistency 30",
    blurb: "Gym 4x/week, plus sleep and water — a base fitness habit, not a race.",
    buildRules: (rec) => [
      {
        key: draftKey(),
        metricKey: "gym_done",
        label: "Gym",
        shape: "boolean",
        scope: "shared",
        scopeLocked: true,
        target: null,
        min: null,
        max: null,
        weight: 2,
        period: "weekly",
        schedule: { mode: "flexible", sessionsPerWeek: 4 },
        requiresProof: false,
      },
      {
        key: draftKey(),
        metricKey: "sleep_hours",
        label: "Sleep",
        shape: "at_least",
        scope: "own",
        target: rec?.sleep_hours ?? 8,
        min: null,
        max: null,
        weight: 1,
        period: "daily",
        schedule: null,
        requiresProof: false,
      },
      {
        key: draftKey(),
        metricKey: "water_ml",
        label: "Water",
        shape: "at_least",
        scope: "own",
        target: rec?.water_ml ?? 3000,
        min: null,
        max: null,
        weight: 1,
        period: "daily",
        schedule: null,
        requiresProof: false,
      },
    ],
  },
  {
    id: "cut_together",
    name: "Cut Together",
    blurb: "A calorie ceiling and a protein floor, each on your own numbers, plus gym.",
    buildRules: (rec) => [
      {
        key: draftKey(),
        metricKey: "calories",
        label: "Calories",
        shape: "at_most",
        scope: "own",
        target: rec?.calories ?? 2000,
        min: null,
        max: null,
        weight: 2,
        period: "daily",
        schedule: null,
        requiresProof: false,
      },
      {
        key: draftKey(),
        metricKey: "protein_g",
        label: "Protein",
        shape: "at_least",
        scope: "own",
        target: rec?.protein_g ?? 140,
        min: null,
        max: null,
        weight: 2,
        period: "daily",
        schedule: null,
        requiresProof: false,
      },
      {
        key: draftKey(),
        metricKey: "gym_done",
        label: "Gym",
        shape: "boolean",
        scope: "shared",
        scopeLocked: true,
        target: null,
        min: null,
        max: null,
        weight: 1,
        period: "weekly",
        schedule: { mode: "flexible", sessionsPerWeek: 3 },
        requiresProof: false,
      },
    ],
  },
  {
    id: "step_war",
    name: "Step War",
    blurb: "One shared step count. Whoever's closer to it, every day, wins.",
    buildRules: () => [
      {
        key: draftKey(),
        metricKey: "steps",
        label: "Steps",
        shape: "at_least",
        scope: "shared",
        target: 10000,
        min: null,
        max: null,
        weight: 1,
        period: "daily",
        schedule: null,
        requiresProof: false,
      },
    ],
  },
  {
    id: "custom",
    name: "Custom",
    blurb: "Start empty and add exactly the rules you two agree on.",
    buildRules: () => [],
  },
];

// ---------------------------------------------------------------------------
// The scoreboard (V2 Step 8): what getScoreboard() in actions.ts returns to
// the buddy detail screen (V2 Step 9). Deliberately just scores, a per-day
// strip, and aggregate badge counts — never raw log values or per-entry
// metadata about the other participant. See supabase/step14_scoreboard.sql's
// header comment for why that boundary sits where it does.
// ---------------------------------------------------------------------------

export type ScoreboardRuleSummary = {
  id: string;
  metricKey: string;
  shape: GoalShape;
  weight: number;
  period: RulePeriod;
};

export type ScoreboardBadgeCounts = {
  late: number;
  edited: number;
  flagged: number;
  /** Entries a buddy has flagged 'disputed' (V2 Step 11) — worth 0 until resolved. */
  disputed: number;
  /** Metrics currently mid a 14+ day identical-value streak (V2 Step 11's pattern check). */
  suspicious: number;
};

export type ScoreboardParticipant = {
  userId: string;
  label: string;
  isCaller: boolean;
  todayLogged: boolean;
  /** True when this participant's value for `callerToday` is currently withheld from the caller (blind mode, own day not yet logged). */
  todayHidden: boolean;
  total: number;
  perRule: Record<string, ScoredGoal>;
  /** One score per day from the challenge's start through `callerToday` (or its end, if earlier). `null` = rest day / not scorable, not a 0. */
  heatStrip: { date: string; score: number | null }[];
  badges: ScoreboardBadgeCounts;
  /** Consecutive clean verifications, global to the user (not scoped to this challenge). */
  trustScore: number;
  /** Overall score for just the trailing 7 days (clipped to the challenge start) — the weekly recap's headline number. */
  weekTotal: number;
  weekPerRule: Record<string, ScoredGoal>;
  /** Dates this participant has excused with a grace token (V2 Step 13) — at most one per 30-day period. */
  gracedDates: string[];
};

export type ScoreboardResult = {
  challengeId: string;
  name: string;
  startDate: string;
  endDate: string;
  blindMode: boolean;
  callerToday: string;
  rules: ScoreboardRuleSummary[];
  participants: ScoreboardParticipant[];
};

export function findPreset(id: ChallengePresetId): ChallengePreset {
  const preset = CHALLENGE_PRESETS.find((p) => p.id === id);
  if (!preset) throw new Error(`Unknown preset: ${id}`);
  return preset;
}

export function newCustomRule(metricKey: string, label: string, shape: GoalShape): RuleDraft {
  return {
    key: draftKey(),
    metricKey,
    label,
    shape,
    scope: shape === "boolean" ? "shared" : "own",
    scopeLocked: shape === "boolean",
    target: shape === "at_least" || shape === "at_most" ? 0 : null,
    min: shape === "range" ? 0 : null,
    max: shape === "range" ? 0 : null,
    weight: 1,
    period: shape === "boolean" ? "weekly" : "daily",
    schedule: shape === "boolean" ? FLEXIBLE_GYM : null,
    requiresProof: false,
  };
}

// ---------------------------------------------------------------------------
// Propose-and-approve changes (V2 Step 10): challenge_change_requests.
// ---------------------------------------------------------------------------

export type ChangeRequestKind = "add" | "edit" | "remove";
export type ChangeRequestStatus = "pending" | "approved" | "rejected";

/** The proposer's own number for a scope='own' add/edit — see RuleTargetInput in actions.ts. */
export type RuleTarget = { target: number | null; min: number | null; max: number | null };

export type ChangeRequest = {
  id: string;
  challengeId: string;
  kind: ChangeRequestKind;
  ruleId: string | null;
  /** The proposed replacement/new rule — null for kind='remove'. */
  rule: RuleTarget & {
    metricKey: string;
    shape: GoalShape;
    scope: RuleScope;
    weight: number;
    period: RulePeriod;
    schedule: GymSchedule | null;
    requiresProof: boolean;
  } | null;
  proposedBy: string;
  status: ChangeRequestStatus;
  respondedBy: string | null;
  respondedAt: string | null;
  effectiveFrom: string | null;
  createdAt: string;
};

// ---------------------------------------------------------------------------
// Buddy verification (V2 Step 11): the confirm/flag feed.
// ---------------------------------------------------------------------------

export type VerificationState = "ok" | "disputed";

export type RecentEntry = {
  entryId: string;
  userId: string;
  label: string;
  logDate: string;
  metricKey: string;
  value: number | boolean;
  loggedAt: string;
  isLate: boolean;
  implausible: boolean;
  myVerification: VerificationState | null;
};

// ---------------------------------------------------------------------------
// Polish (V2 Step 13): grace tokens and the stake ledger.
// docs/PLAN-V2.md §5.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Shared RPC-result reshaping: turning a raw challenge_rules row (as returned
// by challenge_scoreboard AND community_leaderboard — both SQL functions
// build the exact same rule JSON shape) into one participant's ResolvedRule.
// Lives here, not in challenges/actions.ts, so communities/actions.ts can use
// it too without importing a value from a "use server" file (see the Step 5
// bugfix note in PROGRESS.md).
// ---------------------------------------------------------------------------

export type RawRuleTargets = Record<string, { target: number | null; min: number | null; max: number | null } | undefined>;

export type RawResolvableRule = {
  id: string;
  metricKey: string;
  shape: import("@/lib/goals/types").GoalShape;
  scope: RuleScope;
  target: number | null;
  min: number | null;
  max: number | null;
  weight: number;
  period: RulePeriod;
  schedule: GymSchedule | null;
  effectiveFrom: string;
  effectiveTo: string | null;
  targets: RawRuleTargets;
};

/**
 * One challenge rule resolved to one participant's own numbers.
 * scope='own' rules with no target on file yet for this participant (they
 * haven't reached a join screen's own-target inputs) are pinned to a
 * far-future effective_from so rollupRule/dailyScores exclude them entirely
 * — the same "not yet effective" treatment a real future rule gets — rather
 * than scoring against a fabricated target of 0.
 */
export function resolveRule(rule: RawResolvableRule, userId: string): ResolvedRule {
  const own = rule.scope === "own" ? rule.targets[userId] : undefined;
  const missingOwnTarget = rule.scope === "own" && own === undefined;

  const base = {
    id: rule.id,
    metricKey: rule.metricKey,
    weight: rule.weight,
    period: rule.period,
    schedule: rule.schedule,
    effectiveFrom: missingOwnTarget ? "9999-12-31" : rule.effectiveFrom,
    effectiveTo: rule.effectiveTo,
  };

  if (rule.shape === "boolean") return { ...base, shape: "boolean" };
  if (rule.shape === "range") {
    const min = rule.scope === "own" ? (own?.min ?? 0) : (rule.min ?? 0);
    const max = rule.scope === "own" ? (own?.max ?? 0) : (rule.max ?? 0);
    return { ...base, shape: "range", min, max };
  }
  const target = rule.scope === "own" ? (own?.target ?? 0) : (rule.target ?? 0);
  return { ...base, shape: rule.shape, target };
}

/** One completed, staked challenge's outcome and settlement state, for the ledger. */
export type StakeEntry = {
  challengeId: string;
  name: string;
  buddyLabel: string;
  stakeText: string;
  isTie: boolean;
  /** Meaningless when `isTie` — nobody owes anybody. */
  iAmWinner: boolean;
  mySettled: boolean;
  theirSettled: boolean;
};
