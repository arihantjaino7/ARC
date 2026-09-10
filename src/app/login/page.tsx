"use client";

import Link from "next/link";
import { Suspense, useActionState } from "react";
import { useSearchParams } from "next/navigation";
import { login, type AuthState } from "@/lib/auth/actions";
import { Stagger } from "@/components/ui/Stagger";
import { Field } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";

const initialState: AuthState = {};

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const [state, formAction, pending] = useActionState(login, initialState);
  // Set by src/proxy.ts when an unauthenticated visitor hits /join/<token> —
  // carries them back there after logging in instead of always to "/".
  const next = useSearchParams().get("next") ?? "/";

  return (
    <div className="flex min-h-dvh flex-1 flex-col items-center justify-center px-gutter py-16">
      <Stagger className="w-full max-w-sm">
        <Stagger.Item>
          <h1 className="text-title text-ink">Log in</h1>
          <p className="mt-1 text-body text-ink-muted">Welcome back.</p>
        </Stagger.Item>

        <Stagger.Item>
          <form action={formAction} className="mt-8 space-y-4">
            <input type="hidden" name="next" value={next} />
            <Field id="email" name="email" label="Email" type="email" autoComplete="email" required />

            <div>
              <div className="flex items-center justify-between">
                <label htmlFor="password" className="text-caption text-ink-muted">
                  Password
                </label>
                <Link href="/forgot-password" className="text-caption text-ink-muted underline underline-offset-2">
                  Forgot it?
                </Link>
              </div>
              <Field
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                className="mt-1.5"
              />
            </div>

            {state?.error && (
              <p role="alert" className="text-body text-clay">
                {state.error}
              </p>
            )}

            <Button type="submit" disabled={pending} className="w-full">
              {pending ? "Logging in…" : "Log in"}
            </Button>
          </form>
        </Stagger.Item>

        <Stagger.Item>
          <p className="mt-6 text-body text-ink-muted">
            No account?{" "}
            <Link
              href={`/signup${next !== "/" ? `?next=${encodeURIComponent(next)}` : ""}`}
              className="font-medium text-sage underline underline-offset-2"
            >
              Sign up
            </Link>
          </p>
        </Stagger.Item>
      </Stagger>
    </div>
  );
}
