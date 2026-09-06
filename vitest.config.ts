// Mirrors tsconfig.json's "@/*": "./src/*" path alias for vitest. Without
// this, "@/..." only resolves in type-only imports (erased before runtime)
// and under `next dev`/build (Next's own resolver understands tsconfig
// paths) — a plain value import via the alias fails at test time only,
// which is exactly what src/lib/challenges/rollup.ts hit first.
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
