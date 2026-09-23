import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    testTimeout: 15000,
    hookTimeout: 15000,
    singleFork: true,
    include: ["src/**/*.test.ts"],
    exclude: ["node_modules", "dist/**"],
  },
});
