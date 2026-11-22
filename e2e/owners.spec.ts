import { expect, test } from "@playwright/test";
import { FAKE_GITHUB } from "../playwright.config.ts";

/**
 * Several owners (spec section 11) against the fake GitHub: `acme/fleet` on the main token,
 * `globex/core` on `GITHUB_TOKEN_GLOBEX`, `umbrella/lab` on a wrong `GITHUB_TOKEN_UMBRELLA`.
 * `acme/fleet`'s Map has a Planet in `globex/core` and one in `other/lib`, which is not configured.
 */
interface Snap {
  repos: { repo: string; ok: boolean; code?: string }[];
  universe: { maps: Record<string, unknown>; issues: Record<string, { map: string | null; blockers: string[]; external?: boolean; outsideBlockers?: string[] }> };
}

test("each owner's repos use that owner's token, with no fallback", async ({ request }) => {
  let s: Snap | undefined;
  await expect.poll(async () => {
    s = await (await request.get("/api/snapshot")).json();
    return s?.repos.map((r) => [r.repo, r.ok, r.code ?? null]);
  }).toEqual([["acme/fleet", true, null], ["globex/core", true, null], ["umbrella/lab", false, "bad_token"]]);
  const seen = (await (await fetch(`${FAKE_GITHUB}/__seen`)).json()) as Record<string, string[]>;
  expect(seen["acme/fleet"]).toEqual(["main-token"]);
  expect(seen["globex/core"]).toEqual(["globex-token"]);
  expect(seen["umbrella/lab"]).toEqual(["wrong-token"]);

  const u = s!.universe;
  expect(Object.keys(u.maps)).toEqual(["acme/fleet#1"]);
  expect(u.issues["globex/core#3"]).toMatchObject({ map: "acme/fleet#1" });
  expect(u.issues["globex/core#5"]).toMatchObject({ map: null });
  expect(u.issues["other/lib#4"]).toMatchObject({ map: "acme/fleet#1", external: true });
  expect(u.issues["acme/fleet#2"]).toMatchObject({ blockers: [], outsideBlockers: ["other/lib#9"] });
});

test("draws owner/repo Galaxies, the External Planet and the plain-text ref", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".lab-map")).toContainText("Release");
  for (const repo of ["acme/fleet", "globex/core", "umbrella/lab"]) await expect(page.locator(".lab-gal", { hasText: repo })).toHaveCount(1);

  const card = async (query: string, ref: string) => {
    await page.keyboard.press("/");
    await page.getByRole("combobox", { name: "Search for an issue or Map" }).fill(query);
    await page.getByRole("option").first().click();
    await expect(async () => {
      await page.mouse.move(720, 450);
      await page.mouse.move(721, 451);
      await expect(page.locator(".tip")).toContainText(ref, { timeout: 500 });
    }).toPass({ timeout: 8000 });
  };
  await card("Upstream fix", "other/lib #4");
  await expect(page.locator(".tip .tip-tag")).toHaveText("external");
  await page.mouse.move(5, 5);

  await card("Cut the branch", "acme/fleet #2");
  await expect(page.locator(".tip")).toContainText("blocked by other/lib#9 (not in your universe)");
  await expect(page.locator(".tip")).toContainText("To do");
  await expect(page.locator(".tip .tip-tag")).toHaveCount(0);
});
