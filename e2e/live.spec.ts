import { expect, test } from "@playwright/test";
import { FAKE_GITHUB } from "../playwright.config.ts";

const setIssues = (issues: { number: number; title: string; assignees?: string[] }[]) =>
  fetch(`${FAKE_GITHUB}/__issues`, { method: "POST", body: JSON.stringify({ repo: "acme/web", issues }) });

test.beforeEach(async () => {
  await setIssues([{ number: 1, title: "Sort the sidebar" }, { number: 2, title: "Empty-state text", assignees: ["alice"] }]);
});

test("shows the configured repo's real open issues", async ({ page, request }) => {
  await expect.poll(async () => Object.keys((await (await request.get("/api/snapshot")).json()).universe.issues)).toEqual(["acme/web#1", "acme/web#2"]);
  await page.goto("/");
  await expect(page.locator(".lab-gal")).toHaveText(/acme\/web\s*2 open/);
  await expect(page.locator(".fresh")).toContainText("updated");
  await expect(page.locator(".badge")).toHaveCount(0);
});

test("a new issue on GitHub arrives over the stream as a Rift", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".lab-gal")).toHaveText(/2 open/);
  await setIssues([{ number: 1, title: "Sort the sidebar" }, { number: 2, title: "Empty-state text", assignees: ["alice"] }, { number: 3, title: "Measure load time" }]);
  await expect(page.locator(".log li", { hasText: "Rift" })).toContainText("New issue #3");
  await expect(page.locator(".lab-gal")).toHaveText(/3 open/);
});
