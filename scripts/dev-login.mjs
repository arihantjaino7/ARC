#!/usr/bin/env node
// Prints a one-time login URL for a local dev session, so an agent (or you)
// can reach the signed-in app without typing a password into a form.
//
// Usage: node scripts/dev-login.mjs [email] [--port 3000] [--next /community]
//
// How it works: the Auth Admin API's generate_link endpoint (service_role
// only, same key scripts/admin-users.mjs already uses) mints a `hashed_token`
// for an existing user. src/app/auth/confirm/route.ts already accepts
// `?token_hash=...&type=...` and calls verifyOtp server-side, setting the
// @supabase/ssr session cookie — so the URL below is pointed at localhost,
// not at Supabase's own verify endpoint. That sidesteps the redirect-URL
// allowlist entirely and needs no change to app code.
//
// The token is single-use and short-lived; re-run this for each session.
// Dev only — never wire this into anything that ships.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function loadEnvLocal() {
  const text = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
  for (const line of text.split("\n")) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (match && !(match[1] in process.env)) process.env[match[1]] = match[2];
  }
}

function arg(flag, fallback) {
  const i = process.argv.indexOf(flag);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

loadEnvLocal();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const email = process.argv[2]?.startsWith("--") ? undefined : process.argv[2];
if (!email) {
  console.error("Usage: node scripts/dev-login.mjs <email> [--port 3000] [--next /]");
  console.error("Tip: node scripts/admin-users.mjs lists the accounts that exist.");
  process.exit(1);
}

const port = arg("--port", "3000");

// Git Bash on Windows rewrites a leading-slash argument into a Windows path
// (`--next /community` arrives as `C:/Program Files/Git/community`). The
// /auth/confirm route already falls back to "/" for anything not starting with
// a slash, so this is a usability guard, not a security one. Either run this
// from PowerShell, or pass a doubled slash: `--next //community`.
let next = arg("--next", "/").replace(/^\/\//, "/");
if (!next.startsWith("/") || next.startsWith("//")) {
  console.error(`--next got mangled by the shell into: ${next}`);
  console.error("Run it from PowerShell, or pass a doubled slash: --next //community");
  process.exit(1);
}

const res = await fetch(`${url}/auth/v1/admin/generate_link`, {
  method: "POST",
  headers: {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ type: "magiclink", email }),
});

const body = await res.json();
if (!res.ok) {
  console.error("generate_link failed:", body);
  process.exit(1);
}

const hashedToken = body.hashed_token ?? body.properties?.hashed_token;
if (!hashedToken) {
  console.error("No hashed_token in the response:", body);
  process.exit(1);
}

const params = new URLSearchParams({
  token_hash: hashedToken,
  type: "magiclink",
  next,
});

console.log(`http://localhost:${port}/auth/confirm?${params}`);
