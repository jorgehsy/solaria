import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { FAKE_GITHUB } from "../playwright.config.ts";

/**
 * Every row of the spec section 9 table, triggered through the fake GitHub's error modes.
 * Uses its own repos (errs/*) and Solaria server, and runs in order: modes are shared state.
 */
test.describe.configure({ mode: "serial" });

const REPOS = ["errs/web", "errs/empty", "errs/lib", "errs/dcos"] as const;
type Mode = "ok" | "401" | "403" | "404" | "rate" | "network";
const post = (path: string, body: unknown) => fetch(`${FAKE_GITHUB}${path}`, { method: "POST", body: JSON.stringify(body) });
const setMode = (repo: string, mode: Mode) => post("/__mode", { repo, mode });
const setIssues = (repo: string, issues: { number: number; title: string }[]) => post("/__issues", { repo, issues });

test.beforeEach(async () => {
  await setIssues("errs/web", [{ number: 1, title: "Sort the sidebar" }, { number: 2, title: "Empty-state text" }]);
  await setIssues("errs/empty", []);
  await setIssues("errs/lib", [{ number: 7, title: "Bump deps" }]);
  // errs/docs exists but is not configured: the did-you-mean for errs/dcos.
  await setIssues("errs/docs", [{ number: 1, title: "Write the guide" }]);
  await setMode("errs/web", "ok");
  await setMode("errs/empty", "ok");
  await setMode("errs/lib", "403");
  await setMode("errs/dcos", "404");
});

const note = (page: Page, repo: string) => page.locator(`.lab-note[data-repo="${repo}"]`);

test("some repos failing: ghosts with hints, a quiet empty Galaxy and the no-Maps card", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".lab-gal")).toHaveCount(4);
  await expect(page.getByRole("alert")).toHaveCount(0);

  await expect(page.locator('.lab-gal[data-look="ghost"]')).toHaveCount(2);
  await expect(page.locator(".lab-gal", { hasText: "errs/lib" })).toContainText("no data");
  await expect(note(page, "errs/lib")).toContainText("No access");
  await expect(note(page, "errs/lib")).toContainText("Org errs has not approved this token.");
  await expect(note(page, "errs/lib")).toContainText("GITHUB_TOKEN_ERRS=github_pat_xxxxxxxx");

  await expect(note(page, "errs/dcos")).toContainText("Repo not found");
  await expect(note(page, "errs/dcos")).toContainText("did you mean errs/docs?");
  await expect(note(page, "errs/dcos")).toContainText('"repos": ["errs/docs"]');

  await expect(page.locator('.lab-quiet[data-repo="errs/empty"]')).toHaveText("errs/empty: no open issues");
  await expect(note(page, "errs/web")).toContainText("No Maps yet");
  await expect(note(page, "errs/web")).toContainText("docs/repo-requirements.md");
});

test("network failure on one repo: last data stays drawn, dimmed, with its age", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".lab-gal", { hasText: "errs/web" })).toContainText("2 open");
  await setMode("errs/web", "network");
  await expect(note(page, "errs/web")).toContainText("Can't reach GitHub");
  await expect(note(page, "errs/web")).toContainText("Showing data from");
  await expect(page.locator('.lab-gal[data-look="dim"]', { hasText: "errs/web" })).toContainText("2 open");
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("rate limited: card parked top-centre with the resume time, Galaxies dimmed with small cards", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".lab-gal", { hasText: "errs/web" })).toContainText("2 open");
  await setMode("errs/web", "rate");
  const card = page.getByRole("alert");
  await expect(card.getByRole("heading", { name: "GitHub rate limit reached" })).toBeVisible();
  await expect(card).toContainText(/resumes at .+ \(in 1 min\)/);
  await expect(card).toHaveClass(/notice-top/);
  await expect(note(page, "errs/web")).toContainText("Rate limited");
  await expect(note(page, "errs/web")).toContainText("Showing the last good data until the limit resets.");
  await setMode("errs/web", "ok");
  // retry-after is 3 s: polling resumes on its own and the card goes.
  await expect(card).toHaveCount(0, { timeout: 15_000 });
});

test("every repo silent: one centred Couldn't read GitHub card", async ({ page }) => {
  for (const r of REPOS) await setMode(r, "network");
  await page.goto("/");
  const card = page.getByRole("alert");
  await expect(card.getByRole("heading", { name: "Couldn't read GitHub." })).toBeVisible({ timeout: 15_000 });
  await expect(card).toContainText("GitHub didn't respond. Trying again on the next refresh.");
});

test("rejected token: no Galaxies, one centred card with the .env line", async ({ page }) => {
  for (const r of REPOS) await setMode(r, "401");
  await page.goto("/");
  const card = page.getByRole("alert");
  await expect(card.getByRole("heading", { name: "GitHub rejected the token" })).toBeVisible({ timeout: 15_000 });
  await expect(card).toContainText("GITHUB_TOKEN=github_pat_xxxxxxxx");
  await expect(page.locator(".lab-gal")).toHaveCount(0);
});

test("cards toggle: cards wait 4 s on first load, hide on click and stay hidden after reload", async ({ page }) => {
  await page.goto("/");
  const card = note(page, "errs/lib");
  await expect(card).toContainText("No access");
  await expect(card).toBeHidden();
  await expect(card).toBeVisible({ timeout: 8000 });

  const toggle = page.getByRole("button", { name: /^Cards:/ });
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator(".lab-note:visible, .lab-quiet:visible")).toHaveCount(0);

  await page.reload();
  await expect(note(page, "errs/lib")).toContainText("No access");
  await page.waitForTimeout(5000);
  await expect(page.getByRole("button", { name: /^Cards:/ })).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator(".lab-note:visible, .lab-quiet:visible")).toHaveCount(0);

  await page.keyboard.press("c");
  await expect(note(page, "errs/lib")).toBeVisible();
});
