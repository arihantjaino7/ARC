#!/usr/bin/env node
// Applies a .sql file to the Supabase project directly, via the one-time
// exec_sql RPC installed by supabase/_bootstrap_exec_sql.sql. Replaces
// "paste this into the SQL Editor" for every migration after that bootstrap.
//
// Usage: node scripts/run-sql.mjs supabase/step11_metrics_entries.sql

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

  const file = process.argv[2];
  if (!file) {
    console.error("Usage: node scripts/run-sql.mjs <path-to-sql-file>");
    process.exit(1);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local.",
    );
    process.exit(1);
  }

  const sql = readFileSync(resolve(process.cwd(), file), "utf8");

  const res = await fetch(`${url}/rest/v1/rpc/exec_sql`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: key,
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({ query: sql }),
  });

  if (!res.ok) {
    const body = await res.text();
    console.error(`Failed (${res.status}): ${body}`);
    if (res.status === 404) {
      console.error(
        "\nexec_sql doesn't exist yet — paste supabase/_bootstrap_exec_sql.sql " +
          "into the Supabase dashboard's SQL Editor once, then re-run this.",
      );
    }
    process.exit(1);
  }

  console.log(`Applied ${file}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
