"use client";

import { useActionState, useMemo, useState } from "react";
import { saveTimezone, type ProfileState } from "@/lib/profile/actions";
import { Button } from "@/components/ui/Button";

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
        style={{ fontSize: 16 }}
        className="w-full min-h-11 rounded-row border border-glass-1-border bg-glass-1 px-4 text-ink outline-none focus:border-sage/50"
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
          className="text-caption text-ink-muted underline underline-offset-2"
        >
          Use this device&rsquo;s zone ({browser})
        </button>
      )}

      {state?.error && (
        <p role="alert" className="text-caption text-clay">
          {state.error}
        </p>
      )}
      {state?.message && <p className="text-caption text-sage">{state.message}</p>}

      <Button type="submit" disabled={pending || value === current} className="w-full">
        {pending ? "Saving…" : "Save time zone"}
      </Button>
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
