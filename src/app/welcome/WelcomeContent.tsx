"use client";

// Stagger.Item can only be referenced from a Client Component — from a
// Server Component, `Stagger` is an opaque RSC client-reference proxy with
// no `.Item` property attached yet (that assignment only runs once the real
// client module executes in the browser), so JSX like `<Stagger.Item>`
// written directly in a Server Component crashes with "Element type is
// invalid: ... got: undefined". welcome/page.tsx is a Server Component (it
// needs the auth check + redirect), so the actual staggered content lives
// here instead.

import Link from "next/link";
import { Stagger } from "@/components/ui/Stagger";
import { Button } from "@/components/ui/Button";

export function WelcomeContent() {
  return (
    <Stagger className="flex flex-col items-center">
      <Stagger.Item>
        <h1 className="text-hero text-ink">ARC</h1>
      </Stagger.Item>
      <Stagger.Item>
        <p className="mt-4 max-w-xs text-balance text-body text-ink-muted">
          Compete with your gym buddy on effort towards your own goal &mdash; not
          who lifted more.
        </p>
      </Stagger.Item>
      <Stagger.Item className="mt-8 flex gap-3">
        <Link href="/login">
          <Button variant="glass">Log in</Button>
        </Link>
        <Link href="/signup">
          <Button>Sign up</Button>
        </Link>
      </Stagger.Item>
    </Stagger>
  );
}
