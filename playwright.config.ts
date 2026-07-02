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
    // Cold Vite dep-optimization (heavy deps: maplibre, react, motion) can take
    // well over a minute on a fresh CI cache; keep generous headroom.
    timeout: 180_000,
    url: baseURL,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      // 触摸 + 移动布局（viewport <1024 → useMobile() 为真）。用于下滑关闭的触摸路径，
      // 触摸拖拽经 CDP Input.dispatchTouchEvent 派发（见 e2e/dismiss-gesture.spec.ts）。
      // 仅跑手势 spec；runtime-state 等桌面 spec 只在 chromium 上跑。
      name: "mobile",
      use: { ...devices["Pixel 5"] },
      testMatch: /dismiss-gesture\.spec\.ts/,
    },
  ],
});
