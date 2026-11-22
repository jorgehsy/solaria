import { describe, expect, it } from "vitest";
import { UniverseData } from "@solaria/contract";
import { buildUniverse } from "./build.ts";
import type { RepoReply } from "../github/query.ts";
import oneRepo from "./fixtures/one-repo.json" with { type: "json" };

describe("buildUniverse", () => {
  const reply = oneRepo as RepoReply;

  it("turns every open issue into Gas, keyed owner/repo#N", () => {
    const u = buildUniverse(["acme/web"], new Map([["acme/web", reply]]), 1000);
    expect(UniverseData.parse(u)).toEqual(u);
    expect(Object.keys(u.issues)).toEqual(["acme/web#1", "acme/web#2"]);
    expect(u.issues["acme/web#2"]).toEqual({
      key: "acme/web#2", repo: "acme/web", number: 2, title: "Empty-state text", url: "https://github.com/acme/web/issues/2",
      map: null, blockers: [], assignees: ["alice", "bob"], closed: false, created: Date.parse("2026-11-20T10:00:00Z"), closedAt: 0,
    });
  });

  it("keeps a Galaxy for a repo with no reply", () => {
    const u = buildUniverse(["acme/web", "acme/api"], new Map([["acme/web", reply]]), 1000);
    expect(u.repos).toEqual(["acme/web", "acme/api"]);
    expect(Object.values(u.issues).every((i) => i.repo === "acme/web")).toBe(true);
  });

  it("is pure: same input, same output", () => {
    const m = new Map([["acme/web", reply]]);
    expect(buildUniverse(["acme/web"], m, 5)).toEqual(buildUniverse(["acme/web"], m, 5));
  });
});
