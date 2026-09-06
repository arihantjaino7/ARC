"use client";

import { useActionState, useMemo, useState } from "react";
import { saveTimezone, type ProfileState } from "@/lib/profile/actions";

const initialState: ProfileState = {};

export function TimezoneForm({ current }: { current: string }) {
  const [state, formAction, pending] = useActionState(saveTimezone, initialState);

  // Intl.supportedValuesOf isn't in every runtime's lib types yet, and this is
  // a client component, so the list is built in the browser where it exists.
  const zones = useMemo(() => {
    let all: string[] = [];
    try {
      all = Intl.supportedValuesOf("timeZone");
    } catch {
      all = [];
    }
    return [...new Set([current, detected(), ...all])].filter(Boolean).sort();
  }, [current]);

  const [value, setValue] = useState(current);
  const browser = detected();
  const mismatched = browser && browser !== current;

  return (
    <form action={formAction} className="mt-3 space-y-3">
      <select
        name="timezone"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-black outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
      >
        {zones.map((zone) => (
          <option key={zone} value={zone}>
            {zone}
          </option>
        ))}
      </select>

      {mismatched && (
        <button
          type="button"
          onClick={() => setValue(browser)}
          className="text-xs text-zinc-500 underline underline-offset-2 dark:text-zinc-400"
        >
          Use this device&rsquo;s zone ({browser})
        </button>
      )}

      {state?.error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {state.error}
        </p>
      )}
      {state?.message && (
        <p className="text-sm text-emerald-600 dark:text-emerald-400">{state.message}</p>
      )}

      <button
        type="submit"
        disabled={pending || value === current}
        className="w-full rounded-lg bg-black px-3 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-black"
      >
        {pending ? "Saving…" : "Save time zone"}
      </button>
    </form>
  );
}

function detected(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone ?? "";
  } catch {
    return "";
  }
}
