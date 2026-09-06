#!/usr/bin/env node
// One-off: sets profiles.timezone for a given user id directly via REST
// (service_role bypasses RLS), same effect as src/lib/profile/actions.ts's
// saveTimezone but callable outside a real browser session.
//
// Usage: node scripts/set-timezone.mjs <user-id> <iana-zone>

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function loadEnvLocal() {
  const text = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
  for (const line of text.split("\n")) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (match && !(match[1] in process.env)) process.env[match[1]] = match[2];
  }
}

loadEnvLocal();

const [, , userId, timezone] = process.argv;
if (!userId || !timezone) {
  console.error("Usage: node scripts/set-timezone.mjs <user-id> <iana-zone>");
  process.exit(1);
}

try {
  new Intl.DateTimeFormat("en-US", { timeZone: timezone });
} catch {
  console.error(`"${timezone}" isn't a recognised IANA time zone.`);
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

const res = await fetch(`${url}/rest/v1/profiles?id=eq.${userId}`, {
  method: "PATCH",
  headers: {
    "Content-Type": "application/json",
    apikey: key,
    Authorization: `Bearer ${key}`,
    Prefer: "return=representation",
  },
  body: JSON.stringify({ timezone, updated_at: new Date().toISOString() }),
});

const body = await res.text();
if (!res.ok) {
  console.error(`Failed (${res.status}): ${body}`);
  process.exit(1);
}

console.log(body);
