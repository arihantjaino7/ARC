"use server";

// Server actions for creating a community (Community Step C2,
// docs/PLAN-COMMUNITY.md). Reuses challenges/challenge_participants/
// challenge_rules/challenge_rule_targets unchanged (kind='community',
// already supported since step12_challenges.sql) — this file only adds the
// communities/community_members rows on top, same write order the plan lays
// out: the challenge + its rules + the admin's own participation, THEN the
// community row pointing at it, THEN the admin's own membership row.

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { dailyScores, findSuspiciousStreaks, groupAggregate, rollupChallenge } from "@/lib/challenges/rollup";
import {
  DATE_RE,
  resolveRule,
  ruleRowFields,
  validateRule,
  type RawResolvableRule,
  type RuleInput,
  type RuleLog,
} from "@/lib/challenges/types";
import { shiftDate } from "@/lib/time/day";
import type { ScoredGoal } from "@/lib/scoring/types";
import type { CommunityDetail, CommunityInvitePreview, CommunityVisibility, LeaderboardResult } from "./types";

export type CreateCommunityInput = {
  name: string;
  description: string | null;
  visibility: CommunityVisibility;
  startDate: string;
  endDate: string;
  rules: RuleInput[];
};

export type CreateCommunityResult = { error: string } | { communityId: string };

export async function createCommunity(input: CreateCommunityInput): Promise<CreateCommunityResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You're not logged in." };

  const name = input.name.trim();
  if (!name || name.length > 60) return { error: "Enter a community name, up to 60 characters." };

  const description = input.description?.trim() || null;
  if (description && description.length > 500) return { error: "Description must be 500 characters or fewer." };

  if (input.visibility !== "public" && input.visibility !== "private") {
    return { error: "Choose whether the community is public or private." };
  }

  if (!DATE_RE.test(input.startDate) || !DATE_RE.test(input.endDate)) {
    return { error: "Enter valid start and end dates." };
  }
  if (input.endDate < input.startDate) return { error: "End date must be on or after the start date." };

  if (!Array.isArray(input.rules) || input.rules.length === 0 || input.rules.length > 8) {
    return { error: "Add between 1 and 8 rules." };
  }
  for (const rule of input.rules) {
    const ruleError = validateRule(rule);
    if (ruleError) return { error: ruleError };
    // A community's rules are the admin's template, not a two-person
    // negotiation — every rule is one shared number for everyone. See
    // editCommunityRule's own comment for the same rule enforced on later
    // admin edits.
    if (rule.scope !== "shared") {
      return { error: "Community rules only support a shared number for everyone — there's no \"each sets their own\" in a community." };
    }
  }

  const { data: challenge, error: challengeError } = await supabase
    .from("challenges")
    .insert({
      kind: "community",
      name,
      created_by: user.id,
      start_date: input.startDate,
      end_date: input.endDate,
      status: "draft",
      // Blind mode defaults off for communities: docs/PLAN-COMMUNITY.md Step
      // C5's own recommendation — "you can't see your buddy's number" reads
      // very differently against a whole leaderboard, where the leaderboard
      // IS the point. The per-challenge toggle still exists in the data
      // model if that default is ever revisited.
      settings: { blind_mode: false },
    })
    .select("id")
    .single();

  if (challengeError || !challenge) {
    return { error: challengeError?.message ?? "Could not create the challenge." };
  }
  const challengeId = challenge.id as string;

  const { error: adminParticipantError } = await supabase.from("challenge_participants").insert({
    challenge_id: challengeId,
    user_id: user.id,
    role: "owner",
    status: "accepted",
    joined_at: new Date().toISOString(),
  });
  if (adminParticipantError) return { error: adminParticipantError.message };

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

  const { error: statusError } = await supabase
    .from("challenges")
    .update({ status: "active" })
    .eq("id", challengeId)
    .eq("created_by", user.id);
  if (statusError) return { error: statusError.message };

  const { data: community, error: communityError } = await supabase
    .from("communities")
    .insert({
      name,
      description,
      visibility: input.visibility,
      admin_id: user.id,
      template_challenge_id: challengeId,
    })
    .select("id")
    .single();

  if (communityError || !community) {
    return { error: communityError?.message ?? "Could not create the community." };
  }
  const communityId = community.id as string;

  // Allowed by step19_community_create.sql's narrow insert policy: the
  // community's own admin adding themselves, and only themselves.
  const { error: memberError } = await supabase.from("community_members").insert({
    community_id: communityId,
    user_id: user.id,
    role: "admin",
    status: "member",
    joined_at: new Date().toISOString(),
  });
  if (memberError) return { error: memberError.message };

  revalidatePath("/community");

  return { communityId };
}

