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
