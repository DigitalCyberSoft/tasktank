import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "happy-dom",
    include: ["*.test.js"],
    exclude: ["e2e.test.js"],
    setupFiles: ["./test-mocks.js"],
    globals: true,
  },
});
