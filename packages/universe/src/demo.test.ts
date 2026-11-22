import { describe, expect, it } from "vitest";
import { DEMO_EVENT_KINDS, demoEvent, makeDemoUniverse } from "./demo.ts";
import { diff } from "./diff.ts";
import { issueStates } from "./state.ts";
import { seeded } from "./rng.ts";

const NOW = Date.UTC(2026, 10, 22, 12);

describe("makeDemoUniverse", () => {
  const u = makeDemoUniverse(NOW);
  const issues = Object.values(u.issues);

  it("is the acme team: 3 Galaxies, 4 Maps, 26 Planets, 4 Gas", () => {
    expect(u.repos).toEqual(["acme/web", "acme/api", "acme/mobile"]);
    expect(Object.values(u.maps).map((m) => m.title).sort()).toEqual(["Dark mode", "Email alerts", "Offline mode", "Usage dashboard"]);
    expect(issues.filter((i) => i.map)).toHaveLength(26);
    expect(issues.filter((i) => !i.map).map((i) => i.key).sort()).toEqual(["acme/web#20", "acme/web#21", "acme/web#22", "acme/web#23"]);
  });

  it("is the same on every run (seeded)", () => {
    expect(makeDemoUniverse(NOW)).toEqual(u);
  });

  it("has the copy deck's PRs and Satellites", () => {
    const s = issueStates(u);
    expect(s.get("acme/web#11")).toBe("review");
    expect(s.get("acme/api#34")).toBe("doing");
    expect(u.prs["acme/api!46"]?.closes).toEqual([]);
    expect(u.closedPrs["acme/mobile!57"]).toMatchObject({ merged: false, closes: ["acme/mobile#52"] });
    expect(u.issues["acme/web#12"]?.assignees).toEqual(["alice", "bob", "carol"]);
    expect(u.issues["acme/api#41"]?.assignees).toEqual(["bob"]);
  });

  it("shows every state the legend names", () => {
    const states = new Set(issueStates(u).values());
    for (const s of ["todo", "doing", "blocked", "review", "done"] as const) expect(states).toContain(s);
  });

  it("emits no events against itself", () => {
    expect(diff(u, makeDemoUniverse(NOW))).toEqual([]);
  });
});

describe("demoEvent", () => {
  const expected: Record<string, string> = { bigbang: "bigbang", rift: "rift", flare: "flare", adopt: "adopt", comet: "comet", supernova: "supernova", fade: "prgone" };

  for (const kind of DEMO_EVENT_KINDS) {
    it(`${kind} produces a ${expected[kind]} event`, () => {
      const u = makeDemoUniverse(NOW);
      const r = demoEvent(u, kind, { rng: seeded(3), now: NOW + 1000, live: false });
      expect(r.kind).toBe("ok");
      if (r.kind !== "ok") return;
      const types = diff(u, r.next).map((e) => e.type);
      expect(types[0]).toBe(expected[kind]);
    });
  }

  it("does not change the Universe it was given", () => {
    const u = makeDemoUniverse(NOW);
    const before = JSON.parse(JSON.stringify(u)) as typeof u;
    demoEvent(u, "bigbang", { rng: seeded(1), now: NOW, live: false });
    expect(u).toEqual(before);
  });

  it("uses the next free number in demo mode and 90000+ on live data", () => {
    const u = makeDemoUniverse(NOW);
    const demo = demoEvent(u, "rift", { rng: seeded(5), now: NOW, live: false });
    const live = demoEvent(u, "rift", { rng: seeded(5), now: NOW, live: true });
    if (demo.kind !== "ok" || live.kind !== "ok") throw new Error("expected ok");
    const added = (n: typeof u) => Object.values(n.issues).filter((i) => !u.issues[i.key]).map((i) => i.number);
    expect(added(demo.next)[0]).toBeLessThan(100);
    expect(added(live.next)[0]).toBeGreaterThanOrEqual(90000);
  });

  it("asks for a Comet first when no PR can be merged", () => {
    const u = makeDemoUniverse(NOW);
    u.prs = {};
    expect(demoEvent(u, "supernova", { rng: seeded(1), now: NOW, live: false })).toEqual({ kind: "needs", first: "comet" });
  });
});
