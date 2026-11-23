import { expect, test } from "@playwright/test";
import { FAKE_GITHUB } from "../playwright.config.ts";

/** Reading rules (spec section 5) against the fake GitHub repo `acme/maps`. */
test.beforeEach(async ({ request }) => {
  await fetch(`${FAKE_GITHUB}/__repo`, { method: "POST", body: JSON.stringify({ repo: "acme/maps", reset: true }) });
  await expect.poll(async () => Object.keys((await (await request.get("/api/snapshot")).json()).universe.prs)).toEqual(["acme/maps!20", "acme/maps!21"]);
});

test("a Map, its Planets, blockers and PRs arrive in the snapshot", async ({ request }) => {
  let u: { maps: Record<string, { title: string }>; issues: Record<string, { map: string | null; closed: boolean; blockers: string[] }>; prs: Record<string, { draft: boolean; closes: string[] }>; closedPrs: Record<string, { merged: boolean }> } | undefined;
  await expect.poll(async () => {
    u = (await (await request.get("/api/snapshot")).json()).universe;
    return Object.keys(u?.maps ?? {});
  }).toEqual(["acme/maps#1"]);
  expect(u?.maps["acme/maps#1"]?.title).toBe("Launch");
  const planets = Object.entries(u?.issues ?? {}).filter(([, i]) => i.map === "acme/maps#1").map(([k]) => k).sort();
  expect(planets).toEqual(["acme/maps#2", "acme/maps#3", "acme/maps#4", "acme/maps#5", "acme/maps#7"]);
  expect(u?.issues["acme/maps#4"]?.closed).toBe(true);
  expect(u?.issues["acme/maps#8"]?.map).toBeNull();
  expect(u?.issues["acme/maps#3"]?.blockers).toEqual(["acme/maps#6"]);
  expect(u?.issues["acme/maps#5"]?.blockers).toEqual(["acme/maps#6"]);
  expect(u?.prs["acme/maps!20"]).toMatchObject({ draft: true, closes: ["acme/maps#2"] });
  expect(u?.prs["acme/maps!21"]).toMatchObject({ draft: false, closes: ["acme/maps#7"] });
  expect(u?.closedPrs["acme/maps!19"]?.merged).toBe(true);
});

test("draws the Sun with its Planets' states and a Satellite", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".lab-map")).toHaveCount(1);
  await expect(page.locator(".lab-map")).toContainText("Launch");
  await expect(page.locator(".lab-sat", { hasText: "alice +2" })).toHaveCount(1);
  for (const [n, state] of [["2", "Draft PR open"], ["3", "Blocked"], ["4", "Done"], ["5", "Blocked"], ["7", "In review"], ["6", "To do"]] as const) {
    await page.keyboard.press("/");
    await page.getByRole("combobox", { name: "Search for an issue or Map" }).fill(`#${n}`);
    await page.getByRole("option").first().click();
    // Search flies the camera to the issue; hovering the middle of the screen shows its card.
    await expect(async () => {
      await page.mouse.move(720, 450);
      await page.mouse.move(721, 451);
      await expect(page.locator(".tip")).toContainText(`acme/maps #${n}`, { timeout: 500 });
    }).toPass({ timeout: 8000 });
    await expect(page.locator(".tip")).toContainText(state);
    if (n === "2") {
      // The card stays while the pointer crosses the gap into it, so its GitHub link can be clicked.
      const link = page.locator(".tip a", { hasText: "Open on GitHub" });
      const box = (await link.boundingBox())!;
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 8 });
      await page.waitForTimeout(600);
      await expect(page.locator(".tip")).toContainText("acme/maps #2");
      await expect(link).toHaveAttribute("href", /\/acme\/maps\/issues\/2$/);
      await link.hover();
    }
    await page.mouse.move(5, 5);
  }
});
