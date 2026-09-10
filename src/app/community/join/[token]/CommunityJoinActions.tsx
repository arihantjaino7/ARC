"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { acceptCommunityInvite } from "@/lib/communities/actions";

export function CommunityJoinActions({ token }: { token: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAccept() {
    setPending(true);
    setError(null);
    const res = await acceptCommunityInvite(token);
    setPending(false);
    if ("error" in res) {
      setError(res.error);
      return;
    }
    router.push(`/community/${res.communityId}`);
  }

  return (
    <div className="mt-6 space-y-3">
      {error && (
        <p role="alert" className="text-body text-clay">
          {error}
        </p>
      )}
      <Button type="button" onClick={handleAccept} disabled={pending} className="w-full">
        {pending ? "Joining…" : "Join"}
      </Button>
    </div>
  );
}