// ---------------------------------------------------------------------------
// Community page: what communities the current user belongs to
// ---------------------------------------------------------------------------
// Discovery of OTHER public communities, and joining, is Step C3's job — this
// is just "what am I already in", the same narrow scope
// getMyChallengesByBuddy() has for Buddies before its own discovery step.

export type MyCommunitySummary = {
  id: string;
  name: string;
  visibility: CommunityVisibility;
  memberRole: "admin" | "member";
};

export async function getMyCommunities(): Promise<MyCommunitySummary[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data: memberships } = await supabase
    .from("community_members")
    .select("community_id, role")
    .eq("user_id", user.id)
    .eq("status", "member");

  const ids = (memberships ?? []).map((m) => m.community_id as string);
  if (ids.length === 0) return [];

  const { data: communities } = await supabase.from("communities").select("id, name, visibility").in("id", ids);

  const roleById = new Map((memberships ?? []).map((m) => [m.community_id as string, m.role as "admin" | "member"]));

  return (communities ?? []).map((c) => ({
    id: c.id as string,
    name: c.name as string,
    visibility: c.visibility as CommunityVisibility,
    memberRole: roleById.get(c.id as string) ?? "member",
  }));
}

// ---------------------------------------------------------------------------
// Discovery and joining (Community Step C3)
// ---------------------------------------------------------------------------

export type BrowsableCommunity = { id: string; name: string; description: string | null };

/** Public communities the current user isn't already in (or running). */
export async function getBrowsableCommunities(): Promise<BrowsableCommunity[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data: mine } = await supabase
    .from("community_members")
    .select("community_id")
    .eq("user_id", user.id)
    .in("status", ["member", "requested"]);
  const excluded = new Set((mine ?? []).map((m) => m.community_id as string));

  const { data } = await supabase
    .from("communities")
    .select("id, name, description, admin_id")
    .eq("visibility", "public")
    .order("created_at", { ascending: false })
    .limit(50);

  return (data ?? [])
    .filter((c) => c.admin_id !== user.id && !excluded.has(c.id as string))
    .map((c) => ({
      id: c.id as string,
      name: c.name as string,
      description: (c.description as string | null) ?? null,
    }));
}

export type CommunitySearchResult = BrowsableCommunity & { visibility: CommunityVisibility };

/**
 * Find a community by name, public or private (docs/PLAN-COMMUNITY.md's own
 * Step C2 note: private communities are "found and requested, not linked" —
 * an invite link is deferred to phase 2). Deliberately narrower than a full
 * listing: name/description/visibility only, never the roster or rules.
 */
export async function searchCommunities(query: string): Promise<CommunitySearchResult[]> {
  const q = query.trim();
  if (!q) return [];

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase.rpc("search_communities", { p_query: q });
  if (error || !data) return [];
  return data as CommunitySearchResult[];
}

/** One community's detail: rules, membership status, and (member/admin-only) the roster. */
export async function getCommunityDetail(communityId: string): Promise<CommunityDetail> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("community_detail", { p_community_id: communityId });

  if (error || !data || (data as { error?: string }).error) return { error: "not_found" };
  return data as CommunityDetail;
}

export type JoinTargetInput = { ruleId: string; target?: number | null; min?: number | null; max?: number | null };
export type JoinCommunityResult = { error: string } | { status: "joined" | "requested" };

export async function joinCommunity(communityId: string, ownTargets: JoinTargetInput[]): Promise<JoinCommunityResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You're not logged in." };

  const { data, error } = await supabase.rpc("join_community", {
    p_community_id: communityId,
    p_own_targets: ownTargets.map((t) => ({
      ruleId: t.ruleId,
      target: t.target ?? null,
      min: t.min ?? null,
      max: t.max ?? null,
    })),
  });

  if (error) return { error: error.message };

  revalidatePath("/community");
  revalidatePath(`/community/${communityId}`);
  return data as { status: "joined" | "requested" };
}

// ---------------------------------------------------------------------------
// Approvals and membership management (Community Step C4)
// ---------------------------------------------------------------------------
// Plain async functions, not useActionState forms — one-click actions with no
// fields to fill in, same shape as goals/actions.ts's deleteGoal and
// friends/actions.ts's respondToFriendRequest/cancelFriendRequest.

export async function respondToJoinRequest(communityId: string, userId: string, approve: boolean): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  await supabase.rpc("respond_to_join_request", {
    p_community_id: communityId,
    p_user_id: userId,
    p_approve: approve,
  });
  revalidatePath(`/community/${communityId}`);
}

