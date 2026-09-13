"use server";

// Server actions for the challenge builder (V2 Step 6) and the invite-link
// flow (V2 Step 7). Called directly from client components as plain async
// functions (not useActionState) — the wizard's state doesn't live in a
// single <form>, so there's no FormData to hand these; see
// src/app/(app)/buddies/new/NewChallengeWizard.tsx.

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { GoalShape } from "@/lib/goals/types";
import type { ScoredGoal } from "@/lib/scoring/types";
import { daysBetween, localDate, shiftDate } from "@/lib/time/day";
import { dailyScores, findSuspiciousStreaks, rollupChallenge } from "./rollup";
import { DATE_RE, resolveRule, ruleRowFields, validateRule } from "./types";
import type {
  ChangeRequest,
  ChangeRequestKind,
  GymSchedule,
  RawResolvableRule,
  RecentEntry,
  RuleInput,
  RuleLog,
  RulePeriod,
  RuleScope,
  RuleTarget,
  ScoreboardResult,
  StakeEntry,
  VerificationState,
} from "./types";

export type { RuleInput };

export type CreateChallengeInput = {
  buddyUserId: string | null;
  name: string;
  startDate: string;
  endDate: string;
  stakeText: string | null;
  blindMode: boolean;
  rules: RuleInput[];
};

export type CreateChallengeResult =
  | { error: string }
  | { challengeId: string; token: string };

