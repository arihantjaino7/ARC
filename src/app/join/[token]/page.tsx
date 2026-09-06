import Link from "next/link";
import { getInvitePreview, type InviteRule } from "@/lib/challenges/actions";
import { getProfile } from "@/lib/profile/actions";
import { calculateRecommendations, isValidRecommendationInput, type Recommendations } from "@/lib/profile/recommendations";
import { findMetric, BUILTIN_METRICS } from "@/lib/metrics/types";
import { JoinActions } from "./JoinActions";

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

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center bg-zinc-50 px-6 py-16 dark:bg-black">
      <div className="w-full max-w-sm">{children}</div>
    </div>
  );
}

export default async function JoinPage(props: PageProps<"/join/[token]">) {
  const { token } = await props.params;
  const preview = await getInvitePreview(token);

  if ("error" in preview) {
    return (
      <Shell>
        <h1 className="text-xl font-semibold text-black dark:text-zinc-50">Invite not found</h1>
        <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
          This link doesn&rsquo;t match a challenge invite. It may have been mistyped.
        </p>
        <Link href="/buddies" className="mt-6 inline-block text-sm underline">
          Go to Buddies
        </Link>
      </Shell>
    );
  }

  if (preview.isOwnInvite) {
    return (
      <Shell>
        <h1 className="text-xl font-semibold text-black dark:text-zinc-50">This is your invite</h1>
        <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
          Share this link with the person you want in &ldquo;{preview.name}&rdquo; instead of opening it yourself.
        </p>
        <Link href="/buddies" className="mt-6 inline-block text-sm underline">
          Go to Buddies
        </Link>
      </Shell>
    );
  }

  if (preview.alreadyJoined) {
    return (
      <Shell>
        <h1 className="text-xl font-semibold text-black dark:text-zinc-50">You&rsquo;re already in</h1>
        <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
          You&rsquo;ve already accepted &ldquo;{preview.name}&rdquo;.
        </p>
        <Link href="/buddies" className="mt-6 inline-block text-sm underline">
          Go to Buddies
        </Link>
      </Shell>
    );
  }

  if (preview.expired) {
    return (
      <Shell>
        <h1 className="text-xl font-semibold text-black dark:text-zinc-50">This link has expired</h1>
        <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
          Ask {preview.inviterLabel} to send you a fresh one.
        </p>
        <Link href="/buddies" className="mt-6 inline-block text-sm underline">
          Go to Buddies
        </Link>
      </Shell>
    );
  }

  if (preview.full) {
    return (
      <Shell>
        <h1 className="text-xl font-semibold text-black dark:text-zinc-50">This challenge is full</h1>
        <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
          &ldquo;{preview.name}&rdquo; already has its two participants.
        </p>
        <Link href="/buddies" className="mt-6 inline-block text-sm underline">
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
      <h1 className="text-xl font-semibold text-black dark:text-zinc-50">{preview.name}</h1>
      <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
        {preview.inviterLabel} invited you &middot; {preview.startDate} &rarr; {preview.endDate}
      </p>

      <ul className="mt-5 space-y-1.5 text-sm">
        {preview.rules.map((r) => (
          <li key={r.id} className="text-black dark:text-zinc-50">
            &middot; {describeRule(r)}
          </li>
        ))}
      </ul>

      {preview.stakeText && (
        <p className="mt-4 text-sm text-black dark:text-zinc-50">
          <span className="text-zinc-500 dark:text-zinc-400">Stake: </span>
          {preview.stakeText}
        </p>
      )}

      {preview.settings?.blind_mode && (
        <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
          Blind mode is on &mdash; you won&rsquo;t see their number for today until you log yours.
        </p>
      )}

      <JoinActions token={token} ownRules={ownRules} />
    </Shell>
  );
}
