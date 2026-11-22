import { describe, expect, it } from "vitest";
import { UniverseData } from "@solaria/contract";
import { issueStates, satelliteLabel } from "@solaria/universe";
import type { Universe } from "@solaria/universe";
import { buildUniverse } from "./build.ts";
import type { GqlIssue, GqlSubIssue, RepoReply } from "../github/query.ts";
import oneRepo from "./fixtures/one-repo.json" with { type: "json" };

const T = "2026-11-20T10:00:00Z";
const issue = (number: number, title: string, more: Partial<GqlIssue> = {}): GqlIssue => ({
  number, title, url: `https://github.com/acme/web/issues/${number}`, createdAt: T, assignees: { nodes: [] }, ...more,
});
const kid = (repo: string, number: number, title: string, state: "OPEN" | "CLOSED" = "OPEN"): GqlSubIssue => ({
  number, title, url: `https://github.com/${repo}/issues/${number}`, state, createdAt: T,
  closedAt: state === "CLOSED" ? "2026-11-21T10:00:00Z" : null, repository: { nameWithOwner: repo },
});
const kids = (...nodes: GqlSubIssue[]) => ({ subIssues: { totalCount: nodes.length, nodes } });
const who = (...logins: string[]) => ({ assignees: { nodes: logins.map((login) => ({ login })) } });
const ref = (repo: string, number: number) => ({ number, repository: { nameWithOwner: repo } });
const web = (r: Partial<RepoReply>): RepoReply => ({ nameWithOwner: "acme/web", issues: [], ...r });
const build = (replies: Record<string, RepoReply>, repos = Object.keys(replies)) =>
  buildUniverse(repos, new Map(Object.entries(replies)), 1000);
const states = (u: UniverseData) => Object.fromEntries(issueStates(u as Universe));

