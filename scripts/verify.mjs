#!/usr/bin/env node
// Ad-hoc read-only check against the REST API using the service_role key.
// Not a migration tool — for confirming a migration actually landed.
//
// Usage: node scripts/verify.mjs <table> [query-string]
//   node scripts/verify.mjs metrics "is_builtin=eq.true&select=key,label"

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function loadEnvLocal() {
  let text;
  try {
    text = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
  } catch {
    return;
  }
  for (const line of text.split("\n")) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (match && !(match[1] in process.env)) {
      process.env[match[1]] = match[2];
    }
  }
}

async function main() {
  loadEnvLocal();

  const table = process.argv[2];
  const qs = process.argv[3] ?? "";
  if (!table) {
    console.error("Usage: node scripts/verify.mjs <table> [query-string]");
    process.exit(1);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  const res = await fetch(`${url}/rest/v1/${table}?${qs}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });

  const body = await res.text();
  if (!res.ok) {
    console.error(`Failed (${res.status}): ${body}`);
    process.exit(1);
  }

  console.log(body);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
