import { defineConfig, devices } from "@playwright/test";

const PORT = 4748;

/**
 * End-to-end checks in a real browser. The web app is built once and served by the Solaria server,
 * the same way `pnpm start` will run it. WebGL runs on SwiftShader so headless CI can draw.
 */
export default defineConfig({
  testDir: "e2e",
  timeout: 30_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: "off",
    launchOptions: { args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } }],
  webServer: {
    command: `pnpm --filter @solaria/web build && PORT=${PORT} pnpm --filter @solaria/server start`,
    url: `http://127.0.0.1:${PORT}/api/snapshot`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
