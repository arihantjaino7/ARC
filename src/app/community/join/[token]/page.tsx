import Link from "next/link";
import { Surface } from "@/components/ui/Surface";
import { Chip } from "@/components/ui/Chip";
import { getCommunityInvitePreview } from "@/lib/communities/actions";
import type { InviteRule } from "@/lib/challenges/actions";
import { findMetric, BUILTIN_METRICS } from "@/lib/metrics/types";
import { CommunityJoinActions } from "./CommunityJoinActions";

function describeRule(rule: InviteRule): string {
  const label = findMetric(BUILTIN_METRICS, rule.metricKey)?.label ?? rule.metricKey;
  if (rule.shape === "boolean" && rule.schedule?.mode === "flexible") {
    return `${label} — ${rule.schedule.sessionsPerWeek}x/week`;
  }
  if (rule.shape === "boolean" && rule.schedule?.mode === "fixed_days") {
    return `${label} — ${rule.schedule.days.length} fixed days/week`;
  }
  if (rule.shape === "at_least") return `${label} — at least ${rule.target}`;
  if (rule.shape === "at_most") return `${label} — no more than ${rule.target}`;
  if (rule.shape === "range") return `${label} — between ${rule.min} and ${rule.max}`;
  return label;
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-1 flex-col items-center justify-center px-gutter py-16">
      <div className="w-full max-w-sm">{children}</div>
    </div>
  );
}

export default async function CommunityJoinPage(props: PageProps<"/community/join/[token]">) {
  const { token } = await props.params;
  const preview = await getCommunityInvitePreview(token);

  if ("error" in preview) {
    return (
      <Shell>
        <h1 className="text-title text-ink">Invite not found</h1>
        <p className="mt-2 text-body text-ink-muted">
          This link doesn&rsquo;t match a community invite. It may have been mistyped.
        </p>
        <Link href="/community" className="mt-6 inline-block text-body text-sage underline">
          Go to Community
        </Link>
      </Shell>
    );
  }

  if (preview.isOwnInvite) {
    return (
      <Shell>
        <h1 className="text-title text-ink">This is your invite</h1>
        <p className="mt-2 text-body text-ink-muted">
          Share this link with whoever you want in &ldquo;{preview.name}&rdquo; instead of opening it yourself.
        </p>
        <Link href="/community" className="mt-6 inline-block text-body text-sage underline">
          Go to Community
        </Link>
      </Shell>
    );
  }

  if (preview.alreadyMember) {
    return (
      <Shell>
        <h1 className="text-title text-ink">You&rsquo;re already in</h1>
        <p className="mt-2 text-body text-ink-muted">
          You&rsquo;re already a member of &ldquo;{preview.name}&rdquo;.
        </p>
        <Link href={`/community/${preview.communityId}`} className="mt-6 inline-block text-body text-sage underline">
          Go to the community
        </Link>
      </Shell>
    );
  }

  if (preview.revoked) {
    return (
      <Shell>
        <h1 className="text-title text-ink">This link no longer works</h1>
        <p className="mt-2 text-body text-ink-muted">Ask {preview.adminLabel} to send you a fresh one.</p>
        <Link href="/community" className="mt-6 inline-block text-body text-sage underline">
          Go to Community
        </Link>
      </Shell>
    );
  }

  return (
    <Shell>
      <h1 className="text-title text-ink">{preview.name}</h1>
      <div className="mt-2 flex items-center gap-2">
        <p className="text-body text-ink-muted">{preview.adminLabel} invited you</p>
        <Chip>{preview.visibility === "private" ? "Private" : "Public"}</Chip>
      </div>

      {preview.description && <p className="mt-3 text-body text-ink-muted">{preview.description}</p>}

      <Surface tier={1} radius="card" className="mt-5 p-4">
        <ul className="space-y-1.5 text-body text-ink">
          {preview.rules.map((r) => (
            <li key={r.id}>&middot; {describeRule(r)}</li>
          ))}
        </ul>
      </Surface>

      <p className="mt-4 text-caption text-ink-faint">
        These rules are set by the admin — everyone in the community is scored on the same numbers.
      </p>

      <CommunityJoinActions token={token} />
    </Shell>
  );
}
