import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["e2e/e2e.test.js"],
    globals: true,
    testTimeout: 90000,
    hookTimeout: 90000,
  },
});
