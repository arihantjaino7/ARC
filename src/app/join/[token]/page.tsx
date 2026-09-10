import Link from "next/link";
import { Surface } from "@/components/ui/Surface";
import { getInvitePreview, type InviteRule } from "@/lib/challenges/actions";
import { getProfile } from "@/lib/profile/actions";
import { calculateRecommendations, isValidRecommendationInput, type Recommendations } from "@/lib/profile/recommendations";
import { findMetric, BUILTIN_METRICS } from "@/lib/metrics/types";
import { JoinActions } from "./JoinActions";
import { JoinShell as Shell } from "./JoinShell";

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

// scope='own' rules have their target/min/max nulled on the shared row on
// purpose (the real numbers live per-participant in challenge_rule_targets —
// step12/13's design) — a naive interpolation of those fields here would
// print the literal word "null" (D0 bug #2). Describe the shape without a
// number for those instead.
function describeRule(rule: InviteRule): string {
  const label = findMetric(BUILTIN_METRICS, rule.metricKey)?.label ?? rule.metricKey;
  if (rule.shape === "boolean" && rule.schedule?.mode === "flexible") {
    return `${label} — ${rule.schedule.sessionsPerWeek}x/week`;
  }
  if (rule.shape === "boolean" && rule.schedule?.mode === "fixed_days") {
    return `${label} — ${rule.schedule.days.length} fixed days/week`;
  }
  if (rule.scope === "own") {
    if (rule.shape === "at_least") return `${label} — each sets their own minimum`;
    if (rule.shape === "at_most") return `${label} — each sets their own ceiling`;
    if (rule.shape === "range") return `${label} — each sets their own range`;
    return `${label} — each sets their own`;
  }
  if (rule.shape === "at_least") return `${label} — at least ${rule.target}`;
  if (rule.shape === "at_most") return `${label} — no more than ${rule.target}`;
  if (rule.shape === "range") return `${label} — between ${rule.min} and ${rule.max}`;
  return label;
}

export default async function JoinPage(props: PageProps<"/join/[token]">) {
  const { token } = await props.params;
  const preview = await getInvitePreview(token);

  if ("error" in preview) {
    return (
      <Shell>
        <h1 className="text-title text-ink">Invite not found</h1>
        <p className="mt-2 text-body text-ink-muted">
          This link doesn&rsquo;t match a challenge invite. It may have been mistyped.
        </p>
        <Link href="/buddies" className="mt-6 inline-block text-body text-sage underline underline-offset-2">
          Go to Buddies
        </Link>
      </Shell>
    );
  }

  if (preview.isOwnInvite) {
    return (
      <Shell>
        <h1 className="text-title text-ink">This is your invite</h1>
        <p className="mt-2 text-body text-ink-muted">
          Share this link with the person you want in &ldquo;{preview.name}&rdquo; instead of opening it yourself.
        </p>
        <Link href="/buddies" className="mt-6 inline-block text-body text-sage underline underline-offset-2">
          Go to Buddies
        </Link>
      </Shell>
    );
  }

  if (preview.alreadyJoined) {
    return (
      <Shell>
        <h1 className="text-title text-ink">You&rsquo;re already in</h1>
        <p className="mt-2 text-body text-ink-muted">
          You&rsquo;ve already accepted &ldquo;{preview.name}&rdquo;.
        </p>
        <Link href="/buddies" className="mt-6 inline-block text-body text-sage underline underline-offset-2">
          Go to Buddies
        </Link>
      </Shell>
    );
  }

  if (preview.expired) {
    return (
      <Shell>
        <h1 className="text-title text-ink">This link has expired</h1>
        <p className="mt-2 text-body text-ink-muted">Ask {preview.inviterLabel} to send you a fresh one.</p>
        <Link href="/buddies" className="mt-6 inline-block text-body text-sage underline underline-offset-2">
          Go to Buddies
        </Link>
      </Shell>
    );
  }

  if (preview.full) {
    return (
      <Shell>
        <h1 className="text-title text-ink">This challenge is full</h1>
        <p className="mt-2 text-body text-ink-muted">
          &ldquo;{preview.name}&rdquo; already has its two participants.
        </p>
        <Link href="/buddies" className="mt-6 inline-block text-body text-sage underline underline-offset-2">
          Go to Buddies
        </Link>
      </Shell>
    );
  }

  const profile = await getProfile();
  const recommendations = profile && isValidRecommendationInput(profile) ? calculateRecommendations(profile) : null;

  const ownRules = preview.rules
    .filter((r) => r.scope === "own" && r.shape !== "boolean")
    .map((r) => ({
      ruleId: r.id,
      metricKey: r.metricKey,
      shape: r.shape,
      label: findMetric(BUILTIN_METRICS, r.metricKey)?.label ?? r.metricKey,
      defaultTarget: defaultOwnValue(r.metricKey, recommendations),
    }));

  return (
    <Shell>
      <h1 className="text-title text-ink">{preview.name}</h1>
      <p className="mt-1 text-body text-ink-muted">
        {preview.inviterLabel} invited you &middot; {preview.startDate} &rarr; {preview.endDate}
      </p>

      <Surface tier={1} radius="card" className="mt-5 p-4">
        <ul className="space-y-1.5 text-body text-ink">
          {preview.rules.map((r) => (
            <li key={r.id}>&middot; {describeRule(r)}</li>
          ))}
        </ul>
      </Surface>

      {preview.stakeText && (
        <p className="mt-4 text-body text-ink">
          <span className="text-ink-muted">Stake: </span>
          {preview.stakeText}
        </p>
      )}

      {preview.settings?.blind_mode && (
        <p className="mt-2 text-caption text-ink-faint">
          Blind mode is on &mdash; you won&rsquo;t see their number for today until you log yours.
        </p>
      )}

      <JoinActions token={token} ownRules={ownRules} />
    </Shell>
  );
}