export async function createChallenge(input: CreateChallengeInput): Promise<CreateChallengeResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "You're not logged in." };

  const name = input.name.trim();
  if (!name || name.length > 60) return { error: "Enter a challenge name, up to 60 characters." };
  if (!DATE_RE.test(input.startDate) || !DATE_RE.test(input.endDate)) {
    return { error: "Enter valid start and end dates." };
  }
  if (input.endDate < input.startDate) return { error: "End date must be on or after the start date." };
  if (input.stakeText && input.stakeText.length > 200) return { error: "Stake must be 200 characters or fewer." };
  if (!Array.isArray(input.rules) || input.rules.length === 0 || input.rules.length > 8) {
    return { error: "Add between 1 and 8 rules." };
  }
  for (const rule of input.rules) {
    const ruleError = validateRule(rule);
    if (ruleError) return { error: ruleError };
  }

  if (input.buddyUserId) {
    if (input.buddyUserId === user.id) return { error: "You can't challenge yourself." };
    const { data: friendship } = await supabase
      .from("friend_requests")
      .select("id")
      .eq("status", "accepted")
      .or(
        `and(requester_id.eq.${user.id},addressee_id.eq.${input.buddyUserId}),and(requester_id.eq.${input.buddyUserId},addressee_id.eq.${user.id})`,
      )
      .maybeSingle();
    if (!friendship) return { error: "That's not one of your buddies." };

    // One live buddy challenge per pair at a time (product decision, not a
    // technical limit) — accept_challenge_invite is the actual gate (it also
    // covers the link-only path below, where no buddy is picked yet), this
    // is just an earlier, friendlier error for the "pick an existing buddy"
    // path. "Live" excludes anything past its own end_date, same reasoning
    // as accept_challenge_invite's — otherwise rematchChallenge (which calls
    // this function with the same buddyUserId right after the old challenge
    // ends) would be blocked by its own predecessor.
    const [{ data: myRows }, { data: buddyRows }] = await Promise.all([
      supabase.from("challenge_participants").select("challenge_id").eq("user_id", user.id),
      supabase.from("challenge_participants").select("challenge_id").eq("user_id", input.buddyUserId),
    ]);
    const buddyChallengeIds = new Set((buddyRows ?? []).map((r) => r.challenge_id as string));
    const sharedIds = (myRows ?? [])
      .map((r) => r.challenge_id as string)
      .filter((id) => buddyChallengeIds.has(id));

    if (sharedIds.length > 0) {
      const todayIso = new Date().toISOString().slice(0, 10);
      const { data: liveOnes } = await supabase
        .from("challenges")
        .select("id")
        .in("id", sharedIds)
        .eq("kind", "buddy")
        .in("status", ["pending", "active"])
        .gte("end_date", todayIso)
        .limit(1);
      if (liveOnes && liveOnes.length > 0) {
        return { error: "You already have a challenge running with them. Let it finish first." };
      }
    }
  }

  const { data: challenge, error: challengeError } = await supabase
    .from("challenges")
    .insert({
      kind: "buddy",
      name,
      created_by: user.id,
      start_date: input.startDate,
      end_date: input.endDate,
      stake_text: input.stakeText || null,
      status: "draft",
      settings: { blind_mode: input.blindMode },
    })
    .select("id")
    .single();

  if (challengeError || !challenge) {
    return { error: challengeError?.message ?? "Could not create the challenge." };
  }
  const challengeId = challenge.id as string;

  const { error: ownerError } = await supabase.from("challenge_participants").insert({
    challenge_id: challengeId,
    user_id: user.id,
    role: "owner",
    status: "accepted",
    joined_at: new Date().toISOString(),
  });
  if (ownerError) return { error: ownerError.message };

  if (input.buddyUserId) {
    const { error: buddyError } = await supabase.from("challenge_participants").insert({
      challenge_id: challengeId,
      user_id: input.buddyUserId,
      role: "member",
      status: "invited",
    });
    if (buddyError) return { error: buddyError.message };
  }

  for (const rule of input.rules) {
    const fields = ruleRowFields(rule);
    const { data: ruleRow, error: ruleError } = await supabase
      .from("challenge_rules")
      .insert({
        challenge_id: challengeId,
        metric_key: rule.metricKey,
        shape: rule.shape,
        scope: rule.scope,
        target: fields.target,
        min: fields.min,
        max: fields.max,
        weight: rule.weight,
        period: rule.period,
        schedule: rule.schedule,
        requires_proof: rule.requiresProof,
        effective_from: input.startDate,
        created_by: user.id,
      })
      .select("id")
      .single();

    if (ruleError || !ruleRow) {
      return { error: ruleError?.message ?? "Could not save a rule." };
    }

    if (rule.scope === "own") {
      const { error: targetError } = await supabase.from("challenge_rule_targets").insert({
        rule_id: ruleRow.id,
        user_id: user.id,
        target: rule.shape === "range" ? null : rule.target,
        min: rule.shape === "range" ? rule.min : null,
        max: rule.shape === "range" ? rule.max : null,
      });
      if (targetError) return { error: targetError.message };
    }
  }

  const { data: invite, error: inviteError } = await supabase
    .from("challenge_invites")
    .insert({ challenge_id: challengeId, created_by: user.id })
    .select("token")
    .single();

  if (inviteError || !invite) {
    return { error: inviteError?.message ?? "Could not create an invite link." };
  }

  const { error: statusError } = await supabase
    .from("challenges")
    .update({ status: "pending" })
    .eq("id", challengeId)
    .eq("created_by", user.id);
  if (statusError) return { error: statusError.message };

  revalidatePath("/buddies");

  return { challengeId, token: invite.token as string };
}

// ---------------------------------------------------------------------------
// Invite links (V2 Step 7)
// ---------------------------------------------------------------------------

export type InviteRule = {
  id: string;
  metricKey: string;
  shape: GoalShape;
  scope: RuleScope;
  target: number | null;
  min: number | null;
  max: number | null;
  weight: number;
  period: RulePeriod;
  schedule: GymSchedule | null;
  requiresProof: boolean;
};

export type InvitePreview =
  | { error: "not_found" }
  | {
      challengeId: string;
      name: string;
      status: string;
      startDate: string;
      endDate: string;
      stakeText: string | null;
      settings: { blind_mode?: boolean };
      inviterLabel: string;
      rules: InviteRule[];
      expired: boolean;
      full: boolean;
      isOwnInvite: boolean;
      alreadyJoined: boolean;
      /** One live buddy challenge per pair (product decision) — true when the
       *  viewer already has a non-ended one with this challenge's creator. */
      buddyAlreadyBusy: boolean;
    };

