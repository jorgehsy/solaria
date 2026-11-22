import { describe, expect, it } from "vitest";
import { Config, ErrorCode, ServerSnapshot } from "./index.ts";
import type { LiveSnapshot } from "./index.ts";

describe("Config", () => {
  it("accepts exactly a repos list", () => {
    expect(Config.parse({ repos: ["acme/web", "my-org/api.v2"] })).toEqual({ repos: ["acme/web", "my-org/api.v2"] });
  });
  it("rejects unknown keys", () => {
    expect(Config.safeParse({ repos: [], token: "x" }).success).toBe(false);
  });
  it("rejects a repo that is not owner/repo", () => {
    expect(Config.safeParse({ repos: ["web"] }).success).toBe(false);
  });
});

describe("ErrorCode", () => {
  it("has exactly the five codes", () => {
    expect(ErrorCode.options).toEqual(["bad_token", "no_access", "not_found", "rate_limited", "network"]);
  });
});

describe("ServerSnapshot", () => {
  it("parses the demo message", () => {
    expect(ServerSnapshot.parse({ mode: "demo" })).toEqual({ mode: "demo" });
  });
  it("rejects an unknown mode", () => {
    expect(ServerSnapshot.safeParse({ mode: "nope" }).success).toBe(false);
  });
});

describe("LiveSnapshot", () => {
  const live: LiveSnapshot = {
    mode: "live",
    status: { state: "error", code: "bad_token", hint: "GITHUB_TOKEN" },
    repos: [{ repo: "acme/web", ok: false, stale: false, code: "bad_token", hint: "GITHUB_TOKEN_ACME" }],
    checkedAt: 0,
    pollMs: 60_000,
    universe: { at: 0, repos: ["acme/web"], maps: {}, issues: {}, prs: {}, closedPrs: {} },
  };
  it("parses a live snapshot", () => {
    expect(ServerSnapshot.parse(live)).toEqual(live);
  });
  it("rejects an unknown error code", () => {
    expect(ServerSnapshot.safeParse({ ...live, status: { state: "error", code: "sso" } }).success).toBe(false);
  });
});
