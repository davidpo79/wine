import { defineConfig, devices } from "@playwright/test";

// Mock-buyer smoke test of the buying funnel (e2e/smoke.spec.ts). Never pays.
//
//   npm run e2e                                              local app on http://localhost:3000
//   BASE_URL=https://vinho.prendadenatal.com npm run e2e     production
//
// Against a local BASE_URL, Playwright starts `next start` itself unless something already listens on the port
// (run `npm run build` first; the app needs DATABASE_URL with migrations and seed applied).
// PW_CHROMIUM_PATH points at a preinstalled Chromium instead of `npx playwright install chromium`.
const BASE_URL = (process.env.BASE_URL || "http://localhost:3000").replace(/\/$/, "");
const local = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE_URL);
const port = Number(new URL(BASE_URL).port || 3000);

export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : [["list"]],
  use: {
    baseURL: BASE_URL,
    ...devices["Desktop Chrome"],
    locale: "pt-PT",
    timezoneId: "Europe/Lisbon",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    launchOptions: process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {},
  },
  webServer: local
    ? {
        command: `npx next start -p ${port}`,
        url: `${BASE_URL}/api/health`,
        reuseExistingServer: true,
        timeout: 120_000,
        stdout: "pipe",
        stderr: "pipe",
      }
    : undefined,
});
