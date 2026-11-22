import { describe, expect, it } from "vitest";
import { chooseToken, ownerTokenVar, tokenLogLine } from "./tokens.ts";

describe("ownerTokenVar", () => {
  it("uppercases the owner and turns - into _", () => {
    expect(ownerTokenVar("my-org")).toBe("GITHUB_TOKEN_MY_ORG");
    expect(ownerTokenVar("acme")).toBe("GITHUB_TOKEN_ACME");
  });
});

describe("chooseToken", () => {
  it("prefers the owner's own token", () => {
    expect(chooseToken("acme/web", { GITHUB_TOKEN: "main", GITHUB_TOKEN_ACME: "own" })).toEqual({ kind: "token", repo: "acme/web", variable: "GITHUB_TOKEN_ACME", token: "own" });
  });
  it("falls back to the main token when the owner has none", () => {
    expect(chooseToken("other/lib", { GITHUB_TOKEN: "main", GITHUB_TOKEN_ACME: "own" })).toMatchObject({ variable: "GITHUB_TOKEN" });
  });
  it("names both variables when there is no token", () => {
    expect(chooseToken("acme/web", { GITHUB_TOKEN: "  " })).toEqual({ kind: "none", repo: "acme/web", hint: "GITHUB_TOKEN_ACME or GITHUB_TOKEN" });
  });
  it("logs the variable name, never the secret", () => {
    const line = tokenLogLine(chooseToken("acme/web", { GITHUB_TOKEN: "github_pat_secret" }));
    expect(line).toBe("acme/web → GITHUB_TOKEN");
    expect(line).not.toContain("secret");
  });
});
