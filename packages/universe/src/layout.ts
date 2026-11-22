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
  /** Screen size in CSS px. Horizon geometry is sized for it; defaults to 1440x900. */
  viewport?: { w: number; h: number };
}

/** Space the camera fit keeps clear of the header (top) and the log and tools (bottom), in px. */
export const FIT_INSETS = { x: 40, top: 104, bottom: 110 } as const;
/** Most Galaxies in Focus. */
export const FOCUS_MAX = 3;
/** On-screen diameter of the biggest Horizon Galaxy, in px. */
export const HORIZON_PX = 30;
/** Room one Horizon label takes: max width and height (it sits above its Galaxy), in px. */
export const HORIZON_LABEL = { w: 112, h: 26 } as const;

export interface Disc {
  x: number;
  y: number;
  r: number;
}
export interface GalaxyPlace {
  repo: string;
  tier: "focus" | "horizon";
  /** Content scale: 1 in Focus, smaller on the Horizon (everything inside is shrunk by it). */
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
  /** Horizon repos, in ring order (12 o'clock, clockwise, outer ring first). */
  horizon: string[];
  /** World box the default camera fit should frame exactly (null: fit the Galaxies). */
  frame: { x0: number; y0: number; x1: number; y1: number } | null;
}

const GALAXY_GAP = 70;

/**
 * Where everything goes. Pure: the same input always gives the same picture.
 * Planets sit on rings by blocking depth; Suns, the Gas cloud and the foreign cluster are packed
 * as circles inside their Galaxy; Galaxies sit side by side with the busiest in the middle.
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
  out.focus = list.map((g) => g.repo);
  if (!many) return out;

  // Horizon: config order, repos with nothing open at the end.
  const rest = input.repos.filter((r) => !inFocus.has(r));
  const horizon = [...rest.filter((r) => (input.openCount[r] ?? 0) > 0), ...rest.filter((r) => !(input.openCount[r] ?? 0))];
  placeHorizon(out, list, horizon, opts.viewport ?? { w: 1440, h: 900 });
  return out;
}

interface Ring { ax: number; ay: number; n: number }
interface Box { x0: number; x1: number; y0: number; y1: number }

/**
 * A generous guess at a Focus label's width in px (`OWNER/REPO` in 11px bold caps plus "N open").
 * Layout runs without a DOM, so it cannot measure; erring wide only costs a slightly smaller Focus.
 */
export function focusLabelPx(repo: string): number {
  return Math.ceil(repo.length * 9.6 + 80);
}

/** Evenly spaced points (by arc length) on an ellipse, from 12 o'clock clockwise (screen y points down). */
export function ellipsePoints(ax: number, ay: number, n: number): { x: number; y: number }[] {
  if (n <= 0) return [];
  const S = 720;
  const xs = new Float64Array(S + 1), ys = new Float64Array(S + 1), cum = new Float64Array(S + 1);
  for (let i = 0; i <= S; i++) {
    const t = -Math.PI / 2 + (i / S) * TAU;
    xs[i] = Math.cos(t) * ax;
    ys[i] = Math.sin(t) * ay;
    if (i) cum[i] = (cum[i - 1] ?? 0) + Math.hypot((xs[i] ?? 0) - (xs[i - 1] ?? 0), (ys[i] ?? 0) - (ys[i - 1] ?? 0));
  }
  const P = cum[S] ?? 0;
  const out: { x: number; y: number }[] = [];
  let j = 0;
  for (let k = 0; k < n; k++) {
    const want = (k / n) * P;
    while (j < S - 1 && (cum[j + 1] ?? 0) < want) j++;
    const c0 = cum[j] ?? 0, c1 = cum[j + 1] ?? 0;
    const u = (want - c0) / (c1 - c0 || 1);
    const x0 = xs[j] ?? 0, y0 = ys[j] ?? 0;
    out.push({ x: x0 + ((xs[j + 1] ?? 0) - x0) * u, y: y0 + ((ys[j + 1] ?? 0) - y0) * u });
  }
  return out;
}

/** Room one Horizon Galaxy needs on screen: its label above, its disc below. */
const SLOT = { w: HORIZON_LABEL.w + 8, h: HORIZON_LABEL.h + HORIZON_PX + 8 };
const clear = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.abs(a.x - b.x) >= SLOT.w || Math.abs(a.y - b.y) >= SLOT.h;

/** How many Horizon Galaxies fit on one ring without their slots touching. */
function capacity(ax: number, ay: number): number {
  let n = 1;
  for (let m = 2; m < 400; m++) {
    const p = ellipsePoints(ax, ay, m);
    if (!p.every((a, i) => clear(a, p[(i + 1) % m] ?? a))) break;
    n = m;
  }
  return n;
}

/**
 * Put the Horizon on up to three rings near the screen edges and shrink Focus to fit inside them.
 * Worked in screen px around the centre of the fit area, then divided by the fit scale k, so the
 * default camera shows Horizon Galaxies at about HORIZON_PX.
 */