export async function getInvitePreview(token: string): Promise<InvitePreview> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("challenge_invite_preview", { p_token: token });

  if (error || !data) return { error: "not_found" };
  return data as InvitePreview;
}

export type OwnTargetInput = { ruleId: string; target?: number | null; min?: number | null; max?: number | null };

export type AcceptInviteResult = { error: string } | { challengeId: string };

export async function acceptInvite(token: string, ownTargets: OwnTargetInput[]): Promise<AcceptInviteResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You're not logged in." };

  const { data, error } = await supabase.rpc("accept_challenge_invite", {
    p_token: token,
    p_own_targets: ownTargets.map((t) => ({
      ruleId: t.ruleId,
      target: t.target ?? null,
      min: t.min ?? null,
      max: t.max ?? null,
    })),
  });

  if (error) return { error: error.message };

  revalidatePath("/buddies");
  return { challengeId: data as string };
}

export async function declineInvite(token: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You're not logged in." };

  const { error } = await supabase.rpc("decline_challenge_invite", { p_token: token });
  if (error) return { error: error.message };

  revalidatePath("/buddies");
  return {};
}

// ---------------------------------------------------------------------------
// Buddies page: what challenges exist with each buddy
// ---------------------------------------------------------------------------

export type BuddyChallengeSummary = {
  id: string;
  name: string;
  status: string;
  startDate: string;
  endDate: string;
};

/**
 * Every buddy challenge the current user is in, keyed by the *other*
 * participant's user id. Plain client-safe queries under existing RLS — no
 * new RPC needed, unlike the invite-preview flow, because both sides are
 * already participants by the time this is read.
 */
export async function getMyChallengesByBuddy(): Promise<Record<string, BuddyChallengeSummary[]>> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return {};

  const { data: mine } = await supabase
    .from("challenge_participants")
    .select("challenge_id")
    .eq("user_id", user.id);

  const challengeIds = (mine ?? []).map((row) => row.challenge_id as string);
  if (challengeIds.length === 0) return {};

  const [{ data: others }, { data: challenges }] = await Promise.all([
    supabase
      .from("challenge_participants")
      .select("challenge_id, user_id")
      .in("challenge_id", challengeIds)
      .neq("user_id", user.id),
    supabase
      .from("challenges")
      .select("id, name, status, start_date, end_date")
      .in("id", challengeIds)
      .eq("kind", "buddy"),
  ]);

  const byId = new Map((challenges ?? []).map((c) => [c.id as string, c]));
  const result: Record<string, BuddyChallengeSummary[]> = {};

  for (const row of others ?? []) {
    const c = byId.get(row.challenge_id as string);
    if (!c) continue;
    const list = (result[row.user_id as string] ??= []);
    list.push({
      id: c.id as string,
      name: c.name as string,
      status: c.status as string,
      startDate: c.start_date as string,
      endDate: c.end_date as string,
    });
  }

  return result;
}

/** Every buddy challenge between the current user and one specific buddy, newest first. */
export async function getChallengesWithBuddy(buddyUserId: string): Promise<BuddyChallengeSummary[]> {
  const byBuddy = await getMyChallengesByBuddy();
  return byBuddy[buddyUserId] ?? [];
}

// ---------------------------------------------------------------------------
// The scoreboard (V2 Step 8)
// ---------------------------------------------------------------------------
// The RPC (supabase/step14_scoreboard.sql) does the one thing a plain RLS
// policy can't: read both participants' logged values while enforcing blind
// mode server-side. Everything about turning those values into scores stays
// in TypeScript — rollupChallenge/dailyScores from ./rollup are already
// written and unit-tested for exactly this, so this function's only job is
// reshaping the RPC's JSON into ResolvedRule[]/RuleLog and calling them.

