import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    forbidOnly: Boolean(process.env.CI),
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
    globals: true,
    css: true,
    exclude: ["tests/e2e/**", "**/node_modules/**", "**/dist/**"],
  },
});
