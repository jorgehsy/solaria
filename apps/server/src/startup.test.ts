import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { initialSnapshot, startup } from "./startup.ts";
import { ConfigError } from "./config/config.ts";

function root(files: Record<string, string>): string {
  const dir = mkdtempSync(path.join(tmpdir(), "solaria-"));
  for (const [f, t] of Object.entries(files)) writeFileSync(path.join(dir, f), t);
  return dir;
}

describe("startup", () => {
  it("runs the demo when solaria.config.json is missing, even with no .env", () => {
    const s = startup(root({}), {});
    expect(s.mode).toBe("demo");
    expect(initialSnapshot(s)).toEqual({ mode: "demo" });
  });

  it("refuses a broken config", () => {
    expect(() => startup(root({ "solaria.config.json": "{" }), {})).toThrow(ConfigError);
  });

  it("is live with a universe-wide bad_token when no repo has a token", () => {
    const s = startup(root({ "solaria.config.json": '{ "repos": ["acme/web"] }' }), {});
    expect(initialSnapshot(s)).toMatchObject({
      mode: "live",
      status: { state: "error", code: "bad_token" },
      repos: [{ repo: "acme/web", ok: false, code: "bad_token", hint: "GITHUB_TOKEN_ACME or GITHUB_TOKEN" }],
    });
  });

  it("reads tokens from .env and logs one line per repo", () => {
    const s = startup(root({
      "solaria.config.json": '{ "repos": ["acme/web", "my-org/api", "other/lib"] }',
      ".env": "GITHUB_TOKEN_MY_ORG=own\n",
    }), {});
    expect(s.log).toEqual([
      "acme/web → no token (add GITHUB_TOKEN_ACME or GITHUB_TOKEN to .env)",
      "my-org/api → GITHUB_TOKEN_MY_ORG",
      "other/lib → no token (add GITHUB_TOKEN_OTHER or GITHUB_TOKEN to .env)",
    ]);
    // One repo has a token, so the others fail on their own Galaxy, not universe-wide.
    expect(initialSnapshot(s)).toMatchObject({ status: { state: "loading" } });
  });

  it("lets the shell override .env", () => {
    const s = startup(root({ "solaria.config.json": '{ "repos": ["acme/web"] }', ".env": "GITHUB_TOKEN=file\n" }), { GITHUB_TOKEN: "shell" });
    expect(s.mode === "live" && s.tokens[0]).toMatchObject({ token: "shell" });
  });

  it("shows zero repos as ok with no Galaxies (the No repos yet card)", () => {
    const s = startup(root({ "solaria.config.json": '{ "repos": [] }' }), { GITHUB_TOKEN: "x" });
    expect(initialSnapshot(s)).toMatchObject({ mode: "live", status: { state: "ok" }, repos: [] });
  });

  it("collapses duplicates with a warning", () => {
    const s = startup(root({ "solaria.config.json": '{ "repos": ["acme/web", "Acme/Web"] }' }), { GITHUB_TOKEN: "x" });
    expect(s.mode === "live" && s.repos).toEqual(["acme/web"]);
    expect(s.mode === "live" && s.warnings).toHaveLength(1);
  });
});
