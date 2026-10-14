import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      // `server-only` throws outside the Next.js server bundle; stub it in tests.
      "server-only": path.resolve(import.meta.dirname, "tests/stubs/server-only.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts", "src/**/*.test.ts"],
    // PGlite-backed DB tests each apply the full migration set in beforeAll.
    // With several DB test files running in parallel, migration apply can
    // exceed Vitest's default 10s hook timeout. Bump it to avoid false
    // failures while still catching genuine hangs.
    hookTimeout: 30000,
  },
});
