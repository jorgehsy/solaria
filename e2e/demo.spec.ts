import { expect, test } from "@playwright/test";

test("opens the demo Universe on 127.0.0.1", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle("Solaria");
  await expect(page.getByRole("heading", { name: "Universe" })).toBeVisible();
  await expect(page.locator(".badge")).toHaveText("Demo");
  await expect(page.locator(".gl canvas")).toBeVisible();
  await expect(page.locator(".lab-gal")).toHaveCount(3);
  await expect(page.locator(".lab-map")).toHaveCount(4);
  await expect(page.locator("#uDesc")).toContainText("Maps, across 3 repos");
});

test("shows the Demo mode: no token card with the setup lines", async ({ page }) => {
  await page.goto("/");
  const card = page.getByRole("alert");
  await expect(card.getByRole("heading", { name: "Demo mode: no token" })).toBeVisible();
  await expect(card).toContainText("cp .env.example .env");
  await expect(card).toContainText("GITHUB_TOKEN=github_pat_xxxxxxxx");
});

test("demo panel buttons play events into the Activity log", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".lab-map")).toHaveCount(4);
  await page.keyboard.press("d");
  await expect(page.getByRole("heading", { name: "Demo mode", exact: true })).toBeVisible();
  await page.locator("button[data-ev=rift]").click();
  await expect(page.locator(".log li").first()).toContainText("Rift");
  await expect(page.locator(".log li").first()).toContainText("New issue #");
  await page.locator("button[data-ev=bigbang]").click();
  await expect(page.locator(".log li", { hasText: "Big Bang" })).toContainText("New Map «");
  await expect(page.locator(".lab-map")).toHaveCount(5);
});

test("search finds an issue by number", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".lab-map")).toHaveCount(4);
  await page.keyboard.press("/");
  await page.getByRole("combobox", { name: "Search for an issue or Map" }).fill("#20");
  await expect(page.getByRole("option").first()).toContainText("acme/web #20");
  await expect(page.getByRole("option").first()).toContainText("Sort the sidebar");
});

test("pinch zoom never falls through to the browser's page zoom", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".lab-map")).toHaveCount(4);
  // A trackpad pinch is a ctrl+wheel. Over the canvas, a label, a UI panel, and past the zoom limit.
  const prevented = await page.evaluate(async () => {
    const pinch = (el: Element, deltaY: number) => {
      const r = el.getBoundingClientRect();
      const ev = new WheelEvent("wheel", { deltaY, ctrlKey: true, bubbles: true, cancelable: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 });
      el.dispatchEvent(ev);
      return ev.defaultPrevented;
    };
    const canvas = document.querySelector(".u")!;
    const out = { canvas: pinch(canvas, -10), label: pinch(document.querySelector(".lab-map")!, -10), panel: pinch(document.querySelector("header.brand")!, -10), atLimit: true };
    // Zoom all the way in, pause so d3-zoom's wheel gesture ends, then pinch in again at the limit.
    for (let i = 0; i < 200; i++) pinch(canvas, -500);
    await new Promise((r) => setTimeout(r, 400));
    out.atLimit = pinch(canvas, -500);
    return out;
  });
  expect(prevented).toEqual({ canvas: true, label: true, panel: true, atLimit: true });
});
