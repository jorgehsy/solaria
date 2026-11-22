import { describe, expect, it } from "vitest";
import { Config, ErrorCode, ServerSnapshot } from "./index.ts";

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
