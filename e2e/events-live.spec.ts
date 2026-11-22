import { expect, test } from "@playwright/test";
import { FAKE_GITHUB } from "../playwright.config.ts";

/**
 * Slice 6: live snapshots become events in the Activity log, and search and keys work on live data.
 * The fake GitHub only serves open issues today, so live data can trigger Rift and Close; the other
 * event types are checked through the demo panel, which also runs on live data (pretend events).
 */
const setIssues = (issues: { number: number; title: string; assignees?: string[] }[]) =>
  fetch(`${FAKE_GITHUB}/__issues`, { method: "POST", body: JSON.stringify({ repo: "acme/web", issues }) });

const BASE = [{ number: 1, title: "Sort the sidebar" }, { number: 2, title: "Empty-state text", assignees: ["alice"] }];

test.beforeEach(async ({ request }) => {
  await setIssues(BASE);
  await expect.poll(async () => Object.keys((await (await request.get("/api/snapshot")).json()).universe.issues)).toEqual(["acme/web#1", "acme/web#2"]);
});

test("a changed live snapshot plays a Rift and a Close, each with its log line", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".lab-gal")).toHaveText(/2 open/);
  await setIssues([BASE[1], { number: 3, title: "Measure load time" }]);
  const rift = page.locator(".log li", { hasText: "Rift" });
  const close = page.locator(".log li", { hasText: "Close" });
  await expect(rift).toContainText("New issue #3 · acme/web");
  await expect(close).toContainText("#1 closed · acme/web");
  await expect(close.locator("a.log-ext")).toHaveAttribute("href", "https://github.com/acme/web/issues/1");
  await expect(page.locator(".lab-gal")).toHaveText(/2 open/);
});

test("search finds a live issue by number and by title", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".lab-gal")).toHaveText(/2 open/);
  await page.keyboard.press("/");
  const box = page.getByRole("combobox", { name: "Search for an issue or Map" });
  await box.fill("#2");
  await expect(page.getByRole("option").first()).toContainText("acme/web #2");
  await box.fill("sidebar");
  await expect(page.getByRole("option").first()).toContainText("Sort the sidebar");
});

test("key D opens the demo panel on live data and every event type adds its log line", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".lab-gal")).toHaveText(/2 open/);
  await page.keyboard.press("d");
  await expect(page.getByRole("heading", { name: "Demo mode", exact: true })).toBeVisible();
  const cases: [string, string, RegExp][] = [
    ["bigbang", "Big Bang", /New Map «/],
    ["flare", "Flare", /#\d+/],
    ["adopt", "Adopt", /#\d+/],
    ["rift", "Rift", /New issue #\d+/],
    ["comet", "Comet", /#\d+/],
    ["supernova", "Supernova", /#\d+/],
    ["fade", "Fade", /#\d+/],
  ];
  for (const [ev, tag, text] of cases) {
    await page.locator(`button[data-ev=${ev}]`).click();
    await expect(page.locator(".log li", { hasText: tag }).last()).toContainText(text, { timeout: 15_000 });
  }
});
