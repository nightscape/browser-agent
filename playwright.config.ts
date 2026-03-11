import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  timeout: 30_000,
  use: {
    headless: true,
  },
  webServer: {
    command: "npm run dev",
    port: 4222,
    reuseExistingServer: true,
  },
});
