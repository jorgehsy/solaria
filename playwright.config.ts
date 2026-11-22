import { defineConfig, devices } from "@playwright/test";
import path from "node:path";

const PORT = 4748;
const LIVE_PORT = 4749;
const ERRORS_PORT = 4751;
export const FAKE_GITHUB = "http://127.0.0.1:4790";

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
  projects: [
    { name: "demo", testMatch: /demo\.spec\.ts/, use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
    // Live spec files share one fake GitHub, so they run one at a time.
    { name: "live", testMatch: /live\.spec\.ts/, workers: 1, use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 }, baseURL: `http://127.0.0.1:${LIVE_PORT}` } },
    { name: "errors", testMatch: /errors\.spec\.ts/, use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 }, baseURL: `http://127.0.0.1:${ERRORS_PORT}` } },
  ],
  // Started in order: the first builds the web app that both Solaria servers serve.
  webServer: [
    {
      command: `pnpm --filter @solaria/web build && PORT=${PORT} SOLARIA_DIR=${path.resolve(import.meta.dirname, "e2e/fixtures/demo")} pnpm --filter @solaria/server start`,
      url: `http://127.0.0.1:${PORT}/api/snapshot`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: "pnpm exec tsx e2e/fake-github.ts",
      url: `${FAKE_GITHUB}/__health`,
      reuseExistingServer: !process.env.CI,
    },
    {
      command: `PORT=${LIVE_PORT} GITHUB_API_URL=${FAKE_GITHUB} SOLARIA_DIR=${path.resolve(import.meta.dirname, "e2e/fixtures/live")} pnpm --filter @solaria/server start`,
      url: `http://127.0.0.1:${LIVE_PORT}/api/snapshot`,
      reuseExistingServer: !process.env.CI,
    },
    {
      command: `PORT=${ERRORS_PORT} GITHUB_API_URL=${FAKE_GITHUB} SOLARIA_DIR=${path.resolve(import.meta.dirname, "e2e/fixtures/errors")} pnpm --filter @solaria/server start`,
      url: `http://127.0.0.1:${ERRORS_PORT}/api/snapshot`,
      reuseExistingServer: !process.env.CI,
    },
  ],
});
