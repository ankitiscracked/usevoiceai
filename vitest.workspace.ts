import { defineWorkspace } from "vitest/config";

export default defineWorkspace([
  "packages/core/vitest.config.ts",
  "packages/react/vitest.config.ts",
  "packages/vue/vitest.config.ts",
  "packages/server/vitest.config.ts",
  "packages/deepgram/vitest.config.ts",
  "packages/cartesia/vitest.config.ts"
]);
