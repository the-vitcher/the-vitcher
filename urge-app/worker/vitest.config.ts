import { defineConfig } from "vitest/config";

// Local config so vitest does not walk up and load the repo root vite.config.ts.
export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
  },
});
