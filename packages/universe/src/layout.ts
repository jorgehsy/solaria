import { packEnclose, packSiblings } from "d3-hierarchy";
import type { IssueKey } from "./model.ts";

const TAU = Math.PI * 2;

/** A stable 0..1 number from a string (FNV-1a), so every object keeps its spot between frames and runs. */
export function hash01(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967296;
}

export interface LayoutPlanet {
  key: IssueKey;
  number: number;
  blockers: readonly IssueKey[];
  done: boolean;
}
export interface LayoutSun {
  key: IssueKey;
  repo: string;
  number: number;
  /** Planets in the Sun's own repo. */
  planets: LayoutPlanet[];
}
export interface LayoutLoose {
  key: IssueKey;
  repo: string;
  number: number;
}
export interface LayoutInput {
  repos: readonly string[];
  suns: LayoutSun[];
  /** Gas: issues that belong to no Map. */
  gas: LayoutLoose[];
  /** Issues that belong to a Map in another Galaxy: a small cluster with a line to their Sun. */
  foreign: LayoutLoose[];
  /** Open issues per repo, to choose Focus. */
  openCount: Readonly<Record<string, number>>;
}
export interface LayoutOptions {
  reducedMotion: boolean;
}

export interface Disc {
  x: number;
  y: number;
  r: number;
}
export interface GalaxyPlace {
  repo: string;
  /** Centre in world units. */
  x: number;
  y: number;
  R: number;
  gas: Disc | null;
  foreign: Disc | null;
}
export interface SunPlace {
  key: IssueKey;
  /** Offset from its Galaxy's centre. */
  dx: number;
  dy: number;
  /** Body radius. */
  r: number;
  /** Outer radius of the whole system. */
  R: number;
  rings: number[];
  done: number;
  total: number;
}
export interface PlanetPlace {
  key: IssueKey;
  ring: number;
  theta0: number;
  /** Angular speed in radians per second (0 with reduced motion). */
  omega: number;
}
export interface Layout {
  galaxies: Map<string, GalaxyPlace>;
  suns: Map<IssueKey, SunPlace>;
  planets: Map<IssueKey, PlanetPlace>;
  /** Offsets from the Galaxy centre. */
  loose: Map<IssueKey, { dx: number; dy: number }>;
}

const GALAXY_GAP = 70;

/**
 * Where everything goes. Pure: the same input always gives the same picture.
 * Planets sit on rings by blocking depth; Suns, the Gas cloud and the foreign cluster are packed
 * as circles inside their Galaxy; Galaxies sit side by side with the busiest in the middle.
 */
