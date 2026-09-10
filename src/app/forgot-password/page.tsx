"use client";

import Link from "next/link";
import { useActionState } from "react";
import { requestPasswordReset, type AuthState } from "@/lib/auth/actions";
import { Stagger } from "@/components/ui/Stagger";
import { Field } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";

const initialState: AuthState = {};

export default function ForgotPasswordPage() {
  const [state, formAction, pending] = useActionState(
    requestPasswordReset,
    initialState,
  );

  return (
    <div className="flex min-h-dvh flex-1 flex-col items-center justify-center px-gutter py-16">
      <Stagger className="w-full max-w-sm">
        <Stagger.Item>
          <h1 className="text-title text-ink">Reset your password</h1>
          <p className="mt-1 text-body text-ink-muted">
            Enter your email and we&rsquo;ll send you a reset link.
          </p>
        </Stagger.Item>

        <Stagger.Item>
          <form action={formAction} className="mt-8 space-y-4">
            <Field id="email" name="email" label="Email" type="email" autoComplete="email" required />

            {state?.error && (
              <p role="alert" className="text-body text-clay">
                {state.error}
              </p>
            )}
            {state?.message && <p className="text-body text-sage">{state.message}</p>}

            <Button type="submit" disabled={pending} className="w-full">
              {pending ? "Sending…" : "Send reset link"}
            </Button>
          </form>
        </Stagger.Item>

        <Stagger.Item>
          <p className="mt-6 text-body text-ink-muted">
            <Link href="/login" className="font-medium text-sage underline underline-offset-2">
              Back to log in
            </Link>
          </p>
        </Stagger.Item>
      </Stagger>
    </div>
  );
}