type RawScoreboardRule = RawResolvableRule;

type RawScoreboardParticipant = {
  userId: string;
  label: string;
  isCaller: boolean;
  todayLogged: boolean;
  trustScore: number;
  gracedDates: string[];
  logsByMetric: Record<string, Record<string, number | boolean>>;
  badges: { late: number; edited: number; flagged: number; disputed: number };
};

type RawScoreboard =
  | { error: string }
  | {
      challengeId: string;
      name: string;
      startDate: string;
      endDate: string;
      blindMode: boolean;
      callerToday: string;
      rules: RawScoreboardRule[];
      participants: RawScoreboardParticipant[];
    };

export async function getScoreboard(challengeId: string): Promise<ScoreboardResult | { error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You're not logged in." };

  const { data, error } = await supabase.rpc("challenge_scoreboard", { p_challenge_id: challengeId });
  if (error) return { error: error.message };

  const raw = data as RawScoreboard;
  if ("error" in raw) {
    return {
      error:
        raw.error === "not_participant"
          ? "You're not part of this challenge."
          : "That challenge could not be found.",
    };
  }

  const rangeEnd = raw.endDate < raw.callerToday ? raw.endDate : raw.callerToday;
  const strippedRangeStart =
    raw.startDate < shiftDate(rangeEnd, -29) ? shiftDate(rangeEnd, -29) : raw.startDate;

  const caller = raw.participants.find((p) => p.isCaller);
  const callerLoggedToday = caller?.todayLogged ?? false;

  const weekStart = raw.startDate < shiftDate(rangeEnd, -6) ? shiftDate(rangeEnd, -6) : raw.startDate;

  const participants = raw.participants.map((p) => {
    const resolvedRules = raw.rules.map((r) => resolveRule(r, p.userId));

    const logsByMetric: Record<string, RuleLog> = {};
    for (const rule of raw.rules) {
      logsByMetric[rule.metricKey] = (p.logsByMetric[rule.metricKey] ?? {}) as RuleLog;
    }

    // Grace tokens (V2 Step 13) excuse a day the same way a rest day already
    // is — excluded from the denominator, not scored as a miss.
    const graced = new Set(p.gracedDates);

    const { total, perRule } = rollupChallenge(
      resolvedRules,
      logsByMetric,
      raw.startDate,
      raw.startDate,
      rangeEnd,
      graced,
    );
    const { total: weekTotal, perRule: weekPerRule } = rollupChallenge(
      resolvedRules,
      logsByMetric,
      raw.startDate,
      weekStart,
      rangeEnd,
      graced,
    );
    const strip = dailyScores(resolvedRules, logsByMetric, strippedRangeStart, rangeEnd, graced);

    // Anti-cheat layer 4's pattern check (V2 Step 11): a numeric metric held
    // at the exact same value for 14+ days running is a signal worth
    // surfacing, same footing as the DB-computed late/edited/flagged/disputed
    // counts — but it's pure TypeScript (findSuspiciousStreaks), so it's
    // computed here rather than duplicated in SQL.
    const suspicious = raw.rules.reduce((count, rule) => {
      if (rule.shape === "boolean") return count;
      return count + (findSuspiciousStreaks(logsByMetric[rule.metricKey] ?? {}).length > 0 ? 1 : 0);
    }, 0);

    return {
      userId: p.userId,
      label: p.label,
      isCaller: p.isCaller,
      todayLogged: p.todayLogged,
      todayHidden: raw.blindMode && !p.isCaller && !callerLoggedToday,
      total,
      perRule: perRule as Record<string, ScoredGoal>,
      heatStrip: Object.entries(strip).map(([date, score]) => ({ date, score })),
      badges: { ...p.badges, suspicious },
      trustScore: p.trustScore,
      weekTotal,
      weekPerRule: weekPerRule as Record<string, ScoredGoal>,
      gracedDates: p.gracedDates,
    };
  });

  return {
    challengeId: raw.challengeId,
    name: raw.name,
    startDate: raw.startDate,
    endDate: raw.endDate,
    blindMode: raw.blindMode,
    callerToday: raw.callerToday,
    rules: raw.rules.map((r) => ({
      id: r.id,
      metricKey: r.metricKey,
      shape: r.shape,
      weight: r.weight,
      period: r.period,
    })),
    participants,
  };
}

