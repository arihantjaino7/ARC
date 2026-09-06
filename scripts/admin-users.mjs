#!/usr/bin/env node
// Read-only: lists auth.users via the Supabase Auth Admin API (service_role
// only endpoint), so a profile row can be matched to the email that owns it.
// auth.users isn't exposed through PostgREST directly, hence a separate call.

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

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

const res = await fetch(`${url}/auth/v1/admin/users`, {
  headers: { apikey: key, Authorization: `Bearer ${key}` },
});

const body = await res.json();
if (!res.ok) {
  console.error(body);
  process.exit(1);
}

for (const u of body.users ?? []) {
  console.log(u.id, u.email);
}
