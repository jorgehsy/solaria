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
/** An issue in one Galaxy whose Map is in another: drawn in its own Galaxy, counted in its Sun's progress. */
export interface LayoutForeign extends LayoutLoose {
  sun: IssueKey;
  done: boolean;
}
export interface LayoutInput {
  repos: readonly string[];
  suns: LayoutSun[];
  /** Gas: issues that belong to no Map. */
  gas: LayoutLoose[];
  /** Issues that belong to a Map in another Galaxy: a small cluster with a line to their Sun. */
  foreign: LayoutForeign[];
  /** Open issues per repo, to choose Focus. */
  openCount: Readonly<Record<string, number>>;
}
export interface LayoutOptions {
  reducedMotion: boolean;
}

/** Space the camera fit keeps clear of the header (top) and the log and tools (bottom), in px. */
export const FIT_INSETS = { x: 40, top: 104, bottom: 110 } as const;
/** Most Galaxies in Focus. */
export const FOCUS_MAX = 3;

export interface Disc {
  x: number;
  y: number;
  r: number;
}
export interface GalaxyPlace {
  repo: string;
  tier: "focus" | "horizon";
  /** Content scale. Always 1: every Galaxy is drawn at its real size. */
  scale: number;
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
  /** Focus repos, left to right. */
  focus: string[];
  /** Horizon repos, in placement order (nearest Focus first). */
  horizon: string[];
  /** World box the default camera fit frames: Focus when there is a Horizon (null: fit every Galaxy). */
  frame: { x0: number; y0: number; x1: number; y1: number } | null;
}

const GALAXY_GAP = 70;

/**
 * Where everything goes. Pure: the same input always gives the same picture.
 * Planets sit on rings by blocking depth; Suns, the Gas cloud and the foreign cluster are packed
 * as circles inside their Galaxy; Focus Galaxies sit side by side with the busiest in the middle,
 * and the Horizon is packed around them at full size.
 */
export function layoutUniverse(input: LayoutInput, opts: LayoutOptions): Layout {
  const out: Layout = { galaxies: new Map(), suns: new Map(), planets: new Map(), loose: new Map(), focus: [], horizon: [], frame: null };

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
    // Progress counts every child in a configured repo, wherever it is drawn (spec section 5).
    const away = input.foreign.filter((f) => f.sun === s.key);
    const total = s.planets.length + away.length;
    const done = s.planets.filter((p) => p.done).length + away.filter((f) => f.done).length;
    const r = Math.min(22, Math.max(13, 12 + Math.sqrt(s.planets.length) * 1.7));
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
    const g: GalaxyPlace = { repo, tier: "focus", scale: 1, x: 0, y: 0, R: 90, gas: null, foreign: null };
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

  // Focus: the busiest few; ties keep config order. Fewer than FOCUS_MAX + 1 repos: no Horizon.
  const ranked = input.repos
    .map((repo, i) => ({ repo, i, n: input.openCount[repo] ?? 0 }))
    .sort((a, b) => b.n - a.n || a.i - b.i);
  const many = input.repos.length > FOCUS_MAX;
  const focus = many ? ranked.slice(0, FOCUS_MAX) : ranked;
  const inFocus = new Set(focus.map((r) => r.repo));
  // Busiest in the middle, then alternate sides.
  const row: string[] = [];
  focus.forEach((r, i) => (i % 2 ? row.unshift(r.repo) : row.push(r.repo)));
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
  spreadRow(list);
  out.focus = list.map((g) => g.repo);
  if (!many) return out;

  // Horizon: config order, repos with nothing open at the end, each at full size around Focus.
  const rest = input.repos.filter((r) => !inFocus.has(r));
  const horizon = [...rest.filter((r) => (input.openCount[r] ?? 0) > 0), ...rest.filter((r) => !(input.openCount[r] ?? 0))];
  placeHorizon(out, list, horizon);
  return out;
}