function placeHorizon(out: Layout, focus: GalaxyPlace[], horizon: string[], vp: { w: number; h: number }) {
  const aw = Math.max(320, vp.w - FIT_INSETS.x * 2);
  const ah = Math.max(240, vp.h - FIT_INSETS.top - FIT_INSETS.bottom);
  // Slot centre = point on the ring; the slot spans label (above) to disc (below).
  const ax0 = aw / 2 - SLOT.w / 2, ay0 = ah / 2 - SLOT.h / 2;
  const rings: Ring[] = [];
  let left = horizon.length;
  for (let j = 0; j < 3 && left > 0; j++) {
    const ax = ax0 - j * SLOT.w, ay = ay0 - j * SLOT.h;
    if (ax < SLOT.w || ay < SLOT.h) break;
    const n = j === 2 ? left : Math.min(left, capacity(ax, ay));
    rings.push({ ax, ay, n });
    left -= n;
  }
  const last = rings[rings.length - 1];
  if (last && left > 0) last.n += left;

  // Focus sits inside the innermost ring with one slot of clearance.
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const g of focus) { x0 = Math.min(x0, g.x - g.R); x1 = Math.max(x1, g.x + g.R); y0 = Math.min(y0, g.y - g.R - 30); y1 = Math.max(y1, g.y + g.R); }
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  for (const g of focus) { g.x -= cx; g.y -= cy; }
  const hw = (x1 - x0) / 2, hh = (y1 - y0) / 2;
  const ia = Math.max(40, (last?.ax ?? ax0) - SLOT.w * 0.75), ib = Math.max(30, (last?.ay ?? ay0) - SLOT.h * 0.75);
  // Start with the Focus box's corner on an ellipse inside the innermost ring...
  let k = Math.min(1.6, 1 / Math.hypot(hw / ia, hh / ib));
  // ...then shrink until no Focus disc or label touches a Horizon slot (labels are wider than small discs).
  const slots = rings.flatMap((ring) => ellipsePoints(ring.ax, ring.ay, ring.n)).slice(0, horizon.length);
  const slotBox = (p: { x: number; y: number }) => ({ x0: p.x - SLOT.w / 2, x1: p.x + SLOT.w / 2, y0: p.y - SLOT.h / 2, y1: p.y + SLOT.h / 2 });
  const focusBox = (g: GalaxyPlace, k: number) => {
    const x = g.x * k, y = g.y * k, r = g.R * k, lw = focusLabelPx(g.repo) / 2;
    return { x0: Math.min(x - r, x - lw), x1: Math.max(x + r, x + lw), y0: y - r - 32, y1: y + r };
  };
  const touch = (a: Box, b: Box) => a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;
  const boxes = slots.map(slotBox);
  const home = focus.map((g) => g.x);
  // Neighbouring Focus labels must not touch either: spread the row apart in px when they would.
  const spread = (k: number) => {
    focus.forEach((g, i) => (g.x = home[i] ?? g.x));
    for (let i = 1; i < focus.length; i++) {
      const a = focus[i - 1], g = focus[i];
      if (!a || !g) continue;
      const need = (focusLabelPx(a.repo) + focusLabelPx(g.repo)) / 2 + 12;
      const gap = (g.x - a.x) * k;
      if (gap < need) for (let j = i; j < focus.length; j++) { const h = focus[j]; if (h) h.x += (need - gap) / k; }
    }
    const first = focus[0], lastF = focus[focus.length - 1];
    const c = first && lastF ? (first.x + lastF.x) / 2 : 0;
    for (const g of focus) g.x -= c;
  };
  const clash = () => focus.some((g) => boxes.some((b) => touch(focusBox(g, k), b)));
  spread(k);
  for (let i = 0; i < 80 && clash(); i++) { k *= 0.95; spread(k); }

  const gals = horizon.map((r) => out.galaxies.get(r)).filter((g): g is GalaxyPlace => !!g);
  const Rmax = Math.max(1, ...gals.map((g) => g.R));
  gals.forEach((g, i) => {
    const p = slots[i];
    if (!p) return;
    const f = Math.min(1, Math.max(0.6, Math.sqrt(g.R / Rmax)));
    const R = ((HORIZON_PX / 2) * f) / k;
    // The point is the slot centre; the disc sits in the slot's lower part, under its label.
    const dy = SLOT.h / 2 - HORIZON_PX / 2 - 4;
    shrink(out, g, R / g.R);
    g.tier = "horizon";
    g.x = p.x / k;
    g.y = (p.y + dy) / k;
    g.R = R;
  });
  out.horizon = gals.map((g) => g.repo);
  out.frame = { x0: -aw / 2 / k, x1: aw / 2 / k, y0: -ah / 2 / k, y1: ah / 2 / k };
}

/** Scale everything inside a Galaxy by s (its offsets and sizes; orbit speeds stay). */
function shrink(out: Layout, g: GalaxyPlace, s: number) {
  g.scale = s;
  if (g.gas) g.gas = { x: g.gas.x * s, y: g.gas.y * s, r: g.gas.r * s };
  if (g.foreign) g.foreign = { x: g.foreign.x * s, y: g.foreign.y * s, r: g.foreign.r * s };
  for (const sp of out.suns.values()) {
    if (!sp.key.startsWith(g.repo + "#")) continue;
    sp.dx *= s; sp.dy *= s; sp.r *= s; sp.R *= s; sp.rings = sp.rings.map((r) => r * s);
  }
  for (const [key, pl] of out.planets) if (key.startsWith(g.repo + "#")) pl.ring *= s;
  for (const [key, lo] of out.loose) if (key.startsWith(g.repo + "#")) { lo.dx *= s; lo.dy *= s; }
}

/** Galaxies in screen order, left to right. */
export function galaxyOrder(l: Layout): string[] {
  return [...l.galaxies.values()].sort((a, b) => a.x - b.x).map((g) => g.repo);
}
