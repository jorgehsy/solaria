import { describe, expect, it } from "vitest";
import { HORIZON_GAP, LABEL_H, focusLabelPx, footprint, galaxyOrder, layoutUniverse } from "./layout.ts";
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
  it("keeps every Galaxy in Focus with fewer than 4 repos", () => {
    const l = layoutUniverse(many(3), { reducedMotion: false });
    expect(l.focus).toHaveLength(3);
    expect(l.horizon).toEqual([]);
    expect(l.frame).toBeNull();
    expect([...l.galaxies.values()].every((g) => g.tier === "focus" && g.scale === 1)).toBe(true);
  });

  it("centres a single repo", () => {
    const l = layoutUniverse(many(1), { reducedMotion: false });
    expect(l.galaxies.get(l.focus[0]!)?.x).toBe(0);
  });

  for (const n of [4, 10, 30]) {
    it(`puts the 3 busiest of ${n} repos in Focus and the rest on the Horizon, all at full size, without overlaps`, () => {
      const inp = many(n);
      const l = layoutUniverse(inp, { reducedMotion: false });
      const busiest = inp.repos
        .map((r, i) => ({ r, i, c: inp.openCount[r] ?? 0 }))
        .sort((a, b) => b.c - a.c || a.i - b.i)
        .slice(0, 3)
        .map((x) => x.r);
      expect(new Set(l.focus)).toEqual(new Set(busiest));
      expect(l.horizon).toHaveLength(n - 3);
      expect(new Set([...l.focus, ...l.horizon])).toEqual(new Set(inp.repos));
      for (const r of l.horizon) expect(l.galaxies.get(r)).toMatchObject({ tier: "horizon", scale: 1 });

      // Same size as when the repo is alone: nothing is shrunk.
      for (const r of inp.repos) {
        const solo = layoutUniverse({ ...inp, repos: [r] }, { reducedMotion: false });
        expect(l.galaxies.get(r)?.R).toBeCloseTo(solo.galaxies.get(r)!.R, 6);
      }
      for (const s of l.suns.values()) expect(s.r).toBeGreaterThanOrEqual(13 - 1e-9);

      // Discs and labels never overlap, in world px.
      type Box = { x0: number; x1: number; y0: number; y1: number; id: string };
      const boxes: Box[] = [...l.galaxies.values()].map((g) => {
        const lw = focusLabelPx(g.repo) / 2;
        return { id: g.repo, x0: g.x - Math.max(g.R, lw), x1: g.x + Math.max(g.R, lw), y0: g.y - g.R - LABEL_H, y1: g.y + g.R };
      });
      for (let i = 0; i < boxes.length; i++)
        for (let j = i + 1; j < boxes.length; j++) {
          const a = boxes[i]!, b = boxes[j]!;
          const hit = a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;
          expect(hit, `${a.id} overlaps ${b.id}`).toBe(false);
        }

      // The default fit frames exactly Focus; Horizon Galaxies sit outside it.
      const f = l.frame!;
      for (const r of l.focus) {
        const g = l.galaxies.get(r)!;
        expect(g.x - g.R).toBeGreaterThanOrEqual(f.x0 - 1e-6);
        expect(g.x + g.R).toBeLessThanOrEqual(f.x1 + 1e-6);
      }
    });
  }

  it("packs the Horizon around Focus, nearest first, in config order with nothing-open last", () => {
    const inp = many(10);
    const l = layoutUniverse(inp, { reducedMotion: false });
    const rest = inp.repos.filter((r) => !l.focus.includes(r));
    const want = [...rest.filter((r) => inp.openCount[r]), ...rest.filter((r) => !inp.openCount[r])];
    expect(l.horizon).toEqual(want);
    // Each Horizon Galaxy touches (within the gap) some Galaxy placed before it: no stray islands.
    const placed = l.focus.map((r) => footprint(l.galaxies.get(r)!));
    for (const r of l.horizon) {
      const fp = footprint(l.galaxies.get(r)!);
      const near = Math.min(...placed.map((p) => Math.hypot(p.x - fp.x, p.y - fp.y) - p.r - fp.r));
      expect(near).toBeGreaterThanOrEqual(HORIZON_GAP - 1e-3);
      expect(near).toBeLessThanOrEqual(HORIZON_GAP + 1e-3);
      placed.push(fp);
    }
  });

  it("recomputes Focus from the counts it is given", () => {
    const inp = many(10);
    const a = layoutUniverse(inp, { reducedMotion: false });
    const quiet = a.horizon[0]!;
    inp.openCount[quiet] = 99;
    const b = layoutUniverse(inp, { reducedMotion: false });
    expect(b.focus).toContain(quiet);
    expect(b.galaxies.get(quiet)).toMatchObject({ tier: "focus", scale: 1 });
  });
});
