import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { FAKE_GITHUB } from "../playwright.config.ts";

// 30 `fleet/*` repos (e2e/fixtures/many). The fake GitHub gives each a few open issues by name.
// Only this spec touches `fleet/*` repos, so it never collides with the live spec's `acme/web`.

const HZ = ".lab-gal[data-tier='horizon']";
const FOCUS = ".lab-gal[data-tier='focus']";

const boxes = (page: Page, sel = ".lab-gal") =>
  page.locator(sel).evaluateAll((els) =>
    els.map((e) => {
      const r = e.getBoundingClientRect();
      return { text: e.textContent ?? "", x0: r.left, x1: r.right, y0: r.top, y1: r.bottom, op: getComputedStyle(e).opacity };
    }),
  );
const repoOf = (text: string) => text.replace(/(\d+ open|nothing open|no data)$/, "");
/** Matches one repo's label exactly, not a longer repo name that starts the same. */
const exact = (repo: string) => new RegExp(`^${repo.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\d+ open|nothing open|no data)$`);

test("30 repos: 3 in Focus on screen, 27 on the Horizon at full size, full labels, no overlaps", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".lab-gal")).toHaveCount(30);
  await expect(page.locator(HZ)).toHaveCount(27);
  await expect(page.locator(FOCUS)).toHaveCount(3);
  // Every Galaxy shows owner/repo and the count: nothing is shrunk or truncated.
  for (const t of await page.locator(".lab-gal").allTextContents()) expect(t).toMatch(/^fleet\/.+(open|nothing open)$/);

  // Let the intro and camera settle. Focus labels are on screen; the Horizon may run past the edges.
  await page.waitForTimeout(2500);
  for (const b of await boxes(page, FOCUS)) {
    expect(b.x0, b.text).toBeGreaterThanOrEqual(0);
    expect(b.x1, b.text).toBeLessThanOrEqual(1440);
    expect(b.y0, b.text).toBeGreaterThanOrEqual(0);
    expect(b.y1, b.text).toBeLessThanOrEqual(900);
    expect(b.op, b.text).not.toBe("0");
  }
  // An off-screen Galaxy hides its label (opacity 0): with 30 full-size Galaxies, some must be off screen.
  const all = await boxes(page);
  expect(all.filter((b) => b.op === "0").length, "some Horizon Galaxies are off screen").toBeGreaterThan(0);
  const bs = all.filter((b) => b.op !== "0");
  for (let i = 0; i < bs.length; i++)
    for (let j = i + 1; j < bs.length; j++) {
      const a = bs[i]!, b = bs[j]!;
      expect(a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0, `${a.text} overlaps ${b.text}`).toBe(false);
    }
});

test("zooming out brings off-screen Galaxies into view", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".lab-gal")).toHaveCount(30);
  await page.waitForTimeout(2500);
  const shown = async () => (await boxes(page)).filter((b) => b.op !== "0").length;
  const before = await shown();
  expect(before).toBeLessThan(30);
  await page.mouse.move(720, 450);
  for (let i = 0; i < 3; i++) { await page.mouse.wheel(0, 300); await page.waitForTimeout(60); }
  await page.waitForTimeout(800);
  // Zoomed out, Galaxies that were off screen come into view (labels that would cover another stay hidden).
  expect(await shown()).toBeGreaterThan(before + 3);
});

test("clicking a Horizon Galaxy flies the camera to it and does not swap it into Focus", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(HZ)).toHaveCount(27);
  await page.waitForTimeout(2000);
  // The first Horizon Galaxy sits next to Focus, so its label is on screen.
  const hz = page.locator(HZ).first();
  const name = repoOf((await hz.textContent()) ?? "");
  const before = await hz.boundingBox();
  await hz.click();
  await page.waitForTimeout(1500);
  await expect(page).toHaveURL(/127\.0\.0\.1:4760\/$/);
  const after = await page.locator(HZ, { hasText: exact(name) }).boundingBox();
  expect(after && before && Math.hypot(after.x - before.x, after.y - before.y)).toBeGreaterThan(50);
});

test("Focus is recomputed from each snapshot", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(HZ)).toHaveCount(27);
  const repo = repoOf((await page.locator(HZ).last().textContent()) ?? "");
  await fetch(`${FAKE_GITHUB}/__issues`, {
    method: "POST",
    body: JSON.stringify({ repo, issues: Array.from({ length: 20 }, (_, i) => ({ number: i + 1, title: `Rush ${i + 1}` })) }),
  });
  // New issues arrive one Rift at a time (1.5 s each), so wait for the swap, not the final count.
  await expect(page.locator(FOCUS, { hasText: exact(repo) })).toHaveCount(1, { timeout: 20_000 });
  await expect(page.locator(HZ)).toHaveCount(27);
});

test("Galaxy notes never stack: visible notes stay on screen and never overlap", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(HZ)).toHaveCount(27);
  // Cards wait 4 s on first load.
  await page.waitForTimeout(5000);
  const notes = await page.locator(".lab-note, .lab-quiet").evaluateAll((els) =>
    els.map((e) => {
      const r = e.getBoundingClientRect();
      return { repo: e.getAttribute("data-repo") ?? "", on: getComputedStyle(e).visibility !== "hidden", x0: r.left, x1: r.right, y0: r.top, y1: r.bottom };
    }),
  );
  expect(notes.length).toBeGreaterThan(10);
  const shown = notes.filter((n) => n.on);
  expect(shown.length).toBeGreaterThan(0);
  for (const n of shown) {
    expect(n.y0, n.repo).toBeGreaterThanOrEqual(0);
    expect(n.y1, n.repo).toBeLessThanOrEqual(900);
  }
  for (let i = 0; i < shown.length; i++)
    for (let j = i + 1; j < shown.length; j++) {
      const a = shown[i]!, b = shown[j]!;
      expect(a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0, `${a.repo} overlaps ${b.repo}`).toBe(false);
    }
});
