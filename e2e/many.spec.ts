import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { FAKE_GITHUB } from "../playwright.config.ts";

// 30 `fleet/*` repos (e2e/fixtures/many). The fake GitHub gives each a few open issues by name.
// Only this spec touches `fleet/*` repos, so it never collides with the live spec's `acme/web`.

const boxes = (page: Page) =>
  page.locator(".lab-gal").evaluateAll((els) =>
    els.map((e) => {
      const r = e.getBoundingClientRect();
      return { text: e.textContent ?? "", hz: e.classList.contains("lab-hz"), x0: r.left, x1: r.right, y0: r.top, y1: r.bottom, op: getComputedStyle(e).opacity };
    }),
  );

test("30 repos: 3 in Focus, 27 on the Horizon with truncated labels and no overlaps at 1440x900", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".lab-gal")).toHaveCount(30);
  await expect(page.locator(".lab-gal.lab-hz")).toHaveCount(27);
  await expect(page.locator(".lab-gal:not(.lab-hz)")).toHaveCount(3);
  // Focus shows owner/repo and the count; Horizon the repo name only, full name on hover.
  for (const t of await page.locator(".lab-gal:not(.lab-hz)").allTextContents()) expect(t).toMatch(/^fleet\/.+(open|nothing open)$/);
  const long = page.locator(".lab-hz[title='fleet/billing-and-invoicing-service']");
  await expect(long).toHaveText("billing-and-invoicing-service");
  expect(await long.evaluate((e) => e.scrollWidth > e.clientWidth)).toBe(true);

  // Let the intro and camera settle, then check every label is on screen, visible and alone.
  await page.waitForTimeout(2500);
  const bs = await boxes(page);
  for (const b of bs) {
    expect(b.x0, b.text).toBeGreaterThanOrEqual(0);
    expect(b.x1, b.text).toBeLessThanOrEqual(1440);
    expect(b.y0, b.text).toBeGreaterThanOrEqual(0);
    expect(b.y1, b.text).toBeLessThanOrEqual(900);
    expect(b.op, b.text).not.toBe("0");
  }
  for (let i = 0; i < bs.length; i++)
    for (let j = i + 1; j < bs.length; j++) {
      const a = bs[i]!, b = bs[j]!;
      expect(a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0, `${a.text} overlaps ${b.text}`).toBe(false);
    }
});

test("clicking a Horizon Galaxy flies the camera to it and does not swap it into Focus", async ({ page }) => {
  await page.goto("/");
  const hz = page.locator(".lab-hz").first();
  await expect(page.locator(".lab-hz")).toHaveCount(27);
  await page.waitForTimeout(2000);
  const name = await hz.getAttribute("title");
  const before = await hz.boundingBox();
  await hz.click();
  await page.waitForTimeout(1500);
  await expect(page).toHaveURL(/127\.0\.0\.1:4760\/$/);
  const after = await page.locator(`.lab-gal[title='${name}']`).boundingBox();
  expect(after && before && Math.hypot(after.x - before.x, after.y - before.y)).toBeGreaterThan(50);
  await expect(page.locator(`.lab-gal[title='${name}']`)).toHaveClass(/lab-hz/);
});

test("Focus is recomputed from each snapshot", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".lab-hz")).toHaveCount(27);
  const repo = (await page.locator(".lab-hz").last().getAttribute("title")) ?? "";
  await fetch(`${FAKE_GITHUB}/__issues`, {
    method: "POST",
    body: JSON.stringify({ repo, issues: Array.from({ length: 20 }, (_, i) => ({ number: i + 1, title: `Rush ${i + 1}` })) }),
  });
  await expect(page.locator(".lab-gal:not(.lab-hz)", { hasText: repo })).toContainText("20 open", { timeout: 15_000 });
  await expect(page.locator(".lab-hz")).toHaveCount(27);
});
