import { describe, expect, it } from "vitest";
import { ConfigError, loadConfig } from "./config.ts";

const reader = (text: string) => () => text;
const missing = () => { throw Object.assign(new Error("nope"), { code: "ENOENT" }); };

describe("loadConfig", () => {
  it("reports a missing file (demo mode)", () => {
    expect(loadConfig("solaria.config.json", missing)).toEqual({ kind: "missing" });
  });
  it("reads the repos", () => {
    expect(loadConfig("c.json", reader('{ "repos": ["acme/web", "acme/api"] }'))).toEqual({ kind: "ok", repos: ["acme/web", "acme/api"], warnings: [] });
  });
  it("accepts zero repos", () => {
    expect(loadConfig("c.json", reader('{ "repos": [] }'))).toEqual({ kind: "ok", repos: [], warnings: [] });
  });
  it("names the JSON problem", () => {
    expect(() => loadConfig("c.json", reader('{ "repos": [ }'))).toThrow(/c\.json is not valid JSON/);
  });
  it("names an unknown key", () => {
    expect(() => loadConfig("c.json", reader('{ "repos": [], "token": "x" }'))).toThrow(ConfigError);
    expect(() => loadConfig("c.json", reader('{ "repos": [], "token": "x" }'))).toThrow(/token/);
  });
  it("names the bad entry", () => {
    expect(() => loadConfig("c.json", reader('{ "repos": ["acme/web", "web"] }'))).toThrow(/repos\.1: expected owner\/repo/);
  });
  it("collapses duplicates case-insensitively with a warning", () => {
    const r = loadConfig("c.json", reader('{ "repos": ["acme/web", "ACME/Web", "acme/api"] }'));
    expect(r).toMatchObject({ kind: "ok", repos: ["acme/web", "acme/api"] });
    if (r.kind === "ok") expect(r.warnings).toEqual(["c.json lists ACME/Web more than once (as acme/web); showing it once."]);
  });
});
