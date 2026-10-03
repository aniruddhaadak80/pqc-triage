import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.PORT ?? 3210);
const baseURL = process.env.VERIFY_BASE_URL ?? `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir:"./tests/browser",
  globalSetup: "./tests/global-setup.ts",
  timeout: 180_000,
  expect: { timeout: 30_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL,
    trace: "off",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], channel: "msedge", viewport: { width: 1440, height: 900 } },
    },
    {
      name: "mobile",
      use: { ...devices["Pixel 7"], channel: "msedge" },
    },
  ],
  // Run `npm run build` first, then `npm run test:browser`. Against an already
  // running deployment, set VERIFY_BASE_URL and no server is started.
  webServer: process.env.VERIFY_BASE_URL
    ? undefined
    : {
        command: `npx next start --port ${PORT}`,
        url: baseURL,
        reuseExistingServer: true,
        timeout: 240_000,
      },
});