export function layoutUniverse(input: LayoutInput, opts: LayoutOptions): Layout {
  const out: Layout = { galaxies: new Map(), suns: new Map(), planets: new Map(), loose: new Map() };

  for (const s of input.suns) {
    const keys = new Set(s.planets.map((p) => p.key));
    const byKey = new Map(s.planets.map((p) => [p.key, p]));
    const depth = new Map<IssueKey, number>();
    const dep = (p: LayoutPlanet, trail: Set<IssueKey>): number => {
      const known = depth.get(p.key);
      if (known !== undefined) return known;
      if (trail.has(p.key)) return 1;
      trail.add(p.key);
      let d = 1;
      for (const b of p.blockers) {
        const bp = byKey.get(b);
        if (keys.has(b) && bp) d = Math.max(d, dep(bp, trail) + 1);
      }
      trail.delete(p.key);
      depth.set(p.key, d);
      return d;
    };
    const rings = new Map<number, LayoutPlanet[]>();
    let maxD = 0;
    for (const p of s.planets) {
      const d = dep(p, new Set());
      maxD = Math.max(maxD, d);
      const list = rings.get(d) ?? [];
      list.push(p);
      rings.set(d, list);
    }
    const n1 = rings.get(1)?.length ?? 0;
    const r1 = Math.max(44, (n1 * 20) / TAU + 30);
    const ringR = (d: number) => r1 + (d - 1) * 30;
    const total = s.planets.length;
    const done = s.planets.filter((p) => p.done).length;
    const r = Math.min(22, Math.max(13, 12 + Math.sqrt(total) * 1.7));
    const off = hash01(s.key) * TAU;
    for (const [d, list] of rings) {
      list.sort((a, b) => a.number - b.number);
      const rr = ringR(d);
      list.forEach((p, i) => {
        out.planets.set(p.key, {
          key: p.key,
          ring: rr,
          theta0: off + d * 0.9 + (i / list.length) * TAU,
          omega: opts.reducedMotion ? 0 : TAU / (160 * Math.pow(rr / 60, 1.5)),
        });
      });
    }
    out.suns.set(s.key, {
      key: s.key, dx: 0, dy: 0, r,
      R: maxD ? ringR(maxD) + 16 : r + 30,
      rings: Array.from({ length: maxD }, (_, i) => ringR(i + 1)),
      done, total,
    });
  }

  for (const repo of input.repos) {
    const systems = input.suns.filter((s) => s.repo === repo).sort((a, b) => a.number - b.number);
    const gas = input.gas.filter((g) => g.repo === repo).sort((a, b) => a.number - b.number);
    const foreign = input.foreign.filter((g) => g.repo === repo).sort((a, b) => a.number - b.number);
    const gasR = gas.length ? 15 * Math.sqrt(gas.length) + 22 : 0;
    const foreignR = foreign.length ? 13 * Math.sqrt(foreign.length) + 14 : 0;
    const items: { id: string; r: number; x?: number; y?: number }[] = [];
    if (gas.length) items.push({ id: "#gas", r: gasR + 20 });
    for (const s of systems) items.push({ id: s.key, r: (out.suns.get(s.key)?.R ?? 40) + 18 });
    if (foreign.length) items.push({ id: "#foreign", r: foreignR + 22 });
    const g: GalaxyPlace = { repo, x: 0, y: 0, R: 90, gas: null, foreign: null };
    if (items.length) {
      const circles = items.map((it) => ({ id: it.id, r: it.r, x: 0, y: 0 }));
      packSiblings(circles);
      const enc = packEnclose(circles) ?? { x: 0, y: 0, r: 0 };
      for (const c of circles) {
        const x = c.x - enc.x;
        const y = c.y - enc.y;
        if (c.id === "#gas") g.gas = { x, y, r: gasR };
        else if (c.id === "#foreign") g.foreign = { x, y, r: foreignR };
        else {
          const sp = out.suns.get(c.id);
          if (sp) { sp.dx = x; sp.dy = y; }
        }
      }
      g.R = Math.max(80, enc.r + 22);
    }
    const h = hash01(repo) * TAU;
    gas.forEach((n, i) => {
      const rr = 15 * Math.sqrt(i + 0.5);
      const a = i * 2.39996 + h;
      out.loose.set(n.key, { dx: (g.gas?.x ?? 0) + Math.cos(a) * rr, dy: (g.gas?.y ?? 0) + Math.sin(a) * rr });
    });
    foreign.forEach((n, i) => {
      const rr = 13 * Math.sqrt(i + 0.5);
      const a = i * 2.39996 + 1;
      out.loose.set(n.key, { dx: (g.foreign?.x ?? 0) + Math.cos(a) * rr, dy: (g.foreign?.y ?? 0) + Math.sin(a) * rr });
    });
    out.galaxies.set(repo, g);
  }

  // Busiest in the middle, then alternate sides; ties keep config order.
  const ranked = input.repos
    .map((repo, i) => ({ repo, i, n: input.openCount[repo] ?? 0 }))
    .sort((a, b) => b.n - a.n || a.i - b.i);
  const row: string[] = [];
  ranked.forEach((r, i) => (i % 2 ? row.unshift(r.repo) : row.push(r.repo)));
  const list = row.map((repo) => out.galaxies.get(repo)).filter((g): g is GalaxyPlace => !!g);
  let acc = 0;
  const xs = list.map((g) => {
    const c = acc + g.R;
    acc += g.R * 2 + GALAXY_GAP;
    return c;
  });
  const mid = (acc - GALAXY_GAP) / 2;
  list.forEach((g, i) => {
    g.x = (xs[i] ?? 0) - mid;
    g.y = (i % 2 ? 1 : -1) * g.R * 0.12;
  });
  return out;
}

/** Galaxies in screen order, left to right. */
export function galaxyOrder(l: Layout): string[] {
  return [...l.galaxies.values()].sort((a, b) => a.x - b.x).map((g) => g.repo);
}
