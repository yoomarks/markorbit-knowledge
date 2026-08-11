import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/server/e2e/**/*.e2e.ts"],
    testTimeout: 30_000,
  },
});
