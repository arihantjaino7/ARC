"use client";

import Link from "next/link";
import { Suspense, useActionState } from "react";
import { useSearchParams } from "next/navigation";
import { signup, type AuthState } from "@/lib/auth/actions";
import { Stagger } from "@/components/ui/Stagger";
import { Field } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";

const initialState: AuthState = {};

export default function SignupPage() {
  return (
    <Suspense>
      <SignupForm />
    </Suspense>
  );
}

function SignupForm() {
  const [state, formAction, pending] = useActionState(signup, initialState);
  // See src/app/login/page.tsx — same /join/<token> round trip, but through
  // email confirmation via /auth/confirm's own `next` param (src/lib/auth/actions.ts).
  const next = useSearchParams().get("next") ?? "/";

  return (
    <div className="flex min-h-dvh flex-1 flex-col items-center justify-center px-gutter py-16">
      <Stagger className="w-full max-w-sm">
        <Stagger.Item>
          <h1 className="text-title text-ink">Sign up</h1>
          <p className="mt-1 text-body text-ink-muted">Create your account to start competing.</p>
        </Stagger.Item>

        <Stagger.Item>
          <form action={formAction} className="mt-8 space-y-4">
            <input type="hidden" name="next" value={next} />
            <Field id="email" name="email" label="Email" type="email" autoComplete="email" required />
            <Field
              id="password"
              name="password"
              label="Password"
              type="password"
              autoComplete="new-password"
              required
              minLength={6}
            />

            {state?.error && (
              <p role="alert" className="text-body text-clay">
                {state.error}
              </p>
            )}
            {state?.message && (
              <p role="status" className="text-body text-sage">
                {state.message}
              </p>
            )}

            <Button type="submit" disabled={pending} className="w-full">
              {pending ? "Signing up…" : "Sign up"}
            </Button>
          </form>
        </Stagger.Item>

        <Stagger.Item>
          <p className="mt-6 text-body text-ink-muted">
            Already have an account?{" "}
            <Link
              href={`/login${next !== "/" ? `?next=${encodeURIComponent(next)}` : ""}`}
              className="font-medium text-sage underline underline-offset-2"
            >
              Log in
            </Link>
          </p>
        </Stagger.Item>
      </Stagger>
    </div>
  );
}