// ---------------------------------------------------------------------------
// Personal Dashboard (V2 Step 12): every active buddy challenge's live rules,
// so progress/page.tsx can union their metric keys into what's tracked today.
// ---------------------------------------------------------------------------

export type ActiveChallengeSummary = {
  id: string;
  name: string;
  /** No `kind` filter here on purpose (Community Step C6): a community
   * challenge is a challenge like any other to this function, so it flows
   * into /progress's tracked-metric union and (via `kind`) Home's matchup
   * section for free — see docs/PLAN-COMMUNITY.md's own "what Community gets
   * for free" note, which this function is the confirmation of. */
  kind: "buddy" | "community";
  metricKeys: string[];
};

export async function getMyActiveChallenges(): Promise<ActiveChallengeSummary[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data: mine } = await supabase
    .from("challenge_participants")
    .select("challenge_id")
    .eq("user_id", user.id)
    .eq("status", "accepted");

  const challengeIds = (mine ?? []).map((row) => row.challenge_id as string);
  if (challengeIds.length === 0) return [];

  const [{ data: challenges }, { data: rules }] = await Promise.all([
    supabase.from("challenges").select("id, name, kind").in("id", challengeIds).eq("status", "active"),
    supabase
      .from("challenge_rules")
      .select("challenge_id, metric_key")
      .in("challenge_id", challengeIds)
      .is("effective_to", null),
  ]);

  const activeIds = new Set((challenges ?? []).map((c) => c.id as string));
  const metricsByChallenge = new Map<string, Set<string>>();
  for (const rule of rules ?? []) {
    const id = rule.challenge_id as string;
    if (!activeIds.has(id)) continue;
    const set = metricsByChallenge.get(id) ?? new Set<string>();
    set.add(rule.metric_key as string);
    metricsByChallenge.set(id, set);
  }

  return (challenges ?? []).map((c) => ({
    id: c.id as string,
    name: c.name as string,
    kind: c.kind as "buddy" | "community",
    metricKeys: [...(metricsByChallenge.get(c.id as string) ?? [])],
  }));
}

// ---------------------------------------------------------------------------
// Propose and approve a change (V2 Step 10)
// ---------------------------------------------------------------------------
// challenge_rules' own RLS only lets created_by insert while status='draft'
// (step12_challenges.sql), so once a challenge is active every rule change
// goes through these two RPCs instead: propose_challenge_change records the
// request and notifies the other side; respond_challenge_change is the only
// path allowed to close out a rule and insert its replacement, and only after
// the OTHER participant (never the proposer) approves it. The replacement
// always starts tomorrow — never today — which is anti-cheat rule #1 holding
// even for changes made mid-challenge.

type ChangeRequestRow = {
  id: string;
  challenge_id: string;
  kind: ChangeRequestKind;
  rule_id: string | null;
  payload: { rule: RuleInput | null; ownTarget: RuleTarget | null };
  proposed_by: string;
  status: ChangeRequest["status"];
  responded_by: string | null;
  responded_at: string | null;
  effective_from: string | null;
  created_at: string;
};

function toChangeRequest(row: ChangeRequestRow): ChangeRequest {
  const rule = row.payload?.rule;
  return {
    id: row.id,
    challengeId: row.challenge_id,
    kind: row.kind,
    ruleId: row.rule_id,
    rule: rule
      ? {
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
        }
      : null,
    proposedBy: row.proposed_by,
    status: row.status,
    respondedBy: row.responded_by,
    respondedAt: row.responded_at,
    effectiveFrom: row.effective_from,
    createdAt: row.created_at,
  };
}

