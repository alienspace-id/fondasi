import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": import.meta.dirname,
      // "server-only" melempar error di luar Next.js; di test cukup diganti modul kosong.
      "server-only": path.join(import.meta.dirname, "tests/empty.ts"),
    },
  },
  test: {
    include: ["tests/**/*.test.ts"],
  },
});
