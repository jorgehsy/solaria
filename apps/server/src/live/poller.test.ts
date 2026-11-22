import { describe, expect, it } from "vitest";
import { Poller, universeStatus } from "./poller.ts";
import type { FetchResult } from "../github/client.ts";
import { chooseToken } from "../config/tokens.ts";
import type { TokenChoice } from "../config/tokens.ts";

const tok = (repo: string): TokenChoice => ({ kind: "token", repo, variable: "GITHUB_TOKEN", token: "t" });
const issue = (n: number) => ({ number: n, title: `#${n}`, url: `u${n}`, createdAt: "2026-11-20T10:00:00Z", assignees: { nodes: [] } });
const ok = (repo: string, ns: number[], remaining = 4000): FetchResult => ({ ok: true, reply: { nameWithOwner: repo, issues: ns.map(issue) }, rate: { remaining, limit: 5000, resetAt: 0, cost: 1 } });

function setup(tokens: TokenChoice[], answers: Record<string, FetchResult[]>) {
  let now = 1_000_000;
  const timers: { fn: () => void; ms: number }[] = [];
  const calls: string[] = [];
  const p = new Poller({
    tokens,
    fetchRepo: async (repo) => { calls.push(repo); return answers[repo]?.shift() ?? ok(repo, []); },
    now: () => now,
    log: () => undefined,
    setTimer: (fn, ms) => { timers.push({ fn, ms }); return timers.length; },
    clearTimer: () => undefined,
  });
  return { p, calls, timers, advance: (ms: number) => { now += ms; } };
}

describe("Poller", () => {
  it("reads each owner's repos with that owner's token, and a rejected owner token never falls back", async () => {
    const env = { GITHUB_TOKEN: "main", GITHUB_TOKEN_GLOBEX: "globex", GITHUB_TOKEN_UMBRELLA: "wrong" };
    const sent: [string, string][] = [];
    const p = new Poller({
      tokens: ["acme/web", "globex/core", "umbrella/lab"].map((r) => chooseToken(r, env)),
      fetchRepo: async (repo, token) => {
        sent.push([repo, token]);
        return repo === "umbrella/lab" ? { ok: false, code: "bad_token", message: "401", rate: null } : ok(repo, [1]);
      },
      log: () => undefined,
    });
    await p.pollOnce();
    await p.pollOnce();
    expect(sent).toEqual([["acme/web", "main"], ["globex/core", "globex"], ["umbrella/lab", "wrong"], ["acme/web", "main"], ["globex/core", "globex"], ["umbrella/lab", "wrong"]]);
    const s = p.snapshot();
    expect(s.repos.map((r) => [r.repo, r.ok, r.code])).toEqual([["acme/web", true, undefined], ["globex/core", true, undefined], ["umbrella/lab", false, "bad_token"]]);
    expect(Object.keys(s.universe.issues)).toEqual(["acme/web#1", "globex/core#1"]);
  });

  it("starts loading, then builds the snapshot from the replies", async () => {
    const { p } = setup([tok("acme/web")], { "acme/web": [ok("acme/web", [1, 2])] });
    expect(p.snapshot().status).toEqual({ state: "loading" });
    await p.pollOnce();
    const s = p.snapshot();
    expect(s.status).toEqual({ state: "ok" });
    expect(Object.keys(s.universe.issues)).toEqual(["acme/web#1", "acme/web#2"]);
    expect(s.checkedAt).toBe(1_000_000);
  });

  it("emits a snapshot when something changed and a fresh note when nothing did", async () => {
    const { p, advance } = setup([tok("acme/web")], { "acme/web": [ok("acme/web", [1]), ok("acme/web", [1]), ok("acme/web", [1, 2])] });
    const seen: string[] = [];
    p.subscribe((e) => seen.push(e.kind));
    await p.pollOnce();
    advance(60_000);
    await p.pollOnce();
    advance(60_000);
    await p.pollOnce();
    expect(seen).toEqual(["snapshot", "fresh", "snapshot"]);
  });

  it("polls every 60 s with a browser open and every 5 min without", () => {
    const { p } = setup([tok("acme/web")], {});
    expect(p.nextDelay()).toBe(300_000);
    const leave = p.addWatcher();
    expect(p.nextDelay()).toBe(60_000);
    leave();
    expect(p.nextDelay()).toBe(300_000);
  });

  it("polls at once when the first browser connects in slow mode", () => {
    const { p, timers } = setup([tok("acme/web")], {});
    p.start();
    expect(timers.at(-1)?.ms).toBe(0);
    timers.length = 0;
    p.addWatcher();
    expect(timers.at(-1)?.ms).toBe(0);
  });

  it("stretches to 5 min when under 20% of the rate budget is left", async () => {
    const { p } = setup([tok("acme/web")], { "acme/web": [ok("acme/web", [1], 900)] });
    p.addWatcher();
    await p.pollOnce();
    expect(p.nextDelay()).toBe(300_000);
  });

  it("keeps a failing repo's last good data, marked stale", async () => {
    const { p } = setup([tok("acme/web"), tok("acme/api")], {
      "acme/web": [ok("acme/web", [1]), { ok: false, code: "network", message: "x", rate: null }],
      "acme/api": [ok("acme/api", [5]), ok("acme/api", [5])],
    });
    await p.pollOnce();
    await p.pollOnce();
    const s = p.snapshot();
    expect(s.repos[0]).toEqual({ repo: "acme/web", ok: false, stale: true, code: "network" });
    expect(s.universe.issues["acme/web#1"]).toBeDefined();
    expect(s.status.state).toBe("ok");
  });

  it("stops the round and waits for retry-after when rate limited", async () => {
    const { p, calls } = setup([tok("acme/web"), tok("acme/api")], {
      "acme/web": [{ ok: false, code: "rate_limited", message: "x", rate: null, retryAfterMs: 120_000 }],
    });
    await p.pollOnce();
    expect(calls).toEqual(["acme/web"]);
    expect(p.nextDelay()).toBe(120_000);
    expect(p.snapshot().repos[0]).toMatchObject({ code: "rate_limited" });
  });

  it("never reads a repo that has no token", async () => {
    const none: TokenChoice = { kind: "none", repo: "other/lib", hint: "GITHUB_TOKEN_OTHER or GITHUB_TOKEN" };
    const { p, calls } = setup([tok("acme/web"), none], {});
    await p.pollOnce();
    expect(calls).toEqual(["acme/web"]);
    expect(p.snapshot().repos[1]).toMatchObject({ ok: false, code: "bad_token", hint: "GITHUB_TOKEN_OTHER or GITHUB_TOKEN" });
  });
});

describe("universeStatus", () => {
  const bad = (repo: string, code: "bad_token" | "network" | "rate_limited") => ({ repo, ok: false, stale: false, code });
  it("is an error only when every repo fails, a rejected token winning", () => {
    expect(universeStatus([bad("a/a", "network"), bad("b/b", "bad_token")], false, 0)).toEqual({ state: "error", code: "bad_token" });
    expect(universeStatus([bad("a/a", "network"), { repo: "b/b", ok: true, stale: false }], false, 0)).toEqual({ state: "ok" });
  });
  it("is ok with zero repos", () => {
    expect(universeStatus([], false, 0)).toEqual({ state: "ok" });
  });
  it("carries the resume time when rate limited", () => {
    expect(universeStatus([bad("a/a", "rate_limited")], false, 99)).toEqual({ state: "error", code: "rate_limited", resumeAt: 99 });
  });
});
