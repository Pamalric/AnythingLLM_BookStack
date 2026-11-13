import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@bookstack-sync/shared": path.resolve(__dirname, "packages/shared/src/index.ts"),
      "@bookstack-sync/sync-engine": path.resolve(__dirname, "packages/sync-engine/src/index.ts"),
      "@bookstack-sync/bookstack-adapter": path.resolve(
        __dirname,
        "packages/bookstack-adapter/src/index.ts",
      ),
      "@bookstack-sync/anythingllm-adapter": path.resolve(
        __dirname,
        "packages/anythingllm-adapter/src/index.ts",
      ),
    },
  },
  test: {
    include: [
      "tests/**/*.test.ts",
      "packages/**/*.test.ts",
      "apps/**/*.test.ts",
    ],
    environment: "node",
    reporters: ["default"],
  },
});
