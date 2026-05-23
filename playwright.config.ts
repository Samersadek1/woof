import { defineConfig, devices } from "@playwright/test";
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.test" });

const E2E_PORT = Number(process.env.PLAYWRIGHT_WEB_PORT ?? "8091");

export default defineConfig({
  testDir: "./tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: `http://localhost:${E2E_PORT}`,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    storageState: "tests/e2e/.auth/admin.json",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: `PORT=${E2E_PORT} npm run dev -- --host 127.0.0.1 --port ${E2E_PORT}`,
    port: E2E_PORT,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      ...process.env,
      VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL,
      VITE_SUPABASE_PUBLISHABLE_KEY:
        process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? process.env.VITE_SUPABASE_ANON_KEY,
    },
  },
});
