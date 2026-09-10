"use client";

import { useActionState } from "react";
import { updatePassword, type AuthState } from "@/lib/auth/actions";
import { Field } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";

const initialState: AuthState = {};

export function ResetPasswordForm() {
  const [state, formAction, pending] = useActionState(
    updatePassword,
    initialState,
  );

  return (
    <form action={formAction} className="mt-8 space-y-4">
      <Field
        id="password"
        name="password"
        label="New password"
        type="password"
        autoComplete="new-password"
        required
      />

      {state?.error && (
        <p role="alert" className="text-body text-clay">
          {state.error}
        </p>
      )}

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Saving…" : "Set new password"}
      </Button>
    </form>
  );
}
