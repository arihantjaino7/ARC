// Cloudflare Workers adapter config — see docs/DEPLOY.md.
//
// No `incrementalCache` override on purpose: the template ships an R2-backed
// cache for ISR, and this app has no ISR to cache (every route is dynamic —
// they all read Supabase auth cookies). The default in-memory cache is the
// right fit and keeps the deploy free of extra bucket provisioning.
import { defineCloudflareConfig } from "@opennextjs/cloudflare";

export default defineCloudflareConfig();
