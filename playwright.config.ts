import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:1924";

export default defineConfig({
  testDir: "./apps/web/e2e",
  timeout: 30_000,
  expect: {
    timeout: 8_000,
  },
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [["github"], ["html"]] : [["list"], ["html"]],
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  webServer: {
    command:
      "pnpm --filter @afilmory/web exec vite --host 127.0.0.1 --port 1924 --strictPort",
    env: {
      AFILMORY_EMBED_MANIFEST: "true",
    },
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    url: baseURL,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
