import { describe, expect, it } from "vitest";
import { galaxyOrder, layoutUniverse } from "./layout.ts";
import type { LayoutInput } from "./layout.ts";

const input = (): LayoutInput => ({
  repos: ["acme/web", "acme/api", "acme/mobile"],
  suns: [
    {
      key: "acme/web#10", repo: "acme/web", number: 10,
      planets: [
        { key: "acme/web#11", number: 11, blockers: [], done: true },
        { key: "acme/web#12", number: 12, blockers: ["acme/web#11"], done: false },
        { key: "acme/web#13", number: 13, blockers: ["acme/web#12"], done: false },
      ],
    },
  ],
  gas: [{ key: "acme/web#20", repo: "acme/web", number: 20 }],
  foreign: [],
  openCount: { "acme/web": 3, "acme/api": 9, "acme/mobile": 1 },
});

describe("layoutUniverse", () => {
  it("is deterministic", () => {
    expect(layoutUniverse(input(), { reducedMotion: false })).toEqual(layoutUniverse(input(), { reducedMotion: false }));
  });

  it("puts the busiest Galaxy in the middle", () => {
    expect(galaxyOrder(layoutUniverse(input(), { reducedMotion: false }))).toEqual(["acme/web", "acme/api", "acme/mobile"]);
    const i = input();
    i.openCount = { "acme/web": 9, "acme/api": 1, "acme/mobile": 3 };
    expect(galaxyOrder(layoutUniverse(i, { reducedMotion: false }))).toEqual(["acme/mobile", "acme/web", "acme/api"]);
  });

  it("puts Planets on rings by blocking depth and counts progress", () => {
    const l = layoutUniverse(input(), { reducedMotion: false });
    const ring = (k: string) => l.planets.get(k)?.ring ?? 0;
    expect(ring("acme/web#11")).toBeLessThan(ring("acme/web#12"));
    expect(ring("acme/web#12")).toBeLessThan(ring("acme/web#13"));
    expect(l.suns.get("acme/web#10")).toMatchObject({ done: 1, total: 3 });
    expect(l.suns.get("acme/web#10")?.rings).toHaveLength(3);
  });

  it("stops orbits with reduced motion", () => {
    const l = layoutUniverse(input(), { reducedMotion: true });
    expect([...l.planets.values()].every((p) => p.omega === 0)).toBe(true);
  });

  it("keeps Galaxies apart", () => {
    const l = layoutUniverse(input(), { reducedMotion: false });
    const gs = [...l.galaxies.values()].sort((a, b) => a.x - b.x);
    for (let i = 1; i < gs.length; i++) {
      const a = gs[i - 1]!, b = gs[i]!;
      expect(b.x - a.x).toBeGreaterThanOrEqual(a.R + b.R);
    }
  });

  it("places Gas inside its Galaxy's cloud", () => {
    const l = layoutUniverse(input(), { reducedMotion: false });
    const g = l.galaxies.get("acme/web")!;
    const p = l.loose.get("acme/web#20")!;
    expect(Math.hypot(p.dx - g.gas!.x, p.dy - g.gas!.y)).toBeLessThanOrEqual(g.gas!.r);
  });
});
