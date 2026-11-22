import { describe, expect, it } from "vitest";
import type { RepoStatus, UniverseStatus } from "@solaria/contract";
import { galaxyNotes, universeCard } from "./galaxyNotes.ts";
import type { NotesInput } from "./galaxyNotes.ts";

const NOW = 10_000_000;
const ok = (repo: string): RepoStatus => ({ repo, ok: true, stale: false, okAt: NOW });
const fail = (repo: string, code: RepoStatus["code"], extra: Partial<RepoStatus> = {}): RepoStatus => ({ repo, ok: false, stale: false, code, ...extra });
const input = (repos: RepoStatus[], counts: NotesInput["counts"] = {}, status: UniverseStatus = { state: "ok" }): NotesInput => ({ mode: "live", status, repos, counts, now: NOW });

describe("galaxyNotes", () => {
  it("says nothing in demo mode or for a healthy repo with Maps", () => {
    expect(galaxyNotes({ ...input([ok("acme/web")]), mode: "demo" }).size).toBe(0);
    expect(galaxyNotes(input([ok("acme/web")], { "acme/web": { open: 3, maps: 1 } })).size).toBe(0);
  });

  it("draws a quiet italic line under an empty Galaxy", () => {
    expect(galaxyNotes(input([ok("acme/web")], { "acme/web": { open: 0, maps: 0 } })).get("acme/web")).toEqual({ look: "normal", quiet: "acme/web: no open issues" });
  });

  it("points a repo with issues but no Maps to the repo requirements", () => {
    const n = galaxyNotes(input([ok("acme/web")], { "acme/web": { open: 2, maps: 0 } })).get("acme/web");
    expect(n?.look).toBe("normal");
    expect(n?.card?.title).toBe("No Maps yet");
    expect(n?.card?.text).toContain("docs/repo-requirements.md");
  });

  it("turns no_access into a ghost with the SSO hint and the owner's token line", () => {
    const n = galaxyNotes(input([ok("acme/web"), fail("acme-corp/api", "no_access")])).get("acme-corp/api");
    expect(n).toEqual({
      look: "ghost",
      card: {
        title: "No access",
        text: "Org acme-corp has not approved this token. Authorize it for SSO at github.com/settings/tokens, or ask an org owner to approve it. Or give this org its own token:",
        snippet: "GITHUB_TOKEN_ACME_CORP=github_pat_xxxxxxxx",
      },
    });
  });

  it("turns not_found into a ghost with the did-you-mean when the server found one", () => {
    const n = galaxyNotes(input([fail("acme/dcos", "not_found", { hint: "acme/docs" })])).get("acme/dcos");
    expect(n?.look).toBe("ghost");
    expect(n?.card).toEqual({
      title: "Repo not found",
      text: "GitHub has no repo acme/dcos. Check the spelling in solaria.config.json (did you mean acme/docs?).",
      snippet: '"repos": ["acme/docs"]',
    });
  });

  it("drops the did-you-mean when there is no close match", () => {
    const n = galaxyNotes(input([fail("acme/zzz", "not_found")])).get("acme/zzz");
    expect(n?.card).toEqual({ title: "Repo not found", text: "GitHub has no repo acme/zzz. Check the spelling in solaria.config.json." });
  });

  it("gives a repo with no token a ghost and the variable to add", () => {
    const n = galaxyNotes(input([ok("acme/web"), fail("other/lib", "bad_token", { hint: "GITHUB_TOKEN_OTHER or GITHUB_TOKEN" })])).get("other/lib");
    expect(n).toEqual({ look: "ghost", card: { title: "Token rejected", snippet: "GITHUB_TOKEN_OTHER=github_pat_xxxxxxxx" } });
  });

  it("keeps a network failure's last data drawn, dimmed, with its age", () => {
    const n = galaxyNotes(input([fail("acme/web", "network", { stale: true, okAt: NOW - 4 * 60_000 })])).get("acme/web");
    expect(n).toEqual({
      look: "dim",
      card: { title: "Can't reach GitHub", text: "Can't reach api.github.com. Showing the last good data. Check your connection; Solaria retries on its own.", age: "Showing data from 4 min ago." },
    });
  });

  it("shows a network failure with no data yet as a ghost", () => {
    expect(galaxyNotes(input([fail("acme/web", "network")])).get("acme/web")?.look).toBe("ghost");
  });

  it("dims every Galaxy with a small card while the whole Universe is rate limited", () => {
    const status: UniverseStatus = { state: "ok", resumeAt: NOW + 30 * 60_000 };
    const notes = galaxyNotes(input([fail("acme/web", "rate_limited", { stale: true, okAt: NOW - 60_000 }), { ...ok("acme/api"), stale: true, okAt: NOW - 120_000 }], {}, status));
    expect(notes.get("acme/web")).toEqual({ look: "dim", card: { title: "Rate limited", text: "Showing the last good data until the limit resets.", age: "Showing data from 1 min ago." } });
    expect(notes.get("acme/api")).toEqual({ look: "dim", card: { title: "Rate limited", text: "Showing the last good data until the limit resets.", age: "Showing data from 2 min ago." } });
  });

  it("draws no notes when the token is rejected (no Galaxies at all)", () => {
    expect(galaxyNotes(input([fail("acme/web", "bad_token")], {}, { state: "error", code: "bad_token" })).size).toBe(0);
  });
});

describe("universeCard", () => {
  const card = (status: UniverseStatus, repos: RepoStatus[] = [ok("acme/web")]) => universeCard({ mode: "live", status, repos, now: NOW });

  it("is the demo card with the setup lines in demo mode", () => {
    expect(universeCard({ mode: "demo", status: { state: "ok" }, repos: [], now: NOW })).toMatchObject({ title: "Demo mode: no token", place: "centre" });
  });

  it("is the token card for a rejected token and the config card for zero repos", () => {
    expect(card({ state: "error", code: "bad_token" })).toMatchObject({ title: "GitHub rejected the token", snippet: "GITHUB_TOKEN=github_pat_xxxxxxxx", place: "centre" });
    expect(card({ state: "ok" }, [])).toMatchObject({ title: "No repos yet", place: "centre" });
  });

  it("is Couldn't read GitHub when every repo fails to answer", () => {
    expect(card({ state: "error", code: "network" })).toEqual({ title: "Couldn't read GitHub.", hint: "GitHub didn't respond. Trying again on the next refresh.", place: "centre" });
  });

  it("leaves no_access and not_found to each repo's ghost card, even when all fail", () => {
    expect(card({ state: "error", code: "no_access" })).toBeNull();
    expect(card({ state: "error", code: "not_found" })).toBeNull();
  });

  it("parks the rate limit card top-centre with the resume time and countdown", () => {
    const resumeAt = NOW + 25 * 60_000;
    const c = card({ state: "error", code: "rate_limited", resumeAt });
    expect(c?.place).toBe("top");
    expect(c?.title).toBe("GitHub rate limit reached");
    expect(c?.hint).toContain(`resumes at ${new Date(resumeAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} (in 25 min)`);
    expect(card({ state: "ok", resumeAt })?.place).toBe("top");
    expect(card({ state: "ok", resumeAt: NOW - 1 })).toBeNull();
  });

  it("is nothing while loading or when all is well", () => {
    expect(card({ state: "loading" })).toBeNull();
    expect(card({ state: "ok" })).toBeNull();
    expect(universeCard({ mode: "loading", status: { state: "loading" }, repos: [], now: NOW })).toBeNull();
  });
});
