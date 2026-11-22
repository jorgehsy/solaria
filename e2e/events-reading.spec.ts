import { expect, test } from "@playwright/test";
import { FAKE_GITHUB } from "../playwright.config.ts";

/**
 * Every live event type from real reading rules (slices 4 + 6): one change on the fake GitHub repo
 * `acme/maps` plays Big Bang, Flare, Adopt, Comet, Close, Supernova and Fade, each with its log line.
 */
const repo = (data: object) => fetch(`${FAKE_GITHUB}/__repo`, { method: "POST", body: JSON.stringify({ repo: "acme/maps", ...data }) });

test.beforeEach(async ({ request }) => {
  await repo({ reset: true });
  await expect.poll(async () => Object.keys((await (await request.get("/api/snapshot")).json()).universe.prs)).toEqual(["acme/maps!20", "acme/maps!21"]);
});
test.afterAll(async () => { await repo({ reset: true }); });

test("one change on GitHub plays every event type with its log line", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".lab-map")).toHaveCount(1);
  await repo({
    issues: [
      { number: 1, title: "Map: Launch", assignees: ["dana"], kids: [
        { number: 2, title: "Write the launch post" }, { number: 3, title: "Pick a date" }, { number: 4, title: "Book the venue", closed: true },
        { number: 5, title: "Print badges", closed: true }, { number: 7, title: "Send invites", closed: true },
        { number: 6, title: "Budget sign-off" }, { number: 32, title: "Order snacks" },
      ] },
      { number: 2, title: "Write the launch post", assignees: ["alice", "bob", "carol"] },
      { number: 3, title: "Pick a date", body: "Blocked by: #6" },
      { number: 6, title: "Budget sign-off" },
      { number: 8, title: "Map: Not a Planet" },
      { number: 30, title: "Map: Docs", kids: [{ number: 31, title: "Write the guide" }] },
      { number: 31, title: "Write the guide" },
      { number: 32, title: "Order snacks" },
    ],
    prs: [{ number: 22, title: "Pick the date", draft: true, closes: [{ number: 3 }] }],
    closedPrs: [
      { number: 21, title: "Invite list", merged: true, closes: [{ number: 7 }] },
      { number: 20, title: "Draft the post", merged: false, closes: [{ number: 2 }] },
      { number: 19, title: "Venue contract", merged: true, closes: [{ number: 4 }] },
    ],
  });
  const row = (tag: string) => page.locator(".log li", { hasText: new RegExp(`^${tag}`) });
  const opts = { timeout: 20_000 };
  await expect(row("Big Bang")).toContainText("New Map «Docs»", opts);
  await expect(row("Flare")).toContainText("#32 joins «Launch»", opts);
  await expect(row("Adopt")).toContainText("#6 added to «Launch»", opts);
  await expect(row("Comet")).toContainText("PR #22 opened", opts);
  await expect(row("Close")).toContainText("#5 closed", opts);
  await expect(row("Supernova")).toContainText("PR #21 merged", opts);
  await expect(row("Fade")).toContainText("PR #20 closed without merging", opts);
  await expect(page.locator(".lab-map")).toHaveCount(2);
});
