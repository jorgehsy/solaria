import { describe, expect, it } from "vitest";
import { FIT_INSETS, HORIZON_LABEL, focusLabelPx, HORIZON_PX, galaxyOrder, layoutUniverse } from "./layout.ts";
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

  it("counts children drawn in another Galaxy in their Sun's progress, not its size", () => {
    const i = input();
    i.foreign = [
      { key: "acme/api#7", repo: "acme/api", number: 7, sun: "acme/web#10", done: false },
      { key: "acme/api#8", repo: "acme/api", number: 8, sun: "acme/web#10", done: true },
      { key: "acme/api#9", repo: "acme/api", number: 9, sun: "acme/web#99", done: true },
    ];
    const l = layoutUniverse(i, { reducedMotion: false });
    expect(l.suns.get("acme/web#10")).toMatchObject({ done: 2, total: 5, r: layoutUniverse(input(), { reducedMotion: false }).suns.get("acme/web#10")?.r });
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

/** n repos; repo i has (i * 7) % 13 open issues as Gas, plus one Map with a few Planets on every third. */
function many(n: number): LayoutInput & { openCount: Record<string, number> } {
  const repos = Array.from({ length: n }, (_, i) => `org${i % 3}/repo-with-a-rather-long-name-${i}`);
  const inp: LayoutInput & { openCount: Record<string, number> } = { repos, suns: [], gas: [], foreign: [], openCount: {} };
  repos.forEach((repo, i) => {
    const open = (i * 7) % 13;
    inp.openCount[repo] = open;
    for (let j = 0; j < open; j++) inp.gas.push({ key: `${repo}#${100 + j}`, repo, number: 100 + j });
    if (i % 3 === 0) {
      inp.suns.push({
        key: `${repo}#1`, repo, number: 1,
        planets: [2, 3, 4, 5].map((m) => ({ key: `${repo}#${m}`, number: m, blockers: m > 2 ? [`${repo}#${m - 1}`] : [], done: m === 2 })),
      });
    }
  });
  return inp;
}

describe("Focus and Horizon", () => {
  const VP = { w: 1440, h: 900 };

  it("keeps every Galaxy in Focus with fewer than 4 repos", () => {
    const l = layoutUniverse(many(3), { reducedMotion: false, viewport: VP });
    expect(l.focus).toHaveLength(3);
    expect(l.horizon).toEqual([]);
    expect(l.frame).toBeNull();
    expect([...l.galaxies.values()].every((g) => g.tier === "focus" && g.scale === 1)).toBe(true);
  });

  it("centres a single repo", () => {
    const l = layoutUniverse(many(1), { reducedMotion: false, viewport: VP });
    expect(l.galaxies.get(l.focus[0]!)?.x).toBe(0);
  });

  for (const n of [4, 10, 30]) {
    it(`puts the 3 busiest of ${n} repos in Focus and the rest on the Horizon without overlaps`, () => {
      const inp = many(n);
      const l = layoutUniverse(inp, { reducedMotion: false, viewport: VP });
      const busiest = inp.repos
        .map((r, i) => ({ r, i, c: inp.openCount[r] ?? 0 }))
        .sort((a, b) => b.c - a.c || a.i - b.i)
        .slice(0, 3)
        .map((x) => x.r);
      expect(new Set(l.focus)).toEqual(new Set(busiest));
      expect(l.horizon).toHaveLength(n - 3);
      expect(new Set([...l.focus, ...l.horizon])).toEqual(new Set(inp.repos));
      for (const r of l.horizon) expect(l.galaxies.get(r)).toMatchObject({ tier: "horizon" });

      // Screen space at the default fit: frame maps to the fit area of a 1440x900 window.
      const f = l.frame!;
      const k = (VP.w - FIT_INSETS.x * 2) / (f.x1 - f.x0);
      expect((VP.h - FIT_INSETS.top - FIT_INSETS.bottom) / (f.y1 - f.y0)).toBeCloseTo(k, 6);
      const sx = (x: number) => VP.w / 2 + x * k;
      const sy = (y: number) => FIT_INSETS.top + (VP.h - FIT_INSETS.top - FIT_INSETS.bottom) / 2 + y * k;
      type Box = { x0: number; x1: number; y0: number; y1: number; id: string };
      const boxes: Box[] = [];
      for (const g of l.galaxies.values()) {
        const x = sx(g.x), y = sy(g.y), r = g.R * k;
        // Disc plus its label above it (Horizon labels are capped at HORIZON_LABEL.w).
        const lw = g.tier === "horizon" ? HORIZON_LABEL.w : focusLabelPx(g.repo);
        boxes.push({ id: g.repo, x0: Math.min(x - r, x - lw / 2), x1: Math.max(x + r, x + lw / 2), y0: y - r - (g.tier === "horizon" ? HORIZON_LABEL.h : 32), y1: y + r });
        if (g.tier === "horizon") {
          const d = g.R * 2 * k;
          expect(d).toBeLessThanOrEqual(HORIZON_PX + 0.01);
          expect(d).toBeGreaterThanOrEqual(HORIZON_PX * 0.6 - 0.01);
        }
      }
      for (const b of boxes) {
        expect(b.x0).toBeGreaterThanOrEqual(0);
        expect(b.x1).toBeLessThanOrEqual(VP.w);
        expect(b.y0).toBeGreaterThanOrEqual(FIT_INSETS.top - 30);
        expect(b.y1).toBeLessThanOrEqual(VP.h - FIT_INSETS.bottom + 30);
      }
      for (let i = 0; i < boxes.length; i++)
        for (let j = i + 1; j < boxes.length; j++) {
          const a = boxes[i]!, b = boxes[j]!;
          const hit = a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;
          expect(hit, `${a.id} overlaps ${b.id}`).toBe(false);
        }
    });
  }

  it("orders the Horizon by config, nothing-open last, starting at 12 o'clock clockwise", () => {
    const inp = many(10);
    const l = layoutUniverse(inp, { reducedMotion: false, viewport: VP });
    const rest = inp.repos.filter((r) => !l.focus.includes(r));
    const want = [...rest.filter((r) => inp.openCount[r]), ...rest.filter((r) => !inp.openCount[r])];
    expect(l.horizon).toEqual(want);
    const first = l.galaxies.get(l.horizon[0]!)!;
    const second = l.galaxies.get(l.horizon[1]!)!;
    expect(Math.abs(first.x)).toBeLessThan(1e-6);
    expect(first.y).toBeLessThan(0);
    expect(second.x).toBeGreaterThan(0);
  });

  it("shrinks a Horizon Galaxy's contents with it", () => {
    const inp = many(10);
    const full = layoutUniverse(inp, { reducedMotion: false, viewport: VP });
    const repo = full.horizon.find((r) => r.endsWith("-0") || r.endsWith("-9"))!;
    const g = full.galaxies.get(repo)!;
    expect(g.scale).toBeLessThan(1);
    const sun = full.suns.get(`${repo}#1`);
    if (sun) expect(sun.R).toBeLessThanOrEqual(g.R + 1e-6);
  });

  it("recomputes Focus from the counts it is given", () => {
    const inp = many(10);
    const a = layoutUniverse(inp, { reducedMotion: false, viewport: VP });
    const quiet = a.horizon[0]!;
    inp.openCount[quiet] = 99;
    const b = layoutUniverse(inp, { reducedMotion: false, viewport: VP });
    expect(b.focus).toContain(quiet);
    expect(b.galaxies.get(quiet)).toMatchObject({ tier: "focus", scale: 1 });
  });
});
