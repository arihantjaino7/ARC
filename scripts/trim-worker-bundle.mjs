#!/usr/bin/env node
// Post-build step for the Cloudflare deploy — see docs/DEPLOY.md.
//
// Next 16's Node.js middleware bundle (proxy.ts, bundled by @opennextjs/cloudflare)
// unconditionally imports the two WebAssembly binaries behind `ImageResponse`
// (next/og): yoga.wasm for layout and resvg.wasm for SVG rasterisation. Together
// they are ~546 KiB *gzipped*, which pushed this Worker to 3.03 MiB — just over
// Cloudflare's 3 MiB free-plan limit.
//
// This app has no OG image generation at all (no `ImageResponse`, no `next/og`,
// no opengraph-image/twitter-image route — verified by grep across src/), so both
// imports are dead weight. They are replaced with `null` bindings, which drops the
// binaries from the bundle without touching any code path the app actually runs.
//
// If OG images are ever added, this script's own guard below will fail the build
// rather than let a broken `ImageResponse` ship.

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { execSync } from "node:child_process";

const HANDLER = resolve(process.cwd(), ".open-next/middleware/handler.mjs");

if (!existsSync(HANDLER)) {
  console.error(`✗ ${HANDLER} not found — run \`opennextjs-cloudflare build\` first.`);
  process.exit(1);
}

// Guard: if the app ever starts using OG image generation, stubbing the wasm
// would break it at runtime. Fail the build loudly instead.
const usesOg = execSync(
  'git grep -lE "ImageResponse|next/og|opengraph-image|twitter-image" -- src || true',
  { encoding: "utf8" },
).trim();
if (usesOg) {
  console.error("✗ This app now uses OG image generation:");
  console.error(usesOg);
  console.error("  Remove this script from the build — the wasm it strips is required.");
  process.exit(1);
}

const before = readFileSync(HANDLER, "utf8");

// Matches e.g.  import resvg_wasm from "C:/…/@vercel/og/resvg.wasm?module"
const WASM_IMPORT = /import\s+(\w+)\s+from\s+"[^"]*@vercel\/og\/(yoga|resvg)\.wasm\?module";?/g;

const stubbed = [];
const after = before.replace(WASM_IMPORT, (_match, binding, name) => {
  stubbed.push(`${name}.wasm -> ${binding}`);
  return `const ${binding} = null; /* stripped by scripts/trim-worker-bundle.mjs */`;
});

if (stubbed.length === 0) {
  // Not an error: the goal is "no OG wasm in the bundle". If a future Next or
  // adapter release stops emitting these imports, that goal is already met.
  console.log("• No @vercel/og wasm imports found — nothing to strip (already lean).");
  process.exit(0);
}

writeFileSync(HANDLER, after);
console.log(`✓ Stripped ${stubbed.length} unused OG wasm import(s): ${stubbed.join(", ")}`);
