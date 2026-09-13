# Deploying ARC to Cloudflare Workers

The app runs on Cloudflare Workers via [`@opennextjs/cloudflare`](https://opennext.js.org/cloudflare)
(the OpenNext adapter), which runs real Next.js on the Workers runtime rather than
reimplementing it. Next 16.3.4 + adapter 1.20.6.

## Commands

```bash
npm run cf:build     # next build -> adapter bundle -> trim step
npm run cf:preview   # the above, then run the real Worker locally in workerd
npm run cf:deploy    # the above, then ship it
```

`npm run build` is still plain `next build` — the existing local checks
(`tsc --noEmit`, `eslint src`, `vitest run`) are unchanged.

## One-time setup

1. **Authenticate**: `npx wrangler login` (browser OAuth, stores creds locally).
2. **Deploy**: `npm run cf:deploy`. The first deploy prints the live URL,
   `https://arc.<your-subdomain>.workers.dev`.
3. **Point Supabase at that URL** — see below. Invite links do not fully work
   until this is done.

## Supabase configuration (required — this is what makes invite links work)

Invite links themselves need no configuration: both
`/join/<token>` (buddy challenges) and `/community/join/<token>` (communities)
are built client-side from `window.location.origin`, so they automatically carry
whatever domain the app is served from.

What *does* need configuring is the **signed-out** half of the flow. When someone
who isn't logged in opens an invite link, `src/proxy.ts` bounces them to
`/signup?next=/join/<token>`, and signup asks Supabase to send a confirmation
email pointing back at `{origin}/auth/confirm?next=/join/<token>`
(`siteOrigin()` in `src/lib/auth/actions.ts` derives that origin from the
request's `host` / `x-forwarded-proto` headers, which Cloudflare sets correctly).

Supabase refuses redirect targets that aren't allowlisted, so in the
**Supabase dashboard → Authentication → URL Configuration**:

- **Site URL**: `https://arc.<your-subdomain>.workers.dev`
- **Redirect URLs**: add `https://arc.<your-subdomain>.workers.dev/**`

Without those, a new user invited by link gets their confirmation email, clicks
it, and lands on the wrong origin (or `localhost`) instead of coming back to the
invite — the chain breaks at the last step. Keep `http://localhost:3000/**` in
the list too so local development keeps working.

## Secrets: there are none

Every Supabase value the app reads is `NEXT_PUBLIC_*`, which Next inlines at
**build time** — verified present in both the server and middleware bundles. So
the deployed Worker needs no `wrangler secret` entries at all; `.env.local` just
has to be present on the machine running `cf:build`.

`SUPABASE_SERVICE_ROLE_KEY` is deliberately **not** deployed. Nothing in `src/`
uses it — it belongs only to the local `scripts/*.mjs` tooling — and it bypasses
RLS entirely, so it must never reach a client-reachable runtime.

## Bundle size

Cloudflare's limit is **3 MiB gzipped** on the Workers Free plan (10 MiB on
Paid). This app builds to **~2.49 MiB**, but only because of a trim step.

Out of the box it was **3.03 MiB** — just over. The cause: Next 16 bundles the
two WebAssembly binaries behind `ImageResponse`/`next/og` (`yoga.wasm` +
`resvg.wasm`, ~546 KiB gzipped together) into the **Node.js middleware** bundle
built from `proxy.ts`, whether or not you use them. This app has no OG image
generation anywhere, so `scripts/trim-worker-bundle.mjs` (wired into `cf:build`)
replaces those two dead imports with `null`.

That script fails the build if OG image generation is ever added, rather than
silently shipping a broken `ImageResponse`. If you do add OG images, remove the
script from `cf:build` and expect to need the Workers Paid plan.

Check the current size any time, without deploying:

```bash
npx wrangler deploy --dry-run
```

## Caveats

- **Node.js middleware is experimental** on this adapter — the build prints a
  warning about it. `proxy.ts` is Node middleware (Next 16 renamed
  `middleware.ts` → `proxy.ts` and it always runs on the Node runtime). It was
  verified working in workerd: signed-out gating, both invite-link redirects,
  the `/auth/confirm` session cookie handshake, and signed-in rendering all
  behave identically to `next dev`. Re-check these after any adapter upgrade.
- **No incremental cache is configured**, on purpose. Every route is
  server-rendered on demand (they all read Supabase auth cookies) and there is
  no ISR, `use cache`, or `export const revalidate` in the codebase, so the R2
  cache bucket the adapter template ships would never be read from.
  `revalidatePath()` calls in the server actions still work — on dynamic routes
  they invalidate the client router cache, which needs no shared backend.
- **`scripts/dev-login.mjs` is dev-only.** It mints real sessions using the
  service-role key and must never be pointed at the deployed app.