const CHANGE_REQUEST_SELECT =
  "id, challenge_id, kind, rule_id, payload, proposed_by, status, responded_by, responded_at, effective_from, created_at";

/** Every change request (any status) for one challenge, newest first. */
export async function getChangeRequestsForChallenge(challengeId: string): Promise<ChangeRequest[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("challenge_change_requests")
    .select(CHANGE_REQUEST_SELECT)
    .eq("challenge_id", challengeId)
    .order("created_at", { ascending: false });

  return (data ?? []).map((row) => toChangeRequest(row as ChangeRequestRow));
}

/** Pending-change-request counts per challenge, for the Buddies list badge. */
export async function getPendingChangeCounts(): Promise<Record<string, number>> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return {};

  const { data } = await supabase
    .from("challenge_change_requests")
    .select("challenge_id")
    .eq("status", "pending");

  const counts: Record<string, number> = {};
  for (const row of data ?? []) {
    const id = row.challenge_id as string;
    counts[id] = (counts[id] ?? 0) + 1;
  }
  return counts;
}

export type ProposeChangeInput = {
  challengeId: string;
  kind: ChangeRequestKind;
  /** Required for 'edit'/'remove' — the live rule being replaced/closed. */
  ruleId: string | null;
  /** Required for 'add'/'edit' — the new/replacement rule. */
  rule: RuleInput | null;
  /** The proposer's own number, when `rule.scope === 'own'`. */
  ownTarget: RuleTarget | null;
};

export async function proposeChange(
  input: ProposeChangeInput,
): Promise<{ error: string } | { requestId: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You're not logged in." };

  if (input.kind !== "remove") {
    if (!input.rule) return { error: "A rule is required." };
    const ruleError = validateRule(input.rule);
    if (ruleError) return { error: ruleError };
  }

  const { data, error } = await supabase.rpc("propose_challenge_change", {
    p_challenge_id: input.challengeId,
    p_kind: input.kind,
    p_rule_id: input.ruleId,
    p_rule: input.rule,
    p_own_target: input.ownTarget,
  });

  if (error) return { error: error.message };
  return { requestId: data as string };
}

export type RespondChangeResult =
  | { error: string }
  | { status: "approved"; effectiveFrom: string }
  | { status: "rejected" };

export async function respondToChange(
  requestId: string,
  approve: boolean,
  ownTarget: RuleTarget | null = null,
): Promise<RespondChangeResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You're not logged in." };

  const { data, error } = await supabase.rpc("respond_challenge_change", {
    p_request_id: requestId,
    p_approve: approve,
    p_own_target: ownTarget,
  });

  if (error) return { error: error.message };
  return data as RespondChangeResult;
}

// ---------------------------------------------------------------------------
// Buddy verification (V2 Step 11)
// ---------------------------------------------------------------------------
// verifications' own RLS (supabase/step16_verifications.sql) already enforces
// "not your own entry, within 48h, only a buddy you share a challenge with" —
// this action is a thin, unauthenticated-guarded wrapper, same shape as every
// other plain-RLS write in this codebase (createGoal, saveDayLog, ...).

