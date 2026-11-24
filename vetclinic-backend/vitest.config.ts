import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    testTimeout: 15000,
    // Certains hooks attendent la reconnexion Prisma/MinIO après une suite
    // précédente ; 15 s était trop court sur une machine chargée.
    hookTimeout: 60000,
    singleFork: true,
    include: ["src/**/*.test.ts"],
    exclude: ["node_modules", "dist/**"],
  },
});
