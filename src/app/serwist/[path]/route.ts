import { spawnSync } from "node:child_process";
import { createSerwistRoute } from "@serwist/turbopack";

// Use git commit hash for versioning, fallback to random UUID
const revision =
  spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf-8" }).stdout?.trim() ||
  crypto.randomUUID();

export const { dynamic, dynamicParams, revalidate, generateStaticParams, GET } = createSerwistRoute({
  additionalPrecacheEntries: [
    { url: "/~offline", revision },
    { url: "/manifest.json", revision },
  ],
  swSrc: "src/app/sw.ts",
  useNativeEsbuild: true,
});