type RawRecentEntry = {
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

export async function getRecentEntries(challengeId: string): Promise<RecentEntry[] | { error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You're not logged in." };

  const { data, error } = await supabase.rpc("challenge_recent_entries", { p_challenge_id: challengeId });
  if (error) return { error: error.message };

  const raw = data as { error: string } | { entries: RawRecentEntry[] };
  if ("error" in raw) return { error: "You're not part of this challenge." };

  return raw.entries;
}

export async function submitVerification(
  entryId: string,
  state: VerificationState,
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You're not logged in." };

  const { error } = await supabase.rpc("submit_verification", { p_entry_id: entryId, p_state: state });

  if (error) return { error: error.message };
  return {};
}

// ---------------------------------------------------------------------------
// Grace tokens (V2 Step 13) — one excused day per 30-day period per challenge.
// ---------------------------------------------------------------------------
// Enforcement lives entirely in supabase/step17_polish.sql: the unique index
// on (challenge_id, user_id, period) is what actually limits this to one per
// period, and the RLS insert policy is what requires log_date to be the
// caller's own current day — "must be declared before the day ends" isn't
// re-checked here, it can't be gotten around by calling this differently.

export async function declareGraceDay(challengeId: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You're not logged in." };

  const { data: profile } = await supabase
    .from("profiles")
    .select("timezone")
    .eq("id", user.id)
    .maybeSingle();
  const today = localDate(profile?.timezone ?? "UTC");

  const { error } = await supabase
    .from("challenge_grace_days")
    .insert({ challenge_id: challengeId, user_id: user.id, log_date: today });

  if (error) {
    if (error.code === "23505") {
      return { error: "You've already used your grace token for this 30-day period." };
    }
    return { error: error.message };
  }

  return {};
}

// ---------------------------------------------------------------------------
// The stake ledger (V2 Step 13) — who owes whom across completed challenges.
// ---------------------------------------------------------------------------
// The winner is decided from the same totals getScoreboard() already computes
// (scoring stays entirely in TypeScript, never duplicated in SQL) and written
// once, lazily, the first time either side opens the ledger after the
// challenge ends. Settling only ever flips the caller's own column, via
// mark_stake_settled — see supabase/step17_polish.sql for why that couldn't
// just be a plain UPDATE policy.

type StakeRow = {
  challenge_id: string;
  winner_id: string | null;
  loser_id: string | null;
  is_tie: boolean;
  winner_settled: boolean;
  loser_settled: boolean;
};

/** Every ended (end_date in the past), staked buddy challenge the user is part of. */
export async function getStakeLedger(): Promise<StakeEntry[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data: mine } = await supabase
    .from("challenge_participants")
    .select("challenge_id")
    .eq("user_id", user.id)
    .eq("status", "accepted");
  const challengeIds = (mine ?? []).map((row) => row.challenge_id as string);
  if (challengeIds.length === 0) return [];

  const today = new Date().toISOString().slice(0, 10);
  const { data: ended } = await supabase
    .from("challenges")
    .select("id, name, stake_text")
    .in("id", challengeIds)
    .eq("kind", "buddy")
    .not("stake_text", "is", null)
    .lt("end_date", today);
  if (!ended || ended.length === 0) return [];

  const { data: existing } = await supabase
    .from("challenge_stakes")
    .select("challenge_id, winner_id, loser_id, is_tie, winner_settled, loser_settled")
    .in(
      "challenge_id",
      ended.map((c) => c.id as string),
    );
  const stakeByChallenge = new Map((existing ?? []).map((s) => [s.challenge_id as string, s as StakeRow]));

  const results: StakeEntry[] = [];

  for (const challenge of ended) {
    const challengeId = challenge.id as string;
    const board = await getScoreboard(challengeId);
    if ("error" in board || board.participants.length < 2) continue;

    const you = board.participants.find((p) => p.isCaller)!;
    const them = board.participants.find((p) => !p.isCaller)!;

    let stake = stakeByChallenge.get(challengeId);
    if (!stake) {
      const isTie = you.total === them.total;
      const { data: inserted } = await supabase
        .from("challenge_stakes")
        .upsert(
          {
            challenge_id: challengeId,
            winner_id: isTie ? null : you.total > them.total ? user.id : them.userId,
            loser_id: isTie ? null : you.total > them.total ? them.userId : user.id,
            is_tie: isTie,
          },
          { onConflict: "challenge_id" },
        )
        .select("challenge_id, winner_id, loser_id, is_tie, winner_settled, loser_settled")
        .single();
      if (!inserted) continue;
      stake = inserted as StakeRow;
    }

    const iAmWinner = stake.winner_id === user.id;
    const mySettled = stake.is_tie || (iAmWinner ? stake.winner_settled : stake.loser_settled);
    const theirSettled = stake.is_tie || (iAmWinner ? stake.loser_settled : stake.winner_settled);

    results.push({
      challengeId,
      name: challenge.name as string,
      buddyLabel: them.label,
      stakeText: challenge.stake_text as string,
      isTie: stake.is_tie,
      iAmWinner,
      mySettled,
      theirSettled,
    });
  }

  return results;
}

