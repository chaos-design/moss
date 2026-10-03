import path from "node:path"
import { defineConfig } from "vitest/config"

// jsdom workers are bound by style resolution and memory bandwidth, not CPU count. Measured on a
// 12-core host: one worker per hyper-thread makes role queries degrade 4x and fails correct tests,
// while two workers finish the whole suite fastest. Override with `--maxWorkers` on larger CI hosts.
const maxWorkers = 2

// jsdom resolves implicit ARIA roles through getComputedStyle, so a single role query against a
// full workspace tree can take seconds. Keep a margin over the default without hiding real hangs.
const testTimeout = 10_000

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.{js,mjs,ts,tsx}"],
    maxWorkers,
    testTimeout,
    coverage: {
      provider: "v8",
      include: ["src/lib/memory/spaced-repetition.ts", "src/lib/learning-runtime.ts"],
      thresholds: {
        lines: 80,
        functions: 80,
        statements: 80,
        branches: 80,
      },
    },
  },
})