describe("buildUniverse", () => {
  const reply = oneRepo as RepoReply;

  it("turns open issues without a Map into Gas, keyed owner/repo#N", () => {
    const u = build({ "acme/web": reply });
    expect(UniverseData.parse(u)).toEqual(u);
    expect(Object.keys(u.issues)).toEqual(["acme/web#1", "acme/web#2"]);
    expect(u.issues["acme/web#2"]).toEqual({
      key: "acme/web#2", repo: "acme/web", number: 2, title: "Empty-state text", url: "https://github.com/acme/web/issues/2",
      map: null, blockers: [], assignees: ["alice", "bob"], closed: false, created: Date.parse(T), closedAt: 0,
    });
    expect(states(u)).toEqual({ "acme/web#1": "todo", "acme/web#2": "todo" });
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

  describe("Maps and Planets", () => {
    it("makes a `Map: ` issue with sub-issues a Sun, title without prefix, and its children Planets", () => {
      const u = build({ "acme/web": web({ issues: [
        issue(10, "Map: Dark mode", { ...kids(kid("acme/web", 11, "Toggle"), kid("acme/web", 12, "Palette")), ...who("carol") }),
        issue(11, "Toggle"), issue(12, "Palette"), issue(13, "Loose"),
      ] }) });
      expect(u.maps).toEqual({ "acme/web#10": { key: "acme/web#10", repo: "acme/web", number: 10, title: "Dark mode", url: "https://github.com/acme/web/issues/10", assignees: ["carol"], created: Date.parse(T) } });
      expect(u.issues["acme/web#10"]).toBeUndefined();
      expect(u.issues["acme/web#11"]?.map).toBe("acme/web#10");
      expect(u.issues["acme/web#12"]?.map).toBe("acme/web#10");
      expect(u.issues["acme/web#13"]?.map).toBeNull();
    });

    it("accepts `Mapa: `", () => {
      const u = build({ "acme/web": web({ issues: [issue(1, "Mapa: Pagos", kids(kid("acme/web", 2, "Cobro"))), issue(2, "Cobro")] }) });
      expect(u.maps["acme/web#1"]?.title).toBe("Pagos");
    });

    it("a `Map: ` issue without sub-issues is Gas, with its title as written", () => {
      const u = build({ "acme/web": web({ issues: [issue(1, "Map: Someday", kids())] }) });
      expect(u.maps).toEqual({});
      expect(u.issues["acme/web#1"]).toMatchObject({ title: "Map: Someday", map: null });
    });

    it("a parent without the prefix is not a Map: its sub-issues are Gas", () => {
      const u = build({ "acme/web": web({ issues: [issue(1, "Epic thing", kids(kid("acme/web", 2, "Child"))), issue(2, "Child")] }) });
      expect(u.maps).toEqual({});
      expect(u.issues["acme/web#2"]?.map).toBeNull();
    });

    it("a sub-issue titled `Map: …` never becomes a Planet", () => {
      const u = build({ "acme/web": web({ issues: [
        issue(1, "Map: Outer", kids(kid("acme/web", 2, "Map: Inner"), kid("acme/web", 4, "Real"))),
        issue(2, "Map: Inner", kids(kid("acme/web", 3, "Deep"))), issue(3, "Deep"), issue(4, "Real"),
      ] }) });
      expect(Object.keys(u.maps)).toEqual(["acme/web#1", "acme/web#2"]);
      expect(u.issues["acme/web#3"]?.map).toBe("acme/web#2");
    });

    it("reads closed children as Done Planets with no Satellite, for progress", () => {
      const u = build({ "acme/web": web({ issues: [issue(1, "Map: Ship", kids(kid("acme/web", 2, "Open one"), kid("acme/web", 3, "Old one", "CLOSED"))), issue(2, "Open one")] }) });
      expect(u.issues["acme/web#3"]).toEqual({
        key: "acme/web#3", repo: "acme/web", number: 3, title: "Old one", url: "https://github.com/acme/web/issues/3",
        map: "acme/web#1", blockers: [], assignees: [], closed: true, created: Date.parse(T), closedAt: Date.parse("2026-11-21T10:00:00Z"),
      });
      expect(states(u)["acme/web#3"]).toBe("done");
    });

    it("a Planet may live in another configured repo; repo names match without case", () => {
      const u = build({
        "acme/web": web({ issues: [issue(1, "Map: Cross", kids(kid("Acme/API", 7, "Endpoint"), kid("acme/api", 8, "Gone", "CLOSED")))] }),
        "acme/api": { nameWithOwner: "acme/api", issues: [{ ...issue(7, "Endpoint"), url: "https://github.com/acme/api/issues/7" }] },
      });
      expect(u.issues["acme/api#7"]?.map).toBe("acme/web#1");
      expect(u.issues["acme/api#8"]).toMatchObject({ repo: "acme/api", closed: true, map: "acme/web#1" });
    });

    it("leaves out sub-issues of repos outside the config (External Planets come later)", () => {
      const u = build({ "acme/web": web({ issues: [issue(1, "Map: Ext", kids(kid("other/lib", 4, "Theirs"), kid("acme/web", 2, "Ours"))), issue(2, "Ours")] }) });
      expect(Object.keys(u.issues)).toEqual(["acme/web#2"]);
      expect(u.maps["acme/web#1"]).toBeDefined();
    });
  });

  describe("state order: Done > In review > Blocked > Draft PR open > To do", () => {
    const pr = (number: number, isDraft: boolean, ...closes: number[]) => ({
      number, title: `PR ${number}`, url: `https://github.com/acme/web/pull/${number}`, isDraft, createdAt: T,
      closingIssuesReferences: { nodes: closes.map((n) => ref("acme/web", n)) },
    });

    it("Done: a closed child stays Done even with a ready PR and an open blocker", () => {
      const u = build({ "acme/web": web({
        issues: [issue(1, "Map: M", kids(kid("acme/web", 2, "Closed", "CLOSED"))), issue(3, "Open blocker")],
        prs: [pr(50, false, 2)],
      }) });
      expect(states(u)["acme/web#2"]).toBe("done");
    });

    it("In review: a ready PR wins over an open blocker and a draft PR", () => {
      const u = build({ "acme/web": web({
        issues: [issue(1, "Work", { body: "Blocked by: #2" }), issue(2, "Blocker")],
        prs: [pr(50, true, 1), pr(51, false, 1)],
      }) });
      expect(u.prs["acme/web!51"]).toEqual({ key: "acme/web!51", repo: "acme/web", number: 51, title: "PR 51", url: "https://github.com/acme/web/pull/51", draft: false, closes: ["acme/web#1"], created: Date.parse(T) });
      expect(states(u)["acme/web#1"]).toBe("review");
    });

    it("Blocked: a `Blocked by:` line wins over a draft PR; all three ref forms work", () => {
      const u = build({
        "acme/web": web({
          issues: [issue(1, "Work", { body: "Some text\r\nBlocked by: #2, api#3, acme/api#4\nsee #9" }), issue(2, "B1"), issue(9, "Mentioned only")],
          prs: [pr(50, true, 1)],
        }),
        "acme/api": { nameWithOwner: "acme/api", issues: [issue(3, "B2"), issue(4, "B3")] },
      });
      expect(u.issues["acme/web#1"]?.blockers).toEqual(["acme/web#2", "acme/api#3", "acme/api#4"]);
      expect(states(u)["acme/web#1"]).toBe("blocked");
    });

    it("Blocked: GitHub's native blocked-by link counts too", () => {
      const u = build({ "acme/web": web({ issues: [issue(1, "Work", { blockedBy: { nodes: [{ ...ref("acme/web", 2), state: "OPEN" }] } }), issue(2, "B")] }) });
      expect(u.issues["acme/web#1"]?.blockers).toEqual(["acme/web#2"]);
      expect(states(u)["acme/web#1"]).toBe("blocked");
    });

    it("not Blocked once every blocker is closed, outside the config, or only mid-line", () => {
      const u = build({ "acme/web": web({ issues: [
        issue(1, "Map: M", kids(kid("acme/web", 2, "Done kid", "CLOSED"), kid("acme/web", 6, "Work"))),
        issue(6, "Work", { body: "Blocked by: #2, #3, other/lib#4\nNote: Blocked by: #7", blockedBy: { nodes: [{ ...ref("acme/web", 5), state: "CLOSED" }] } }),
        issue(7, "Mid-line only"),
      ] }) });
      // #2 is a closed Planet (kept, never blocks), #3 and #5 are closed (not read), other/lib is not configured.
      expect(u.issues["acme/web#6"]?.blockers).toEqual(["acme/web#2"]);
      expect(states(u)["acme/web#6"]).toBe("todo");
    });

    it("Draft PR open: a linked draft PR; PR text is never scanned", () => {
      const u = build({ "acme/web": web({ issues: [issue(1, "Work"), issue(2, "Mentioned")], prs: [pr(50, true, 1)] }) });
      expect(states(u)).toEqual({ "acme/web#1": "doing", "acme/web#2": "todo" });
    });

    it("To do: assignees alone never change state", () => {
      const u = build({ "acme/web": web({ issues: [issue(1, "Work", who("alice", "bob", "carol"))] }) });
      expect(states(u)["acme/web#1"]).toBe("todo");
      expect(satelliteLabel(u.issues["acme/web#1"]?.assignees ?? [])).toEqual({ first: "alice", rest: 2 });
    });

    it("drops PR links to repos outside the config and to issues not in the Universe", () => {
      const u = build({ "acme/web": web({ issues: [issue(1, "Work")], prs: [{ ...pr(50, false, 1, 99), closingIssuesReferences: { nodes: [ref("acme/web", 1), ref("acme/web", 99), ref("other/lib", 1)] } }] }) });
      expect(u.prs["acme/web!50"]?.closes).toEqual(["acme/web#1"]);
    });
  });

  it("carries the closed PRs with merged flag, time and the issues they closed", () => {
    const u = build({ "acme/web": web({ closedPrs: [
      { number: 40, title: "Merged", url: "u40", merged: true, mergedAt: "2026-11-21T09:00:00Z", closedAt: "2026-11-21T09:00:00Z", closingIssuesReferences: { nodes: [ref("acme/web", 5), ref("other/lib", 1)] } },
      { number: 41, title: "Dropped", url: "u41", merged: false, mergedAt: null, closedAt: "2026-11-21T08:00:00Z", closingIssuesReferences: { nodes: [] } },
    ] }) });
    expect(UniverseData.parse(u)).toEqual(u);
    expect(u.closedPrs).toEqual({
      "acme/web!40": { key: "acme/web!40", repo: "acme/web", number: 40, title: "Merged", url: "u40", merged: true, at: Date.parse("2026-11-21T09:00:00Z"), closes: ["acme/web#5"] },
      "acme/web!41": { key: "acme/web!41", repo: "acme/web", number: 41, title: "Dropped", url: "u41", merged: false, at: Date.parse("2026-11-21T08:00:00Z"), closes: [] },
    });
  });
});