export async function markStakeSettled(challengeId: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You're not logged in." };

  const { error } = await supabase.rpc("mark_stake_settled", { p_challenge_id: challengeId });
  if (error) return { error: error.message };

  return {};
}

// ---------------------------------------------------------------------------
// Rematch (V2 Step 13) — "run it back" clones the current ruleset in one tap.
// ---------------------------------------------------------------------------
// Deliberately just reshapes the old challenge's live rules into a
// CreateChallengeInput and hands off to createChallenge unchanged — every
// validation, insert order, and invite-link step it already does (Step 6)
// applies here too, so a rematch is exactly as safe as a from-scratch
// challenge, not a second, parallel write path.

export async function rematchChallenge(oldChallengeId: string): Promise<CreateChallengeResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You're not logged in." };

  const { data: oldChallenge } = await supabase
    .from("challenges")
    .select("id, name, start_date, end_date, stake_text, settings")
    .eq("id", oldChallengeId)
    .single();
  if (!oldChallenge) return { error: "Challenge not found." };

  const { data: participantRows } = await supabase
    .from("challenge_participants")
    .select("user_id")
    .eq("challenge_id", oldChallengeId)
    .neq("user_id", user.id);
  const buddyUserId = (participantRows?.[0]?.user_id as string | undefined) ?? null;

  const { data: liveRules } = await supabase
    .from("challenge_rules")
    .select("id, metric_key, shape, scope, target, min, max, weight, period, schedule, requires_proof")
    .eq("challenge_id", oldChallengeId)
    .is("effective_to", null);
  if (!liveRules || liveRules.length === 0) return { error: "That challenge has no rules to copy." };

  const ruleIds = liveRules.map((r) => r.id as string);
  const { data: myTargets } = await supabase
    .from("challenge_rule_targets")
    .select("rule_id, target, min, max")
    .eq("user_id", user.id)
    .in("rule_id", ruleIds);
  const targetsByRule = new Map((myTargets ?? []).map((t) => [t.rule_id as string, t]));

  const rules: RuleInput[] = liveRules.map((r) => {
    const scope = r.scope as RuleScope;
    const own = scope === "own" ? targetsByRule.get(r.id as string) : undefined;
    return {
      metricKey: r.metric_key as string,
      shape: r.shape as GoalShape,
      scope,
      target: scope === "own" ? (own?.target ?? null) : ((r.target as number | null) ?? null),
      min: scope === "own" ? (own?.min ?? null) : ((r.min as number | null) ?? null),
      max: scope === "own" ? (own?.max ?? null) : ((r.max as number | null) ?? null),
      weight: r.weight as number,
      period: r.period as RulePeriod,
      schedule: r.schedule as GymSchedule | null,
      requiresProof: r.requires_proof as boolean,
    };
  });

  const duration = daysBetween(oldChallenge.start_date as string, oldChallenge.end_date as string);
  const todayIso = new Date().toISOString().slice(0, 10);
  const startDate = shiftDate(todayIso, 1);
  const endDate = shiftDate(startDate, duration);

  return createChallenge({
    buddyUserId,
    name: `${oldChallenge.name as string} (rematch)`,
    startDate,
    endDate,
    stakeText: (oldChallenge.stake_text as string | null) ?? null,
    blindMode: Boolean((oldChallenge.settings as { blind_mode?: boolean } | null)?.blind_mode ?? true),
    rules,
  });
}
