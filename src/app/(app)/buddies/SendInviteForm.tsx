"use client";

import { useActionState } from "react";
import { sendFriendRequest, type FriendState } from "@/lib/friends/actions";

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
      <div>
        <label
          htmlFor="email"
          className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
        >
          Friend&rsquo;s email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          placeholder="friend@example.com"
          className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-black outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
        />
      </div>

      {state?.error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {state.error}
        </p>
      )}
      {state?.message && (
        <p className="text-sm text-emerald-600 dark:text-emerald-400">
          {state.message}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-md bg-black px-3 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-black"
      >
        {pending ? "Sending…" : "Send invite"}
      </button>
    </form>
  );
}
