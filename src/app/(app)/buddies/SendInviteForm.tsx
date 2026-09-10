"use client";

import { useActionState } from "react";
import { sendFriendRequest, type FriendState } from "@/lib/friends/actions";
import { Field } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";

const initialState: FriendState = {};

export function SendInviteForm() {
  const [state, formAction, pending] = useActionState(
    sendFriendRequest,
    initialState,
  );

  return (
    <form
      action={formAction}
      key={state?.message ?? "invite-form"}
      className="space-y-3"
    >
      <Field
        id="email"
        name="email"
        type="email"
        required
        label="Friend's email"
        placeholder="friend@example.com"
      />

      {state?.error && (
        <p role="alert" className="text-caption text-clay">
          {state.error}
        </p>
      )}
      {state?.message && <p className="text-caption text-sage">{state.message}</p>}

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Sending…" : "Send invite"}
      </Button>
    </form>
  );
}