/**
 * A generous guess at a Galaxy label's width in px (`OWNER/REPO` in 11px bold caps plus "N open").
 * Layout runs without a DOM, so it cannot measure; erring wide only costs a little more space.
 */
export function focusLabelPx(repo: string): number {
  return Math.ceil(repo.length * 9.6 + 80);
}

/** Height a Galaxy label takes above its disc, in world px. */
export const LABEL_H = 32;

/** Neighbouring Focus labels must not touch: push the row apart where they would, then recentre it. */
function spreadRow(row: GalaxyPlace[]) {
  for (let i = 1; i < row.length; i++) {
    const a = row[i - 1], g = row[i];
    if (!a || !g) continue;
    const half = (h: GalaxyPlace) => Math.max(h.R, focusLabelPx(h.repo) / 2);
    const need = Math.max(a.R + g.R + GALAXY_GAP, half(a) + half(g) + 24);
    const gap = g.x - a.x;
    if (gap < need) for (let j = i; j < row.length; j++) { const h = row[j]; if (h) h.x += need - gap; }
  }
  const first = row[0], last = row[row.length - 1];
  const c = first && last ? (first.x + last.x) / 2 : 0;
  for (const g of row) g.x -= c;
}

interface Footprint { x: number; y: number; r: number }
/** A circle around the box of a Galaxy's disc and the label above it, centred on the disc. */
export function footprint(g: GalaxyPlace): Footprint {
  return { x: g.x, y: g.y, r: Math.hypot(Math.max(g.R, focusLabelPx(g.repo) / 2), g.R + LABEL_H) };
}
/** Clear space between two footprints, in world px. */
export const HORIZON_GAP = 40;
/** Candidate angles tried around each placed Galaxy. */
const ANGLES = 36;

/**
 * Every Horizon Galaxy keeps its real size (spec: nothing shrinks). In Horizon order, each goes to the
 * free spot touching an already placed Galaxy that is nearest the centre, measured on a wide ellipse
 * so the universe grows sideways like the screen. The result can be far larger than the window:
 * the default camera frames Focus and the user pans to the rest.
 */
function placeHorizon(out: Layout, focus: GalaxyPlace[], horizon: string[]) {
  const placed: Footprint[] = focus.map(footprint);
  const gals = horizon.map((r) => out.galaxies.get(r)).filter((g): g is GalaxyPlace => !!g);
  for (const g of gals) {
    const r = footprint({ ...g, x: 0, y: 0 }).r;
    let best: { x: number; y: number; d: number } | null = null;
    for (const p of placed) {
      const dist = p.r + r + HORIZON_GAP;
      for (let a = 0; a < ANGLES; a++) {
        const t = (a / ANGLES) * TAU;
        const x = p.x + Math.cos(t) * dist, y = p.y + Math.sin(t) * dist;
        const d = Math.hypot(x / 1.6, y);
        if (best && d >= best.d) continue;
        if (placed.some((q) => Math.hypot(q.x - x, q.y - y) < q.r + r + HORIZON_GAP - 1e-6)) continue;
        best = { x, y, d };
      }
    }
    g.tier = "horizon";
    g.x = best?.x ?? 0;
    g.y = best?.y ?? 0;
    placed.push({ x: g.x, y: g.y, r });
  }
  out.horizon = gals.map((g) => g.repo);
  // The default fit frames Focus with its labels; the Horizon may sit off screen.
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const g of focus) {
    const lw = focusLabelPx(g.repo) / 2;
    x0 = Math.min(x0, g.x - Math.max(g.R, lw)); x1 = Math.max(x1, g.x + Math.max(g.R, lw));
    y0 = Math.min(y0, g.y - g.R - LABEL_H); y1 = Math.max(y1, g.y + g.R);
  }
  out.frame = isFinite(x0) ? { x0, y0, x1, y1 } : null;
}

/** Galaxies in screen order, left to right. */
export function galaxyOrder(l: Layout): string[] {
  return [...l.galaxies.values()].sort((a, b) => a.x - b.x).map((g) => g.repo);
}
