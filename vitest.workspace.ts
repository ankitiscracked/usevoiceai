import { defineWorkspace } from "vitest/config";

export default defineWorkspace([
  "packages/core/vitest.config.ts",
  "packages/react/vitest.config.ts",
  "packages/vue/vitest.config.ts",
  "packages/server/vitest.config.ts",
  "packages/providers/deepgram/vitest.config.ts",
  "packages/providers/cartesia/vitest.config.ts",
  "packages/providers/hume/vitest.config.ts"
]);