export async function removeCommunityMember(communityId: string, userId: string): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  await supabase.rpc("remove_community_member", { p_community_id: communityId, p_user_id: userId });
  revalidatePath(`/community/${communityId}`);
}

export async function leaveCommunity(communityId: string): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  await supabase.rpc("leave_community", { p_community_id: communityId });
  revalidatePath("/community");
  revalidatePath(`/community/${communityId}`);
}

// ---------------------------------------------------------------------------
// The leaderboard (Community Step C5)
// ---------------------------------------------------------------------------
// community_leaderboard (supabase/step21_leaderboard.sql) does the one thing
// a plain RLS policy can't: read every member's logged values while
// enforcing blind mode server-side. Everything about turning those values
// into scores stays in TypeScript — resolveRule/rollupChallenge/
// groupAggregate are already written (and, for rollupChallenge, already
// unit-tested by the buddy scoreboard) — this function's only job is
// reshaping the RPC's JSON and calling them, same shape as
// challenges/actions.ts's getScoreboard().

type RawLeaderboardMember = {
  userId: string;
  label: string;
  role: "admin" | "member";
  isCaller: boolean;
  todayLogged: boolean;
  trustScore: number;
  logsByMetric: Record<string, Record<string, number | boolean>>;
  badges: { late: number; edited: number; flagged: number };
};

type RawLeaderboard =
  | { error: string }
  | {
      communityId: string;
      challengeId: string;
      name: string;
      startDate: string;
      endDate: string;
      blindMode: boolean;
      callerToday: string;
      rules: RawResolvableRule[];
      members: RawLeaderboardMember[];
    };

export async function getCommunityLeaderboard(communityId: string): Promise<LeaderboardResult | { error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You're not logged in." };

  const { data, error } = await supabase.rpc("community_leaderboard", { p_community_id: communityId });
  if (error) return { error: error.message };

  const raw = data as RawLeaderboard;
  if ("error" in raw) {
    return {
      error:
        raw.error === "not_member"
          ? "You're not part of this community."
          : raw.error === "no_challenge"
            ? "This community has no challenge yet."
            : "That community could not be found.",
    };
  }

  const rangeEnd = raw.endDate < raw.callerToday ? raw.endDate : raw.callerToday;
  const callerLoggedToday = raw.members.find((m) => m.isCaller)?.todayLogged ?? false;
  // Same 30-day clip as getScoreboard()'s heat strip — nothing here needs
  // more than a month of daily cells to be useful.
  const stripStart = raw.startDate < shiftDate(rangeEnd, -29) ? shiftDate(rangeEnd, -29) : raw.startDate;

  const members = raw.members.map((m) => {
    const resolvedRules = raw.rules.map((r) => resolveRule(r, m.userId));

    const logsByMetric: Record<string, RuleLog> = {};
    for (const rule of raw.rules) {
      logsByMetric[rule.metricKey] = (m.logsByMetric[rule.metricKey] ?? {}) as RuleLog;
    }

    const { total, perRule } = rollupChallenge(resolvedRules, logsByMetric, raw.startDate, raw.startDate, rangeEnd);
    const strip = dailyScores(resolvedRules, logsByMetric, stripStart, rangeEnd);

    // Same pattern as getScoreboard(): findSuspiciousStreaks stays in
    // TypeScript, computed here rather than duplicated in SQL.
    const suspicious = raw.rules.reduce((count, rule) => {
      if (rule.shape === "boolean") return count;
      return count + (findSuspiciousStreaks(logsByMetric[rule.metricKey] ?? {}).length > 0 ? 1 : 0);
    }, 0);

    return {
      userId: m.userId,
      label: m.label,
      role: m.role,
      isCaller: m.isCaller,
      todayLogged: m.todayLogged,
      todayHidden: raw.blindMode && !m.isCaller && !callerLoggedToday,
      total,
      perRule: perRule as Record<string, ScoredGoal>,
      heatStrip: Object.entries(strip).map(([date, score]) => ({ date, score })),
      badges: { ...m.badges, suspicious },
      trustScore: m.trustScore,
    };
  });

  // Ranked by total, highest first — the leaderboard's whole point.
  members.sort((a, b) => b.total - a.total);

  return {
    communityId: raw.communityId,
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
    members,
    groupAggregate: groupAggregate(members.map((m) => m.total)),
  };
}

// ---------------------------------------------------------------------------
// The invite link (feature request: "invite anyone through a link")
// ---------------------------------------------------------------------------
// A plain RLS-scoped table (supabase/step22_community_invite.sql) — unlike
// joining itself, creating/revoking a link only ever touches one row the
// admin already owns, so no security-definer RPC is needed for those two;
// the preview and accept steps do need one, same reasoning as the buddy
// invite flow (a non-member visitor reading/joining a community that plain
// RLS wouldn't otherwise let them touch yet).

