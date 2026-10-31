import "./scripts/env";
import { defineConfig } from "@playwright/test";
if (!process.env.DEMO_PASSWORD)
  throw new Error(
    "Run npm run setup or set DEMO_PASSWORD before browser tests.",
  );
export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 60000,
  use: {
    baseURL: "http://127.0.0.1:3101",
    channel:
      process.env.PW_CHANNEL ??
      (process.platform === "win32" ? "chrome" : undefined),
    viewport: { width: 1440, height: 1000 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "npx tsx scripts/e2e-server.ts",
    url: "http://127.0.0.1:3101/api/health",
    timeout: 120000,
    reuseExistingServer: false,
  },
  reporter: [["list"]],
});
