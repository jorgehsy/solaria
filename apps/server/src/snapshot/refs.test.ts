import { describe, expect, it } from "vitest";
import { blockedByRefs, configuredRepos, parseRefs } from "./refs.ts";

describe("refs", () => {
  it("completes #N, repo#N and owner/repo#N from the issue they are written in", () => {
    expect(parseRefs("#12, api#4 other/lib#9", "acme/web")).toEqual([
      { repo: "acme/web", number: 12 }, { repo: "acme/api", number: 4 }, { repo: "other/lib", number: 9 },
    ]);
  });
  it("reads only lines that start with `Blocked by:`", () => {
    expect(blockedByRefs("Intro #1\nBlocked by: #2\n  Blocked by: #3\nblocked by: #4\nBlocked by: #5", "acme/web").map((r) => r.number)).toEqual([2, 5]);
    expect(blockedByRefs(null, "acme/web")).toEqual([]);
  });
  it("matches repo names to the config without case", () => {
    const r = configuredRepos(["Acme/Web"]);
    expect(r("acme/web")).toBe("Acme/Web");
    expect(r("acme/api")).toBeNull();
  });
});