export type CommunityInviteLink = { token: string };

/** The admin's one live (non-revoked) invite link, creating it if none exists yet. */
export async function getOrCreateCommunityInviteLink(communityId: string): Promise<CommunityInviteLink | { error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You're not logged in." };

  const { data: existing } = await supabase
    .from("community_invites")
    .select("token")
    .eq("community_id", communityId)
    .is("revoked_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing) return { token: existing.token as string };

  const { data: created, error } = await supabase
    .from("community_invites")
    .insert({ community_id: communityId, created_by: user.id })
    .select("token")
    .single();

  if (error || !created) return { error: error?.message ?? "Could not create an invite link." };
  return { token: created.token as string };
}

/** Revokes the community's current live invite link and issues a fresh one. */
export async function regenerateCommunityInviteLink(communityId: string): Promise<CommunityInviteLink | { error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You're not logged in." };

  const { error: revokeError } = await supabase
    .from("community_invites")
    .update({ revoked_at: new Date().toISOString() })
    .eq("community_id", communityId)
    .is("revoked_at", null);
  if (revokeError) return { error: revokeError.message };

  const { data: created, error } = await supabase
    .from("community_invites")
    .insert({ community_id: communityId, created_by: user.id })
    .select("token")
    .single();

  if (error || !created) return { error: error?.message ?? "Could not create a new invite link." };
  revalidatePath(`/community/${communityId}`);
  return { token: created.token as string };
}

export async function getCommunityInvitePreview(token: string): Promise<CommunityInvitePreview> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("community_invite_preview", { p_token: token });

  if (error || !data) return { error: "not_found" };
  return data as CommunityInvitePreview;
}

export type AcceptCommunityInviteResult = { error: string } | { communityId: string };

export async function acceptCommunityInvite(token: string): Promise<AcceptCommunityInviteResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You're not logged in." };

  const { data, error } = await supabase.rpc("accept_community_invite", { p_token: token });
  if (error) return { error: error.message };

  const result = data as { communityId: string };
  revalidatePath("/community");
  revalidatePath(`/community/${result.communityId}`);
  return result;
}

// ---------------------------------------------------------------------------
// Admin-direct rule edits (Community Step C6)
// ---------------------------------------------------------------------------
// docs/PLAN-COMMUNITY.md Step C6: members join a template read-only, so the
// admin edits it directly — no propose/approve dance like buddy change
// requests. admin_edit_community_rule (step21_leaderboard.sql) still closes
// the old rule at today and starts any replacement tomorrow — never
// retroactive, same anti-cheat rule #1 the buddy flow enforces. Only
// scope='shared' is supported here (checked below, not in SQL, per this
// project's "scoring/validation stays in TypeScript" convention) — see the
// SQL file's header comment for why scope='own' community edits are a
// deliberately deferred gap, not a silent omission.

export type EditCommunityRuleInput =
  | { kind: "remove"; ruleId: string }
  | { kind: "add"; rule: RuleInput }
  | { kind: "edit"; ruleId: string; rule: RuleInput };

export async function editCommunityRule(
  communityId: string,
  input: EditCommunityRuleInput,
): Promise<{ error: string } | { ok: true }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You're not logged in." };

  if (input.kind !== "remove") {
    const ruleError = validateRule(input.rule);
    if (ruleError) return { error: ruleError };
    if (input.rule.scope !== "shared") {
      return { error: "Community rule edits only support a shared number for everyone right now." };
    }
  }

  const fields = input.kind !== "remove" ? ruleRowFields(input.rule) : null;

  const { error } = await supabase.rpc("admin_edit_community_rule", {
    p_community_id: communityId,
    p_kind: input.kind,
    p_rule_id: input.kind !== "add" ? input.ruleId : null,
    p_metric_key: input.kind !== "remove" ? input.rule.metricKey : null,
    p_shape: input.kind !== "remove" ? input.rule.shape : null,
    p_target: fields?.target ?? null,
    p_min: fields?.min ?? null,
    p_max: fields?.max ?? null,
    p_weight: input.kind !== "remove" ? input.rule.weight : null,
    p_period: input.kind !== "remove" ? input.rule.period : null,
    p_schedule: input.kind !== "remove" ? input.rule.schedule : null,
    p_requires_proof: input.kind !== "remove" ? input.rule.requiresProof : false,
  });

  if (error) return { error: error.message };

  revalidatePath(`/community/${communityId}`);
  return { ok: true };
}
