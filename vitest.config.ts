import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  test: {
    exclude: ["**/node_modules/**", "**/e2e/**", "**/generated/**"],
    environment: "node",
    globals: true,
    setupFiles: ["./tests/setup.ts"],
  },
  resolve: {
    alias: [
      {
        find: "@/Docs",
        replacement: path.resolve(import.meta.dirname, "Docs"),
      },
      {
        find: "@/lib/utils",
        replacement: path.resolve(
          import.meta.dirname,
          "frontend/src/lib/utils.ts",
        ),
      },
      {
        find: "@/lib",
        replacement: path.resolve(import.meta.dirname, "shared/lib"),
      },
      {
        find: "@server",
        replacement: path.resolve(import.meta.dirname, "backend/lib"),
      },
      {
        find: "@",
        replacement: path.resolve(import.meta.dirname, "frontend/src"),
      },
    ],
  },
});
