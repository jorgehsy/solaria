import { Application, Container, Graphics, Sprite, Texture } from "pixi.js";
import type { Filter } from "pixi.js";
import { BulgePinchFilter, ShockwaveFilter } from "pixi-filters";
import gsap from "gsap";
import { zoom as d3zoom, zoomIdentity } from "d3-zoom";
import type { ZoomBehavior } from "d3-zoom";
import { select } from "d3-selection";
import type { Selection } from "d3-selection";
import { interpolateZoom } from "d3-interpolate";
import type { ZoomView } from "d3-interpolate";
import { FIT_INSETS, hash01, layoutUniverse, satelliteLabel } from "@solaria/universe";
import type { IssueState, IssueView, Layout, LayoutInput, MapIssue, PullRequest, UniverseEvent, View } from "@solaria/universe";
import type { SceneApi, Targets } from "../live/controller.ts";
import { S } from "../ui/strings.ts";
import type { GalaxyNote } from "../ui/galaxyNotes.ts";

const TAU = Math.PI * 2;
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const rnd = Math.random;
/** Auto tour: how long the camera rests on an event's spot before the event plays. */
const EVENT_HOLD_MS = 1000;
/** How long a hover card stays after the pointer leaves its body, so the pointer can reach the card's link. */
const HOVER_GRACE_MS = 300;

/** What the tooltip shows. React renders it; the Scene only positions it. */
export type TipInfo =
  | { kind: "sun"; repo: string; number: number; title: string; url: string; done: number; total: number; touch: boolean }
  | {
    kind: "issue"; repo: string; number: number; title: string; url: string; state: IssueState; mapTitle: string | null; assignees: string[]; touch: boolean;
    /** External Planet: tagged "external" on the card. */
    external: boolean;
    /** Blockers in repos outside the config, as plain text. */
    outsideBlockers: string[];
  };

export interface Searchable {
  key: string;
  kind: "map" | "issue";
  repo: string;
  number: number;
  title: string;
  state: IssueState | "map";
}

export interface SceneOptions {
  /** Element the canvas fills. */
  host: HTMLElement;
  /** Layer for DOM labels over the canvas. */
  labels: HTMLElement;
  /** Element that receives pan, zoom and hover. */
  root: HTMLElement;
  /** Overlay boxes labels must not cover (header, tools, log, demo panel, search). */
  chrome: () => Element[];
  reducedMotion: () => boolean;
  onTip: (tip: TipInfo | null) => void;
  onDescribe: (text: string) => void;
}

interface Colors {
  ground: number; deep: number; ink: number; muted: number; ice: number; sky: number;
  blue: number; blueText: number; orange: number; gas: number; human: number; agent: number;
}

interface Star { sp: Sprite; ux: number; uy: number; dx: number; dy: number; vx: number; vy: number }
interface Puff { sp: Sprite; ux: number; uy: number; s: number }
interface Blob { sp: Sprite; x: number; y: number; a: number; h: number; on: boolean }
interface Disc { x: number; y: number; r: number }

interface Body {
  x: number; y: number; vx: number; vy: number; tx: number; ty: number;
  ap: number; apTo: number; hold: boolean; dying: boolean; fresh: boolean;
}

interface Galaxy {
  repo: string;
  x: number; y: number; vx: number; vy: number; tx: number; ty: number;
  R: number; Rt: number; spin: number; count: number;
  /** Focus or Horizon, and how much its contents are shrunk (1 in Focus). */
  tier: "focus" | "horizon"; scale: number;
  halo: Sprite; core: Sprite; rot: Container;
  stars: Star[]; puffs: Puff[];
  gas: { base: Sprite | null; baseA: number; blobs: Map<string, Blob> };
  cloud: Disc | null; foreign: Disc | null;
  label: HTMLAnchorElement;
}

interface Sun extends Body {
  key: string; data: MapIssue; h1: number;
  r: number; bodyR: number; R: number; rings: number[]; dx: number; dy: number;
  done: number; total: number; prog01: number; progTo: number; progDrawn: number; flare: number;
  glow: Sprite; corona: Sprite; orbit: Graphics; body: Graphics; prog: Graphics;
  label: HTMLAnchorElement;
}

interface Travel { t: number; fx: number; fy: number; side: number }

interface Node extends Body {
  key: string; data: IssueView; h1: number; h2: number;
  role: "planet" | "foreign" | "gas"; sun: Sun | null;
  ring: number; theta0: number; omega: number; ldx: number; ldy: number;
  glowA: number; glowS: number; drawn: IssueState | null; ping: number; satA: number;
  travel: Travel | null; hist: number[] | null;
  glow: Sprite; body: Graphics; sat: Sprite; satGlow: Sprite;
  label: HTMLSpanElement | null; labelText: string;
}

interface Trail {
  key: string; pr: PullRequest; prog: number; alpha: number; aTo: number; dying: boolean; h: number;
  head: { head: Sprite; core: Sprite } | null;
}

interface Path { a: { x: number; y: number }; b: { x: number; y: number }; bend: number; min?: number }

interface Part {
  sp: Sprite; x: number; y: number; vx: number; vy: number; life: number; t: number; size: number; drag: number;
  to: (() => { x: number; y: number }) | null; from: { x: number; y: number } | null;
}

interface Resolved { nodes: Set<Node>; suns: Set<Sun>; gals: Set<Galaxy>; trails: Set<Trail>; ringGals: Set<Galaxy> }

interface Cam { x: number; y: number; k: number }

/**
 * The Universe canvas. One plain class owns PixiJS, GSAP and d3 (ADR 0005): it draws every frame,
 * plays the animations, and keeps its own maps of Galaxies, Suns, Planets and trails.
 * Layout math comes from @solaria/universe; this class only springs things toward it.
 */
export class Scene implements SceneApi {
  private app: Application | null = null;
  private ok = false;
  private C!: Colors;
  private tex!: { glow: Texture; soft: Texture; dot: Texture };
  private scene!: Container;
  private world!: Container;
  private gLayer!: Container;
  private gasLayer!: Container;
  private lineLayer!: Container;
  private glowLayer!: Container;
  private bodyLayer!: Container;
  private fxLayer!: Container;
  private dyn!: Graphics;
  private hlG!: Graphics;
  private W = 0;
  private H = 0;
  private cam: Cam = { x: 0, y: 0, k: 1 };
  private camTo: Cam | null = null;
  private autoFit = true;
  private fitDirty = true;
  private galaxies = new Map<string, Galaxy>();
  /** World box the default fit frames when there is a Horizon. */
  private frame: Layout["frame"] = null;
  /** Most zoom allowed: Horizon Galaxies are small, so flying into one needs more. */
  private kMax = 4;
  private nodes = new Map<string, Node>();
  private suns = new Map<string, Sun>();
  private trails = new Map<string, Trail>();
  private parts: Part[] = [];
  private pool: Sprite[] = [];
  private filters = new Set<Filter>();
  private T = 0;
  private lastNow = 0;
  private introA = 0;
  private vm: View = { repos: [], maps: new Map(), issues: new Map(), prs: new Map() };
  private claims = new Set<string>();
  private hover: Node | Sun | null = null;
  /** When a lost hover closes its card: a grace so the pointer can cross the gap into the card. 0 = none pending. */
  private hoverOff = 0;
  /** The card's box and the gap it leaves to its body, in screen px, as last placed. */
  private tipBox: { x: number; y: number; w: number; h: number; gapTop: number; gapBottom: number } | null = null;
  private selected: Node | Sun | null = null;
  private tipFor: Node | Sun | null = null;
  private tipKey = "";
  private tipEl: HTMLElement | null = null;
  private mouse: { x: number; y: number } | null = null;
  private dust: { sp: Sprite; u: number; v: number; p: number; a: number; tw: number; ts: number }[] = [];
  private zoom: ZoomBehavior<HTMLElement, unknown> | null = null;
  private zsel: Selection<HTMLElement, unknown, null, undefined> | null = null;
  private fxBusy = 0;
  private hlT: Targets | null = null;
  private hlA = 0;
  private hl: Resolved | null = null;
  private arrows: HTMLSpanElement[] = [];
  private hit!: HTMLAnchorElement;
  private flight: gsap.core.Tween | null = null;
  private tour: { i: number; timer: ReturnType<typeof setTimeout> | undefined } | null = null;
  /** An event's camera travel (flight + hold) still under way: calling it lets the event play now. */
  private evTravel: (() => void) | null = null;
  private cleanup: (() => void)[] = [];
  /* Error and empty states (spec section 9): per repo look, card and quiet line. */
  private notes = new Map<string, GalaxyNote>();
  private noteEls = new Map<string, { fade: number; card: HTMLDivElement | null; quiet: HTMLDivElement | null }>();
  private readonly o: SceneOptions;

  constructor(o: SceneOptions) {
    this.o = o;
  }

  private still(): boolean {
    return this.o.reducedMotion();
  }

  static hasWebGL(): boolean {
    try {
      const c = document.createElement("canvas");
      return !!(c.getContext("webgl2") || c.getContext("webgl"));
    } catch {
      return false;
    }
  }

  /** Returns false when the browser cannot draw (no WebGL, or Pixi failed to start). */
  async init(): Promise<"ok" | "nowebgl" | "failed"> {
    if (!Scene.hasWebGL()) return "nowebgl";
    this.colors();
    const app = new Application();
    try {
      await app.init({
        resizeTo: this.o.host, backgroundAlpha: 0, antialias: true,
        resolution: Math.min(2, window.devicePixelRatio || 1), autoDensity: true,
        preference: "webgl", powerPreference: "high-performance", hello: false,
      });
    } catch {
      return "failed";
    }
    this.app = app;
    this.o.host.appendChild(app.canvas);
    this.tex = {
      glow: radialTex(128, [[0, 1], [0.2, 0.42], [0.5, 0.1], [1, 0]]),
      soft: radialTex(256, [[0, 0.75], [0.3, 0.42], [0.62, 0.12], [1, 0]]),
      dot: radialTex(32, [[0, 1], [0.35, 0.85], [0.6, 0.25], [1, 0]]),
    };
    this.scene = new Container();
    app.stage.addChild(this.scene);
    const bg = new Container();
    this.world = new Container();
    this.gLayer = new Container();
    this.gasLayer = new Container();
    this.lineLayer = new Container();
    this.dyn = new Graphics();
    this.glowLayer = new Container();
    this.bodyLayer = new Container();
    this.fxLayer = new Container();
    this.hlG = new Graphics();
    this.lineLayer.addChild(this.dyn);
    this.world.addChild(this.gLayer, this.gasLayer, this.lineLayer, this.glowLayer, this.bodyLayer, this.fxLayer, this.hlG);
    this.scene.addChild(bg, this.world);
    let seed = 11;
    const srnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 260; i++) {
      const sp = new Sprite(this.tex.dot);
      sp.anchor.set(0.5);
      sp.scale.set(0.04 + srnd() * srnd() * 0.12);
      sp.tint = srnd() < 0.18 ? this.C.sky : this.C.ice;
      const a = 0.15 + srnd() * 0.5;
      sp.alpha = a;
      bg.addChild(sp);
      this.dust.push({ sp, u: srnd(), v: srnd(), p: i % 3 === 0 ? 0.06 : 0.02, a, tw: srnd() * TAU, ts: 0.3 + srnd() * 0.9 });
    }
    this.W = app.screen.width;
    this.H = app.screen.height;
    app.renderer.on("resize", (w: number, h: number) => {
      this.W = w;
      this.H = h;
      // Horizon geometry depends on the window size.
      if (this.vm.repos.length) this.layout();
      this.fitDirty = true;
      if (this.autoFit) {
        const f = this.fitTarget();
        if (f) { Object.assign(this.cam, f); this.camTo = null; this.syncZoom(f); }
      }
    });
    // GSAP rides the same ticker as Pixi: one clock for the whole page.
    gsap.ticker.remove(gsap.updateRoot);
    gsap.ticker.lagSmoothing(0);
    app.ticker.maxFPS = 60;
    app.ticker.add(() => this.tick());
    const onVis = () => {
      if (document.hidden) app.ticker.stop();
      else { this.lastNow = 0; app.ticker.start(); }
    };
    document.addEventListener("visibilitychange", onVis);
    this.cleanup.push(() => document.removeEventListener("visibilitychange", onVis));
    this.hit = document.createElement("a");
    this.hit.className = "hit";
    this.hit.target = "_blank";
    this.hit.rel = "noopener";
    this.hit.draggable = false;
    this.hit.tabIndex = -1;
    this.hit.hidden = true;
    this.o.labels.appendChild(this.hit);
    this.bindInput();
    this.ok = true;
    return "ok";
  }

  destroy(): void {
    this.ok = false;
    this.tourStop();
    for (const f of this.cleanup) f();
    gsap.ticker.add(gsap.updateRoot);
    this.app?.destroy(true, { children: true });
    this.app = null;
    this.o.labels.replaceChildren();
  }

  ready(): boolean {
    return this.ok;
  }

  setTipElement(el: HTMLElement | null): void {
    this.tipEl = el;
  }

  private colors() {
    const cs = getComputedStyle(document.documentElement);
    const v = (n: string) => parseInt(cs.getPropertyValue(n).trim().replace("#", ""), 16) || 0xffffff;
    this.C = {
      ground: v("--ground-b"), deep: v("--ground-c"), ink: v("--ink"), muted: v("--ink-muted"), ice: v("--ice"), sky: v("--sky"),
      blue: v("--blue"), blueText: v("--blue-text"), orange: v("--orange"), gas: v("--gas"), human: v("--human"), agent: v("--agent"),
    };
  }

  private sprite(tex: Texture, tint: number, alpha = 1): Sprite {
    const sp = new Sprite(tex);
    sp.anchor.set(0.5);
    sp.blendMode = "add";
    sp.tint = tint;
    sp.alpha = alpha;
    return sp;
  }

  /* ----- Galaxies ----- */
  private makeGalaxy(repo: string): Galaxy {
    const C = this.C;
    const h = hash01(repo);
    const halo = this.sprite(this.tex.soft, C.blue, 0.2);
    const core = this.sprite(this.tex.glow, C.sky, 0.3);
    const rot = new Container();
    this.gLayer.addChild(halo, rot, core);
    let seed = Math.floor(h * 1e6) + 3;
    const srnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const gauss = () => (srnd() + srnd() + srnd() - 1.5) / 1.5;
    const stars: Star[] = [];
    // Two faint arms of stars plus a bulge: a cluster that turns slowly.
    for (let i = 0; i < 300; i++) {
      let ux: number, uy: number, s: number, a: number;
      if (i < 60) {
        const r = Math.abs(gauss()) * 0.22, t = srnd() * TAU;
        ux = Math.cos(t) * r; uy = Math.sin(t) * r * 0.9; s = 0.05 + srnd() * 0.08; a = 0.3 + srnd() * 0.5;
      } else {
        const arm = i % 2, t = srnd();
        const rr = 0.14 + t * 0.92 + gauss() * 0.05;
        const th = arm * Math.PI + t * 3.6 + gauss() * (0.38 - t * 0.18);
        ux = Math.cos(th) * rr; uy = Math.sin(th) * rr; s = 0.03 + srnd() * srnd() * 0.1; a = 0.12 + srnd() * 0.45 * (1 - t * 0.5);
      }
      const sp = this.sprite(this.tex.dot, srnd() < 0.35 ? C.sky : C.ice, a);
      sp.scale.set(s);
      rot.addChild(sp);
      stars.push({ sp, ux, uy, dx: 0, dy: 0, vx: 0, vy: 0 });
    }
    const puffs: Puff[] = [];
    for (let i = 0; i < 6; i++) {
      const arm = i % 2, t = 0.25 + (i >> 1) * 0.28, th = arm * Math.PI + t * 3.6;
      const sp = this.sprite(this.tex.soft, C.blue, 0.07);
      rot.addChildAt(sp, 0);
      puffs.push({ sp, ux: Math.cos(th) * t, uy: Math.sin(th) * t, s: 0.5 - t * 0.2 });
    }
    const label = document.createElement("a");
    label.className = "lab lab-gal";
    label.target = "_blank";
    label.rel = "noopener";
    label.href = `https://github.com/${repo}/issues`;
    this.o.labels.appendChild(label);
    const G: Galaxy = {
      repo, x: 0, y: 0, vx: 0, vy: 0, tx: 0, ty: 0, R: 120, Rt: 120, spin: h * TAU, count: 0, tier: "focus", scale: 1,
      halo, core, rot, stars, puffs, gas: { base: null, baseA: 0, blobs: new Map() }, cloud: null, foreign: null, label,
    };
    // A Horizon Galaxy's label flies the camera to it; it never swaps it into Focus.
    label.addEventListener("click", (e) => {
      if (G.tier !== "horizon" || e.ctrlKey || e.metaKey || e.shiftKey) return;
      e.preventDefault();
      if (this.tour) this.tourStop();
      this.flyTo(this.frameGalaxy(G, 1.1), 900);
    });
    return G;
  }
  private destroyGalaxy(G: Galaxy) {
    for (const o of [G.halo, G.rot, G.core]) o.destroy({ children: true });
    G.gas.base?.destroy();
    for (const b of G.gas.blobs.values()) b.sp.destroy();
    G.label.remove();
  }

  /* ----- issues ----- */
  private drawIssue(n: Node) {
    const C = this.C;
    const g = n.body, r = 5, st = n.data.state;
    g.clear();
    if (st === "blocked") {
      const q = r * 1.15;
      g.poly([0, -q - 2, q + 2, 0, 0, q + 2, -q - 2, 0]).fill({ color: C.deep, alpha: 0.9 });
      g.poly([0, -q, q, 0, 0, q, -q, 0]).fill({ color: C.orange });
    } else {
      g.circle(0, 0, r + 2).fill({ color: C.deep, alpha: 0.85 });
      if (st === "doing") { g.circle(0, 0, r).fill({ color: C.blue }); g.circle(0, 0, r - 0.5).stroke({ width: 1, color: C.sky, alpha: 0.85 }); }
      else if (st === "review") { g.circle(0, 0, r - 0.85).stroke({ width: 1.7, color: C.blueText }); g.circle(0, 0, r * 0.36).fill({ color: C.blueText }); }
      else if (st === "done") g.circle(0, 0, r * 0.5).fill({ color: C.ice, alpha: 0.4 });
      else g.circle(0, 0, r - 0.85).stroke({ width: 1.7, color: C.muted });
    }
    // External Planet: a dotted halo, so it reads as "not one of your repos" before any hover.
    if (n.data.external) for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU;
      g.circle(Math.cos(a) * (r + 4), Math.sin(a) * (r + 4), 0.9).fill({ color: C.muted, alpha: 0.9 });
    }
    const GL: Record<IssueState, [number, number, number]> = {
      doing: [C.sky, 0.55, 5.4], review: [C.blueText, 0.34, 4.6], blocked: [C.orange, 0.26, 4.2], todo: [C.ice, 0.11, 3.6], done: [C.ice, 0.05, 2.6],
    };
    const [tint, a, s] = GL[st];
    n.glow.tint = tint;
    n.glowA = a;
    n.glowS = (s * r * 2) / 128;
    n.drawn = st;
  }
  private makeNode(d: IssueView): Node {
    const glow = this.sprite(this.tex.glow, this.C.ice);
    const body = new Graphics();
    const sat = this.sprite(this.tex.dot, this.C.agent, 0);
    const satGlow = this.sprite(this.tex.glow, this.C.agent, 0);
    this.glowLayer.addChild(glow, satGlow);
    this.bodyLayer.addChild(body, sat);
    const n: Node = {
      key: d.key, data: d, h1: hash01(d.key), h2: hash01(d.key + "~"),
      x: 0, y: 0, vx: 0, vy: 0, tx: 0, ty: 0, ap: 0, apTo: 1, hold: false, dying: false, fresh: true,
      role: "gas", sun: null, ring: 0, theta0: 0, omega: 0, ldx: 0, ldy: 0,
      glowA: 0, glowS: 0, drawn: null, ping: 0, satA: 0, travel: null, hist: null,
      glow, body, sat, satGlow, label: null, labelText: "",
    };
    this.drawIssue(n);
    return n;
  }
  private destroyNode(n: Node) {
    gsap.killTweensOf(n);
    n.glow.destroy(); n.body.destroy(); n.sat.destroy(); n.satGlow.destroy();
    n.label?.remove();
  }

  /* ----- Suns ----- */
  private drawSun(s: Sun) {
    const g = s.body, r = s.r;
    g.clear();
    g.circle(0, 0, r + 8).fill({ color: this.C.deep, alpha: 0.9 });
    g.circle(0, 0, r).fill({ color: this.C.ice });
    s.progDrawn = -1;
  }
  private drawProg(s: Sun) {
    const g = s.prog, r = s.r + 5;
    g.clear();
    g.circle(0, 0, r).stroke({ width: 2.5, color: this.C.ice, alpha: 0.2 });
    if (s.prog01 > 0.001) {
      const a0 = -Math.PI / 2, a1 = a0 + TAU * Math.min(1, s.prog01);
      g.moveTo(Math.cos(a0) * r, Math.sin(a0) * r).arc(0, 0, r, a0, a1).stroke({ width: 2.5, color: this.C.sky, cap: "round" });
    }
    s.progDrawn = s.prog01;
  }
  private makeSun(d: MapIssue): Sun {
    const glow = this.sprite(this.tex.glow, this.C.sky);
    const corona = this.sprite(this.tex.glow, this.C.ice);
    const orbit = new Graphics();
    const body = new Graphics();
    const prog = new Graphics();
    this.lineLayer.addChildAt(orbit, 0);
    this.glowLayer.addChild(glow, corona);
    this.bodyLayer.addChild(body, prog);
    const label = document.createElement("a");
    label.className = "lab lab-map";
    label.target = "_blank";
    label.rel = "noopener";
    this.o.labels.appendChild(label);
    return {
      key: d.key, data: d, h1: hash01(d.key),
      x: 0, y: 0, vx: 0, vy: 0, tx: 0, ty: 0, ap: 0, apTo: 1, hold: false, dying: false, fresh: true,
      r: 15, bodyR: 0, R: 45, rings: [], dx: 0, dy: 0, done: 0, total: 0, prog01: 0, progTo: 0, progDrawn: -1, flare: 0,
      glow, corona, orbit, body, prog, label,
    };
  }
  private destroySun(s: Sun) {
    gsap.killTweensOf(s);
    for (const o of [s.glow, s.corona, s.orbit, s.body, s.prog]) o.destroy();
    s.label.remove();
  }

  /* ----- refresh: view -> scene objects + layout ----- */
  refresh(view: View, opts: { first: boolean; ev?: UniverseEvent }): void {
    if (!this.ok) return;
    const { first, ev } = opts;
    this.vm = view;
    if (ev) this.claimFor(ev);
    for (const r of view.repos) if (!this.galaxies.has(r)) this.galaxies.set(r, this.makeGalaxy(r));
    for (const [r, G] of this.galaxies) if (!view.repos.includes(r)) { this.destroyGalaxy(G); this.galaxies.delete(r); }
    this.syncNotes();
    for (const [k, m] of view.maps) {
      let s = this.suns.get(k);
      if (!s) {
        s = this.makeSun(m);
        this.suns.set(k, s);
        if (this.claims.has(k)) { s.hold = true; s.ap = 0; } else if (first) s.ap = 1;
      }
      s.data = m; s.dying = false; s.apTo = 1;
    }
    for (const [k, s] of this.suns) if (!view.maps.has(k)) { s.dying = true; s.apTo = 0; }
    for (const [k, i] of view.issues) {
      let n = this.nodes.get(k);
      if (!n) {
        n = this.makeNode(i);
        this.nodes.set(k, n);
        if (this.claims.has(k)) { n.hold = true; n.ap = 0; } else if (first) n.ap = 1;
      }
      const was = n.data.state;
      n.data = i; n.dying = false; n.apTo = 1;
      if (was !== i.state || n.drawn !== i.state) { this.drawIssue(n); if (!first && !n.fresh) n.ping = 1; }
    }
    for (const [k, n] of this.nodes) if (!view.issues.has(k)) { n.dying = true; n.apTo = 0; n.hold = false; }
    for (const [k, p] of view.prs) {
      let t = this.trails.get(k);
      if (!t) {
        const claimed = this.claims.has(k);
        t = { key: k, pr: p, prog: claimed ? 0 : 1, alpha: claimed ? 0.5 : first ? 0.5 : 0, aTo: 0.5, dying: false, head: null, h: hash01(k) };
        this.trails.set(k, t);
      }
      t.pr = p; t.dying = false; t.aTo = 0.5;
    }
    for (const [k, t] of this.trails) if (!view.prs.has(k)) { t.dying = true; t.aTo = 0; }
    this.layout();
    if (first) for (const G of this.galaxies.values()) { G.x = G.tx; G.y = G.ty; G.R = G.Rt; }
    // New objects start where they belong (an effect may move them right after).
    for (const s of this.suns.values()) if (s.fresh) { s.fresh = false; this.targetSun(s); s.x = s.tx; s.y = s.ty; }
    for (const n of this.nodes.values()) if (n.fresh) { n.fresh = false; this.targetNode(n); n.x = n.tx; n.y = n.ty; }
    if (first) {
      this.introA = this.still() ? 1 : 0;
      const f = this.fitTarget();
      if (f) { Object.assign(this.cam, f); this.syncZoom(f); }
    }
    this.claims.clear();
    this.describe();
  }
  private claimFor(ev: UniverseEvent) {
    if (ev.type === "bigbang") { this.claims.add(ev.map); for (const k of ev.kids) if (!this.nodes.has(k)) this.claims.add(k); }
    if (ev.type === "rift" || ev.type === "flare") this.claims.add(ev.issue);
    if (ev.type === "comet") this.claims.add(ev.pr);
  }
  private describe() {
    const ni = [...this.vm.issues.values()].filter((i) => i.state !== "done").length;
    this.o.onDescribe(S.universe.srDescription(ni, this.vm.maps.size, this.vm.repos.length));
  }

  /* ----- layout ----- */
  private layout() {
    const repos = this.vm.repos;
    const openCount: Record<string, number> = {};
    const input: LayoutInput = { repos, suns: [], gas: [], foreign: [], openCount };
    const live = (n: Node) => !(n.dying && n.ap < 0.05);
    const bySun = new Map<Sun, Node[]>();
    for (const n of this.nodes.values()) {
      if (!live(n)) continue;
      const sun = n.data.map ? this.suns.get(n.data.map) : undefined;
      // An External Planet has no Galaxy of its own: it exists only in its Map's orbit.
      if (n.data.external) {
        n.sun = sun && !sun.dying && repos.includes(sun.data.repo) ? sun : null;
        n.role = "planet";
        if (n.sun) bySun.set(n.sun, [...(bySun.get(n.sun) ?? []), n]);
        continue;
      }
      if (!repos.includes(n.data.repo)) continue;
      if (sun && !sun.dying) {
        n.sun = sun;
        if (sun.data.repo === n.data.repo) {
          n.role = "planet";
          const list = bySun.get(sun) ?? [];
          list.push(n);
          bySun.set(sun, list);
        } else {
          n.role = "foreign";
          input.foreign.push({ key: n.key, repo: n.data.repo, number: n.data.number, sun: sun.key, done: n.data.state === "done" });
        }
      } else {
        n.sun = null;
        n.role = "gas";
        input.gas.push({ key: n.key, repo: n.data.repo, number: n.data.number });
      }
      if (n.data.state !== "done" && !n.dying) openCount[n.data.repo] = (openCount[n.data.repo] ?? 0) + 1;
    }
    for (const s of this.suns.values()) {
      if (s.dying || !repos.includes(s.data.repo)) continue;
      input.suns.push({
        key: s.key, repo: s.data.repo, number: s.data.number,
        planets: (bySun.get(s) ?? []).map((n) => ({ key: n.key, number: n.data.number, blockers: n.data.blockers, done: n.data.state === "done" })),
      });
    }
    const L = layoutUniverse(input, { reducedMotion: this.still(), viewport: { w: this.W || 1440, h: this.H || 900 } });
    this.frame = L.frame;
    for (const s of this.suns.values()) {
      const p = L.suns.get(s.key);
      if (!p) continue;
      s.dx = p.dx; s.dy = p.dy; s.r = p.r; s.R = p.R; s.rings = p.rings; s.done = p.done; s.total = p.total;
      if (!s.hold) s.progTo = p.total ? p.done / p.total : 0;
      const g = s.orbit;
      g.clear();
      s.rings.forEach((r, i) => g.circle(0, 0, r).stroke({ width: 1, color: this.C.ice, alpha: 0.08 - i * 0.012 }));
      s.label.href = s.data.url;
      s.label.setAttribute("aria-label", S.map.aria(s.data.title, p.done, p.total));
      const sub = p.total ? S.map.progress(p.done, p.total) : S.map.noSubIssues;
      const html = `<b>${esc(s.data.title)}</b><span>${esc(sub)}</span>`;
      if (s.label.innerHTML !== html) s.label.innerHTML = html;
    }
    for (const n of this.nodes.values()) {
      const pl = L.planets.get(n.key);
      if (pl) { n.ring = pl.ring; n.theta0 = pl.theta0; n.omega = pl.omega; }
      const lo = L.loose.get(n.key);
      if (lo) { n.ldx = lo.dx; n.ldy = lo.dy; }
    }
    for (const repo of repos) {
      const G = this.galaxies.get(repo);
      const p = L.galaxies.get(repo);
      if (!G || !p) continue;
      G.tx = p.x; G.ty = p.y; G.Rt = p.R; G.cloud = p.gas; G.foreign = p.foreign;
      G.tier = p.tier; G.scale = p.scale;
      G.count = input.openCount[repo] ?? 0;
      this.galaxyLabel(G);
      this.syncGas(G, input.gas.filter((g) => g.repo === repo).map((g) => g.key));
    }
    const sMin = Math.min(1, ...[...this.galaxies.values()].map((G) => G.scale));
    this.kMax = Math.max(4, 4 / sMin);
    this.zoom?.scaleExtent([0.06, this.kMax]);
    this.fitDirty = true;
  }
  /** Focus: full `owner/repo` and the open count. Horizon: repo name only (CSS truncates), full name on hover. */
  private galaxyLabel(G: Galaxy) {
    const hz = G.tier === "horizon";
    const name = hz ? G.repo.slice(G.repo.indexOf("/") + 1) : G.repo;
    const sub = this.notes.get(G.repo)?.look === "ghost" ? S.galaxy.noData : G.count ? S.galaxy.open(G.count) : S.galaxy.nothingOpen;
    const html = hz ? esc(name) : `${esc(name)}<span>${esc(sub)}</span>`;
    if (G.label.innerHTML !== html) G.label.innerHTML = html;
    G.label.classList.toggle("lab-hz", hz);
    if (hz) G.label.title = G.repo; else G.label.removeAttribute("title");
  }
  /**
   * How much of a Galaxy's inside shows at zoom k: 1 in Focus. A Horizon Galaxy is a distant
   * smudge at the default fit; its Suns and Planets fade in as the camera flies close.
   */
  private vis(G: Galaxy | undefined, k: number): number {
    if (!G || G.scale >= 1) return 1;
    const u = clamp((k * G.scale - 0.2) / 0.25, 0, 1);
    return u * u * (3 - 2 * u);
  }
  private syncGas(G: Galaxy, keys: string[]) {
    const set = new Set(keys);
    if (G.cloud && !G.gas.base) {
      G.gas.base = this.sprite(this.tex.soft, this.C.gas, 0);
      this.gasLayer.addChild(G.gas.base);
    }
    for (const k of set) {
      if (G.gas.blobs.has(k)) continue;
      const sp = this.sprite(this.tex.soft, this.C.gas, 0);
      this.gasLayer.addChild(sp);
      const n = this.nodes.get(k);
      G.gas.blobs.set(k, { sp, x: n ? n.x : G.x, y: n ? n.y : G.y, a: 0, h: hash01(k), on: true });
    }
    for (const [k, b] of G.gas.blobs) b.on = set.has(k);
  }

  /* ----- targets ----- */
  private targetSun(s: Sun) {
    const G = this.galaxies.get(s.data.repo);
    if (!G) return;
    s.tx = G.x + s.dx;
    s.ty = G.y + s.dy;
  }
  private targetNode(n: Node) {
    if (n.role === "planet" && n.sun) {
      const a = n.theta0 + n.omega * this.T;
      n.tx = n.sun.x + Math.cos(a) * n.ring;
      n.ty = n.sun.y + Math.sin(a) * n.ring;
      return;
    }
    const G = this.galaxies.get(n.data.repo);
    if (!G) return;
    n.tx = G.x + n.ldx;
    n.ty = G.y + n.ldy;
  }

  /* ----- camera ----- */
  private fitTarget(): Cam | null {
    const { W, H } = this;
    if (!W || !H || !this.galaxies.size) return null;
    const { x: padX, top, bottom } = FIT_INSETS;
    if (this.frame) {
      const f = this.frame;
      const k = Math.min((W - padX * 2) / (f.x1 - f.x0), (H - top - bottom) / (f.y1 - f.y0));
      return { k, x: W / 2 - ((f.x0 + f.x1) / 2) * k, y: top + (H - top - bottom) / 2 - ((f.y0 + f.y1) / 2) * k };
    }
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const G of this.galaxies.values()) {
      x0 = Math.min(x0, G.tx - G.Rt); x1 = Math.max(x1, G.tx + G.Rt);
      y0 = Math.min(y0, G.ty - G.Rt - 20); y1 = Math.max(y1, G.ty + G.Rt);
    }
    const k = clamp(Math.min((W - padX * 2) / (x1 - x0), (H - top - bottom) / (y1 - y0)), 0.08, 1.6);
    return { k, x: W / 2 - ((x0 + x1) / 2) * k, y: top + (H - top - bottom) / 2 - ((y0 + y1) / 2) * k };
  }
  private syncZoom(t: Cam) {
    if (!this.zoom || !this.zsel) return;
    this.zoom.transform(this.zsel, zoomIdentity.translate(t.x, t.y).scale(t.k));
  }
  private flyTo(t: Cam | null, ms: number, ease?: string, onDone?: () => void) {
    this.stopFlight();
    if (!t) { onDone?.(); return; }
    this.autoFit = false;
    this.camTo = null;
    if (this.still() || ms <= 0) { Object.assign(this.cam, t); this.syncZoom(t); onDone?.(); return; }
    const { W, H, cam } = this;
    const v0: ZoomView = [(W / 2 - cam.x) / cam.k, (H / 2 - cam.y) / cam.k, W / cam.k];
    const v1: ZoomView = [(W / 2 - t.x) / t.k, (H / 2 - t.y) / t.k, W / t.k];
    const I = interpolateZoom(v0, v1);
    const o = { u: 0 };
    this.fxBusy++;
    this.flight = gsap.to(o, {
      u: 1, duration: ms / 1000, ease: ease ?? "power2.inOut",
      onUpdate: () => { const v = I(o.u), k = W / v[2]; cam.k = k; cam.x = W / 2 - v[0] * k; cam.y = H / 2 - v[1] * k; },
      onComplete: () => { this.flight = null; this.fxBusy--; this.syncZoom({ ...cam }); onDone?.(); },
      onInterrupt: () => { this.fxBusy--; },
    });
  }
  private stopFlight() {
    if (this.flight) { this.flight.kill(); this.flight = null; this.fxBusy = Math.max(0, this.fxBusy - 1); this.syncZoom({ ...this.cam }); }
    // Whatever moved the camera cut an event's travel short: the event plays where the camera is.
    this.evTravel?.();
  }
  private frameBox(x0: number, y0: number, x1: number, y1: number, kMax = 1.4): Cam {
    const { W, H } = this;
    const padX = 80, top = 120, bottom = 130;
    const k = clamp(Math.min((W - padX * 2) / Math.max(1, x1 - x0), (H - top - bottom) / Math.max(1, y1 - y0)), 0.12, kMax);
    return { k, x: W / 2 - ((x0 + x1) / 2) * k, y: top + (H - top - bottom) / 2 - ((y0 + y1) / 2) * k };
  }
  private boxOf(t: Targets) {
    const r = this.resolveHl(t);
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, s = 1;
    const add = (x: number, y: number, rr: number) => { x0 = Math.min(x0, x - rr); y0 = Math.min(y0, y - rr); x1 = Math.max(x1, x + rr); y1 = Math.max(y1, y + rr); };
    // Inside a Horizon Galaxy everything is shrunk: pad less and allow a closer camera.
    const sc = (repo: string) => { const g = this.galaxies.get(repo)?.scale ?? 1; s = Math.min(s, g); return g; };
    for (const n of r.nodes) add(n.tx, n.ty, 40 * sc(n.data.repo));
    for (const su of r.suns) add(su.tx, su.ty, (su.rings.length ? (su.rings[su.rings.length - 1] ?? su.r) : su.r) + 24 * sc(su.data.repo));
    for (const G of r.ringGals) { sc(G.repo); add(G.tx, G.ty, G.Rt); }
    if (!isFinite(x0)) for (const G of r.gals) { sc(G.repo); add(G.tx, G.ty, G.Rt); }
    return isFinite(x0) ? { x0, y0, x1, y1, s } : null;
  }
  private frameTargets(t: Targets): Cam | null {
    const b = this.boxOf(t);
    return b ? this.frameBox(b.x0, b.y0, b.x1, b.y1, Math.min(this.kMax, 1.4 / b.s)) : null;
  }
  private frameGalaxy(G: Galaxy, kMax: number): Cam {
    const R = G.Rt * 1.05;
    return this.frameBox(G.tx - R, G.ty - R, G.tx + R, G.ty + R, Math.min(this.kMax, kMax / G.scale));
  }
  /** Fly to what an event or a search hit touched: ~800 ms, a cut with reduced motion. */
  travel(t: Targets, ms = 800): void {
    if (this.tour) this.tourStop();
    this.flyTo(this.frameTargets(t), ms);
  }
  /** The camera already shows `to` closely enough that flying there would only be a jolt. */
  private closeTo(to: Cam): boolean {
    const { W, H, cam } = this;
    // Where the target's view centre sits on screen now, against the screen centre.
    const wx = (W / 2 - to.x) / to.k, wy = (H / 2 - to.y) / to.k;
    const d = Math.hypot(wx * cam.k + cam.x - W / 2, wy * cam.k + cam.y - H / 2);
    return Math.abs(Math.log(to.k / cam.k)) < 0.15 && d < 0.06 * Math.min(W, H);
  }
  touring(): boolean {
    return !!this.tour;
  }
  tourStart(): void {
    if (this.tour || !this.ok || !this.galaxies.size) return;
    this.tour = { i: -1, timer: undefined };
    this.tourNext();
  }
  tourStop(): void {
    if (!this.tour) return;
    clearTimeout(this.tour.timer);
    this.tour = null;
    this.stopFlight(); // the camera stays exactly where it was
  }
  private zoomAbout(t: Cam, f: number): Cam {
    const { W, H } = this;
    const k = t.k * f;
    return { k, x: W / 2 - ((W / 2 - t.x) / t.k) * k, y: H / 2 - ((H / 2 - t.y) / t.k) * k };
  }
  private tourNext() {
    const me = this.tour;
    if (!me) return;
    // Focus first: Galaxies by open issues, then the whole picture.
    const list = [...this.galaxies.values()].sort((a, b) => b.count - a.count);
    me.i = (me.i + 1) % (list.length + 1);
    const G = list[me.i];
    const t = G ? this.frameGalaxy(G, 1.1) : this.fitTarget();
    if (!t) return;
    this.flyTo(t, 6000, "sine.inOut", () => {
      if (this.tour !== me) return;
      // Stay ~20 s, drifting in a touch.
      this.flyTo(this.zoomAbout(t, 1.08), 20000, "sine.inOut", () => { if (this.tour === me) this.tourNext(); });
    });
  }
  /**
   * Auto tour, every event: fly to where it will happen (unless already framed), hold EVENT_HOLD_MS so
   * the eye lands, then let it play.
   * `done` is called exactly once, also when input or another flight cuts the travel short.
   */
  travelForEvent(t: Targets, done: () => void): void {
    const me = this.tour;
    if (me) clearTimeout(me.timer);
    let hold: ReturnType<typeof setTimeout> | undefined;
    let fired = false;
    const finish = () => {
      if (fired) return;
      fired = true;
      clearTimeout(hold);
      if (this.evTravel === finish) this.evTravel = null;
      done();
    };
    const rest = () => {
      if (fired) return;
      hold = setTimeout(() => {
        finish();
        if (me && this.tour === me) me.timer = setTimeout(() => { if (this.tour === me) this.tourNext(); }, 7000);
      }, EVENT_HOLD_MS);
    };
    const to = this.frameTargets(t);
    // Already framed: no flight, only the hold (the tour's drift stops so the camera rests).
    if (to && this.closeTo(to)) { this.stopFlight(); rest(); }
    else this.flyTo(to, 900, "power2.inOut", rest);
    // Set after flyTo: its own stopFlight must not end this travel, only an older one.
    if (!fired) this.evTravel = finish;
  }
  recenter(): void {
    this.stopFlight();
    this.autoFit = true;
    this.fitDirty = true;
    const f = this.fitTarget();
    if (!f) return;
    this.camTo = f;
    if (this.still()) { Object.assign(this.cam, f); this.camTo = null; }
    this.syncZoom(f);
  }
  keyPan(dx: number, dy: number, kf?: number): void {
    this.stopFlight();
    const { cam, W, H } = this;
    const t = { x: cam.x + dx, y: cam.y + dy, k: cam.k };
    if (kf) {
      const k2 = clamp(cam.k * kf, 0.06, this.kMax);
      t.x = W / 2 - ((W / 2 - cam.x) / cam.k) * k2;
      t.y = H / 2 - ((H / 2 - cam.y) / cam.k) * k2;
      t.k = k2;
    }
    this.autoFit = false;
    this.camTo = null;
    Object.assign(cam, t);
    this.syncZoom(t);
  }
  private toScreen(x: number, y: number) {
    return { x: x * this.cam.k + this.cam.x, y: y * this.cam.k + this.cam.y };
  }

  /* ----- physics: everything springs toward its place ----- */
  private spring(o: { x: number; y: number; vx: number; vy: number; tx: number; ty: number }, dt: number, K: number) {
    const c = 2 * Math.sqrt(K);
    o.vx += ((o.tx - o.x) * K - o.vx * c) * dt;
    o.vy += ((o.ty - o.y) * K - o.vy * c) * dt;
    o.x += o.vx * dt;
    o.y += o.vy * dt;
  }
  private kick(cx: number, cy: number, repo: string, power: number) {
    for (const G of this.galaxies.values()) {
      const own = G.repo === repo;
      const p = own ? power : power * 0.1;
      const dxg = G.x - cx, dyg = G.y - cy, dg = Math.hypot(dxg, dyg) || 1;
      if (!own) { G.vx += (dxg / dg) * p * 0.35; G.vy += (dyg / dg) * p * 0.35; }
      const rot = G.rot.rotation, cr = Math.cos(-rot), sr = Math.sin(-rot);
      for (const s of G.stars) {
        const lx = s.ux * G.R, ly = s.uy * G.R;
        const wx = G.x + lx * Math.cos(rot) - ly * Math.sin(rot), wy = G.y + lx * Math.sin(rot) + ly * Math.cos(rot);
        const dx = wx - cx, dy = wy - cy, d = Math.hypot(dx, dy) || 1;
        const f = (p * 1.3) / (1 + d / 90);
        const ix = (dx / d) * f, iy = (dy / d) * f;
        s.vx += ix * cr - iy * sr;
        s.vy += ix * sr + iy * cr;
      }
    }
    const hit = (o: Body, r: string) => {
      const own = r === repo;
      const dx = o.x - cx, dy = o.y - cy, d = Math.hypot(dx, dy) || 1;
      if (d < 2) return;
      const f = (own ? power : power * 0.1) / (1 + d / 120);
      o.vx += (dx / d) * f;
      o.vy += (dy / d) * f;
    };
    for (const n of this.nodes.values()) hit(n, n.data.repo);
    for (const s of this.suns.values()) if (!s.hold) hit(s, s.data.repo);
  }

  /* ----- particles (pooled) ----- */
  private spark(o: { x: number; y: number; vx?: number; vy?: number; life?: number; size?: number; color?: number; drag?: number; to?: () => { x: number; y: number } }) {
    const sp = this.pool.pop() ?? new Sprite(this.tex.dot);
    sp.anchor.set(0.5);
    sp.blendMode = "add";
    sp.tint = o.color ?? this.C.ice;
    sp.alpha = 1;
    sp.visible = true;
    this.fxLayer.addChild(sp);
    this.parts.push({ sp, x: o.x, y: o.y, vx: o.vx ?? 0, vy: o.vy ?? 0, life: o.life ?? 1, t: 0, size: o.size ?? 3, drag: o.drag ?? 1.8, to: o.to ?? null, from: o.to ? { x: o.x, y: o.y } : null });
  }
  private stepParts(dt: number) {
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      if (!p) continue;
      p.t += dt;
      const q = p.t / p.life;
      if (q >= 1) {
        this.fxLayer.removeChild(p.sp);
        if (this.pool.length < 240) this.pool.push(p.sp); else p.sp.destroy();
        this.parts.splice(i, 1);
        continue;
      }
      if (p.to && p.from) {
        const e = 1 - Math.pow(1 - q, 3);
        const tx = p.to();
        p.x = lerp(p.from.x, tx.x, e);
        p.y = lerp(p.from.y, tx.y, e);
        p.sp.alpha = q < 0.8 ? 0.9 : (1 - q) * 4.5;
      } else {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        const dmp = Math.exp(-p.drag * dt);
        p.vx *= dmp;
        p.vy *= dmp;
        p.sp.alpha = 1 - q;
      }
      p.sp.position.set(p.x, p.y);
      p.sp.scale.set((p.size / 16) * (1 - q * 0.4));
    }
  }

  /* ----- filters (only while an effect plays) ----- */
  private addFilter(f: Filter) {
    if (!this.app) return;
    this.filters.add(f);
    this.scene.filterArea = this.app.screen;
    this.scene.filters = [...this.filters];
  }
  private removeFilter(f: Filter) {
    if (!this.filters.delete(f)) return;
    this.scene.filters = this.filters.size ? [...this.filters] : [];
    try { f.destroy(); } catch { /* already gone */ }
  }
  private shockwave(sx: number, sy: number, o: { amplitude: number; wavelength: number; speed: number; brightness?: number; duration: number }) {
    const f = new ShockwaveFilter({ center: { x: sx, y: sy }, amplitude: o.amplitude, wavelength: o.wavelength, speed: o.speed, brightness: o.brightness ?? 1, radius: -1 });
    f.time = 0;
    this.addFilter(f);
    this.fxBusy++;
    gsap.to(f, { time: o.duration, duration: o.duration, ease: "none", onComplete: () => { this.removeFilter(f); this.fxBusy--; } });
  }
  private warp(sx: number, sy: number, radius: number): BulgePinchFilter {
    const f = new BulgePinchFilter({ center: { x: sx / this.W, y: sy / this.H }, radius, strength: 0 });
    this.addFilter(f);
    return f;
  }

  /* ----- effects ----- */
  fx(ev: UniverseEvent, done: () => void): void {
    this.fxBusy++;
    setTimeout(() => { this.fxBusy--; }, 3200);
    try {
      switch (ev.type) {
        case "bigbang": this.fxBigBang(ev); done(); break;
        case "rift": this.fxRift(ev); done(); break;
        case "flare": this.fxFlare(ev); done(); break;
        case "adopt": this.fxAdopt(ev); done(); break;
        case "comet": this.fxComet(ev, done); break;
        case "supernova": this.fxSupernova(ev, done); break;
        case "close": this.fxClose(ev, done); break;
        case "prgone": done(); break;
      }
    } catch (e) {
      console.warn("[solaria] effect failed", ev.type, e);
      done();
    }
  }
  private flash(x: number, y: number, size: number, color: number, dur: number, peak = 1) {
    const sp = this.sprite(this.tex.glow, color, 0);
    sp.position.set(x, y);
    sp.scale.set(0.01);
    this.fxLayer.addChild(sp);
    const o = { s: 0.2, a: peak };
    const up = () => { sp.scale.set((size * o.s) / 64); sp.alpha = o.a; };
    gsap.timeline({ onComplete: () => sp.destroy() })
      .to(o, { s: 1, duration: dur * 0.35, ease: "power2.out", onUpdate: up })
      .to(o, { a: 0, s: 1.25, duration: dur * 0.65, ease: "power1.in", onUpdate: up });
  }
  private ringWave(x: number, y: number, r0: number, r1: number, color: number, dur: number, width = 2, alpha = 0.8) {
    const g = new Graphics();
    g.blendMode = "add";
    g.position.set(x, y);
    this.fxLayer.addChild(g);
    const o = { r: r0, a: alpha };
    gsap.to(o, {
      r: r1, a: 0, duration: dur, ease: "power2.out",
      onUpdate: () => { g.clear(); g.circle(0, 0, o.r).stroke({ width: width / this.cam.k, color, alpha: o.a }); },
      onComplete: () => g.destroy(),
    });
  }
  private fxBigBang(ev: Extract<UniverseEvent, { type: "bigbang" }>) {
    const C = this.C;
    const s = this.suns.get(ev.map);
    if (!s) return;
    const x = s.tx, y = s.ty;
    s.x = x; s.y = y; s.vx = s.vy = 0; s.ap = 0; s.hold = true;
    this.flash(x, y, 220, C.ice, 1.1);
    this.flash(x, y, 520, C.sky, 1.6, 0.55);
    const sc = this.toScreen(x, y);
    this.shockwave(sc.x, sc.y, { amplitude: 34, wavelength: 190, speed: 720, brightness: 1.25, duration: 1.7 });
    setTimeout(() => this.kick(x, y, s.data.repo, 900), 60);
    for (let i = 0; i < 36; i++) {
      const a = rnd() * TAU, v = 140 + rnd() * 260;
      this.spark({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.9 + rnd() * 0.8, size: 2 + rnd() * 3, color: rnd() < 0.5 ? C.sky : C.ice, drag: 2.2 });
    }
    const o = { a: 0 };
    gsap.timeline()
      .to(o, { a: 1.25, duration: 0.45, ease: "power3.out", onUpdate: () => { s.ap = o.a; } }, 0.08)
      .to(o, { a: 1, duration: 0.5, ease: "power2.inOut", onUpdate: () => { s.ap = o.a; }, onComplete: () => { s.hold = false; } });
    s.prog01 = 0;
    let i = 0;
    for (const k of ev.kids) {
      const n = this.nodes.get(k);
      if (!n?.hold) continue;
      n.x = x; n.y = y; n.vx = n.vy = 0; n.ap = 0;
      gsap.to(n, { ap: 1, duration: 0.5, delay: 0.55 + i * 0.07, ease: "power2.out", onComplete: () => { n.hold = false; } });
      i++;
    }
  }
  private fxRift(ev: Extract<UniverseEvent, { type: "rift" }>) {
    const C = this.C;
    const n = this.nodes.get(ev.issue);
    if (!n) return;
    this.targetNode(n);
    n.x = n.tx; n.y = n.ty; n.ap = 0; n.hold = true;
    const x = n.x, y = n.y, ang = n.h1 * Math.PI;
    const g = new Graphics();
    g.blendMode = "add";
    g.position.set(x, y);
    g.rotation = ang;
    this.fxLayer.addChild(g);
    const o = { len: 0, w: 0, a: 1, warp: 0 };
    const draw = () => {
      g.clear();
      const L = o.len, Wd = o.w, k = this.cam.k;
      if (L < 0.5) return;
      g.moveTo(-L, 0).quadraticCurveTo(0, -Wd, L, 0).quadraticCurveTo(0, Wd, -L, 0).fill({ color: C.deep, alpha: o.a });
      g.moveTo(-L, 0).quadraticCurveTo(0, -Wd, L, 0).quadraticCurveTo(0, Wd, -L, 0).stroke({ width: 1.4 / k, color: C.ice, alpha: o.a });
      g.moveTo(-L * 1.25, 0).lineTo(L * 1.25, 0).stroke({ width: 0.8 / k, color: C.sky, alpha: o.a * 0.6 });
    };
    const sc = this.toScreen(x, y);
    const wf = this.warp(sc.x, sc.y, Math.max(120, 200 * this.cam.k));
    this.fxBusy++;
    const k = this.cam.k;
    gsap.timeline({ onComplete: () => { g.destroy(); this.removeFilter(wf); this.fxBusy--; } })
      .to(o, { len: 30 / Math.sqrt(k), warp: 0.6, duration: 0.55, ease: "power2.out", onUpdate: () => { draw(); wf.strength = -o.warp; } })
      .to(o, { w: 10 / Math.sqrt(k), duration: 0.35, ease: "back.out(2)", onUpdate: draw })
      .add(() => {
        const s2 = this.toScreen(x, y);
        this.shockwave(s2.x, s2.y, { amplitude: 14, wavelength: 80, speed: 260, brightness: 1.15, duration: 0.9 });
        this.flash(x, y, 60, C.ice, 0.7);
        for (let i = 0; i < 12; i++) {
          const a = ang + ((rnd() < 0.5 ? -1 : 1) * Math.PI) / 2 + (rnd() - 0.5) * 1.2, v = 40 + rnd() * 70;
          this.spark({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.7 + rnd() * 0.5, size: 1.6 + rnd() * 1.6, color: C.ice });
        }
        gsap.to(n, { ap: 1, duration: 0.6, ease: "back.out(2.2)", onComplete: () => { n.hold = false; } });
      })
      .to(o, { warp: 0, duration: 0.7, ease: "power2.inOut", onUpdate: () => { wf.strength = -o.warp; } }, ">")
      .to(o, { w: 0, len: 0, a: 0, duration: 0.6, ease: "power2.in", onUpdate: draw }, "<0.15");
  }
  private fxFlare(ev: Extract<UniverseEvent, { type: "flare" }>) {
    const C = this.C;
    const n = this.nodes.get(ev.issue);
    const s = this.suns.get(ev.map);
    if (!n) return;
    this.targetNode(n);
    n.x = n.tx; n.y = n.ty; n.ap = 0; n.hold = true;
    if (s) {
      gsap.fromTo(s, { flare: 0 }, { flare: 1, duration: 0.25, ease: "power2.out", yoyo: true, repeat: 1 });
      const a0 = Math.atan2(n.ty - s.y, n.tx - s.x);
      for (let i = 0; i < 14; i++) {
        const a = a0 + (rnd() - 0.5) * 0.7, v = 90 + rnd() * 110;
        this.spark({ x: s.x + Math.cos(a) * s.r, y: s.y + Math.sin(a) * s.r, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.55 + rnd() * 0.4, size: 2 + rnd() * 2.2, color: i % 3 ? C.sky : C.ice, drag: 2.6 });
      }
    }
    setTimeout(() => {
      for (let i = 0; i < 10; i++) {
        const a = rnd() * TAU, r = 14 + rnd() * 10;
        this.spark({ x: n.x + Math.cos(a) * r, y: n.y + Math.sin(a) * r, to: () => ({ x: n.x, y: n.y }), life: 0.5 + rnd() * 0.2, size: 1.6 + rnd() * 1.4, color: C.ice });
      }
      gsap.to(n, { ap: 1, duration: 0.5, delay: 0.4, ease: "back.out(2)", onComplete: () => { n.hold = false; } });
    }, 380);
  }
  private fxAdopt(ev: Extract<UniverseEvent, { type: "adopt" }>) {
    const n = this.nodes.get(ev.issue);
    if (!n) return;
    const tr: Travel = { t: 0, fx: n.x, fy: n.y, side: n.h1 < 0.5 ? -1 : 1 };
    n.travel = tr;
    n.hist = [];
    gsap.to(tr, { t: 1, duration: 2.4, ease: "power2.inOut", onComplete: () => { n.travel = null; setTimeout(() => { n.hist = null; }, 700); } });
  }
  private trailPath(t: Trail): Path | null {
    // Issue to its Sun; or across the repo's Galaxy when it closes nothing in sight.
    const p = t.pr;
    const n = p.closes.map((k) => this.nodes.get(k)).find((x): x is Node => !!x);
    const G = this.galaxies.get(p.repo);
    if (n && n.sun) return { a: { x: n.x, y: n.y }, b: { x: n.sun.x, y: n.sun.y }, bend: (t.h < 0.5 ? -1 : 1) * 0.28, min: 90 };
    if (n && G) return { a: { x: n.x, y: n.y }, b: { x: G.x, y: G.y }, bend: (t.h < 0.5 ? -1 : 1) * 0.22, min: 70 };
    if (!G) return null;
    const ang = t.h * TAU, R = G.R * 0.62;
    return {
      a: { x: G.x + Math.cos(ang) * R, y: G.y + Math.sin(ang) * R },
      b: { x: G.x - Math.cos(ang + 0.5) * R, y: G.y - Math.sin(ang + 0.5) * R },
      bend: 0.18,
    };
  }
  private qpt(path: Path, u: number) {
    const { a, b, bend } = path;
    // The bend never drops below path.min world units, so a short hop still reads as an arc.
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const off = (Math.sign(bend || 1) * Math.max(len * Math.abs(bend), path.min ?? 0)) / len;
    const mx = (a.x + b.x) / 2 - (b.y - a.y) * off, my = (a.y + b.y) / 2 + (b.x - a.x) * off;
    const v = 1 - u;
    return { x: v * v * a.x + 2 * v * u * mx + u * u * b.x, y: v * v * a.y + 2 * v * u * my + u * u * b.y };
  }
  private fxComet(ev: Extract<UniverseEvent, { type: "comet" }>, done: () => void) {
    const C = this.C;
    const t = this.trails.get(ev.pr);
    if (!t) { done(); return; }
    t.prog = 0;
    t.alpha = 0.5;
    const head = this.sprite(this.tex.glow, C.ice);
    const core = this.sprite(this.tex.dot, C.ice);
    this.fxLayer.addChild(head, core);
    t.head = { head, core };
    gsap.to(t, {
      prog: 1, duration: 1.7, ease: "power1.inOut",
      onUpdate: () => {
        const path = this.trailPath(t);
        if (!path) return;
        const p = this.qpt(path, t.prog), k = this.cam.k;
        head.position.set(p.x, p.y);
        core.position.set(p.x, p.y);
        head.scale.set(40 / 64 / Math.sqrt(k));
        core.scale.set(7 / 16 / Math.sqrt(k));
        if (rnd() < 0.6) this.spark({ x: p.x, y: p.y, vx: (rnd() - 0.5) * 30, vy: (rnd() - 0.5) * 30, life: 0.6, size: 1.6, color: C.sky, drag: 3 });
      },
      onComplete: () => {
        const path = this.trailPath(t);
        if (path) this.flash(path.b.x, path.b.y, 50, C.sky, 0.6, 0.7);
        head.destroy();
        core.destroy();
        t.head = null;
        done();
      },
    });
  }
  private fxSupernova(ev: Extract<UniverseEvent, { type: "supernova" }>, done: () => void) {
    const C = this.C;
    const list = ev.issues.map((k) => this.nodes.get(k)).filter((n): n is Node => !!n);
    list.forEach((n, i) => {
      setTimeout(() => {
        const x = n.x, y = n.y;
        this.flash(x, y, 120, C.ice, 1, 1);
        this.flash(x, y, 260, C.sky, 1.4, 0.5);
        this.ringWave(x, y, 4, 70, C.sky, 1.3, 2);
        const sc = this.toScreen(x, y);
        this.shockwave(sc.x, sc.y, { amplitude: 16, wavelength: 80, speed: 320, brightness: 1.2, duration: 1 });
        for (let j = 0; j < 26; j++) {
          const a = rnd() * TAU, v = 60 + rnd() * 160;
          this.spark({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.7 + rnd() * 0.7, size: 1.6 + rnd() * 2.4, color: j % 3 ? C.sky : C.ice, drag: 2 });
        }
      }, i * 260);
    });
    setTimeout(done, 320 + list.length * 260);
  }
  private fxClose(ev: Extract<UniverseEvent, { type: "close" }>, done: () => void) {
    const n = this.nodes.get(ev.issue);
    if (n) this.ringWave(n.x, n.y, 5, 22, this.C.ice, 0.8, 1.2, 0.5);
    setTimeout(done, 600);
  }

  /* ----- frame ----- */
  private tick() {
    if (!this.ok) return;
    const now = performance.now();
    const dt = Math.min(0.05, this.lastNow ? (now - this.lastNow) / 1000 : 0.016);
    this.lastNow = now;
    gsap.updateRoot(now / 1000);
    const C = this.C;
    const calm = this.still();
    if (!calm) this.T += dt;
    const T = this.T;
    if (this.introA < 1) this.introA = Math.min(1, this.introA + dt / 1.2);
    this.world.alpha = this.introA;
    const K = calm ? 0 : 7;
    this.hlA += ((this.hlT ? 1 : 0) - this.hlA) * (1 - Math.exp(-dt / 0.06));
    if (this.hlA < 0.002 && !this.hlT) { this.hlA = 0; this.hl = null; }
    else if (this.hlT) this.hl = this.resolveHl(this.hlT);
    const hl = this.hl, hlA = this.hlA;
    const dimF = 1 - 0.7 * hlA;
    const isG = (G: Galaxy) => !hl || hl.gals.has(G);

    // camera
    if (this.autoFit && this.fitDirty) {
      const f = this.fitTarget();
      if (f) { this.camTo = f; this.syncZoom(f); }
      this.fitDirty = false;
    }
    const cam = this.cam;
    if (this.camTo) {
      const to = this.camTo;
      const f = calm ? 1 : 1 - Math.exp(-dt / 0.35);
      cam.x += (to.x - cam.x) * f; cam.y += (to.y - cam.y) * f; cam.k += (to.k - cam.k) * f;
      if (Math.abs(to.x - cam.x) < 0.3 && Math.abs(to.y - cam.y) < 0.3 && Math.abs(to.k - cam.k) < 0.001) { Object.assign(cam, to); this.camTo = null; }
    }
    this.world.position.set(cam.x, cam.y);
    this.world.scale.set(cam.k);
    const k = cam.k;
    const { W, H } = this;

    for (const d of this.dust) {
      const tw = W * 1.3, th = H * 1.3;
      d.sp.x = (((d.u * tw + cam.x * d.p) % tw) + tw) % tw - W * 0.15;
      d.sp.y = (((d.v * th + cam.y * d.p) % th) + th) % th - H * 0.15;
      d.sp.alpha = d.a * (calm ? 1 : 0.75 + 0.25 * Math.sin(T * d.ts + d.tw)) * (1 - 0.5 * hlA);
    }

    // Galaxies
    for (const G of this.galaxies.values()) {
      if (K) this.spring(G, dt, 3.2); else { G.x = G.tx; G.y = G.ty; }
      G.R += (G.Rt - G.R) * (calm ? 1 : 1 - Math.exp(-dt / 0.6));
      if (!calm) G.rot.rotation = G.spin + (T * TAU) / 900;
      G.rot.position.set(G.x, G.y);
      G.halo.position.set(G.x, G.y);
      G.halo.scale.set((G.R * 2.7) / 256);
      G.core.position.set(G.x, G.y);
      G.core.scale.set((G.R * 0.75) / 64);
      const gf = isG(G) ? 1 + hlA * 0.35 : dimF;
      G.halo.alpha = 0.16 * gf;
      G.core.alpha = 0.22 * gf;
      G.rot.alpha = isG(G) ? 1 : dimF;
      const gfade = this.fadeStep(G.repo, dt, calm);
      if (gfade < 1) for (const o of [G.halo, G.core, G.rot]) o.alpha *= gfade;
      for (const s of G.stars) {
        if (s.vx || s.vy || s.dx || s.dy) {
          if (calm) { s.dx = s.dy = s.vx = s.vy = 0; }
          else {
            s.vx += (-s.dx * 5 - s.vx * 4.4) * dt; s.vy += (-s.dy * 5 - s.vy * 4.4) * dt;
            s.dx += s.vx * dt; s.dy += s.vy * dt;
            if (Math.abs(s.dx) + Math.abs(s.dy) + Math.abs(s.vx) + Math.abs(s.vy) < 0.05) s.dx = s.dy = s.vx = s.vy = 0;
          }
        }
        s.sp.position.set(s.ux * G.R + s.dx, s.uy * G.R + s.dy);
      }
      for (const p of G.puffs) { p.sp.position.set(p.ux * G.R, p.uy * G.R); p.sp.scale.set(((G.R * p.s * 2) / 256) * 1.6); }
      // Gas: one reddish cloud wrapping every issue of this repo with no Map.
      const ga = G.gas;
      if (ga.base) {
        const on = !!G.cloud;
        if (G.cloud) { ga.base.position.set(G.x + G.cloud.x, G.y + G.cloud.y); ga.base.scale.set((G.cloud.r * 2.9) / 256); }
        ga.baseA += ((on ? 0.17 : 0) - ga.baseA) * Math.min(1, dt * 1.2);
        ga.base.alpha = ga.baseA * (isG(G) ? 1 + hlA * 0.6 : dimF) * gfade;
        if (!on && ga.baseA < 0.005) { ga.base.destroy(); ga.base = null; }
      }
      for (const [key, b] of ga.blobs) {
        const n = this.nodes.get(key);
        if (n) { b.x += (n.x - b.x) * Math.min(1, dt * 0.9); b.y += (n.y - b.y) * Math.min(1, dt * 0.9); }
        b.a += ((b.on ? 0.12 : 0) - b.a) * Math.min(1, dt * 0.8);
        const wob = calm ? 1 : 1 + Math.sin(T * 0.4 + b.h * TAU) * 0.08;
        b.sp.position.set(b.x + (calm ? 0 : Math.sin(T * 0.21 + b.h * 9) * 4), b.y + (calm ? 0 : Math.cos(T * 0.17 + b.h * 7) * 4));
        b.sp.scale.set((92 * wob * G.scale) / 256);
        b.sp.alpha = b.a * (isG(G) ? 1 + hlA * 0.6 : dimF) * gfade * this.vis(G, k);
        if (!b.on && b.a < 0.004) { b.sp.destroy(); ga.blobs.delete(key); }
      }
    }

    // Suns (sized for the zoom their own Galaxy is seen at: Horizon contents are shrunk)
    for (const [key, s] of this.suns) {
      const sG = this.galaxies.get(s.data.repo), gs = sG?.scale ?? 1, sunSc = sunK(k * gs) / (k * gs), sv = this.vis(sG, k);
      this.targetSun(s);
      if (K && !s.hold) this.spring(s, dt, K); else if (!s.hold) { s.x = s.tx; s.y = s.ty; }
      if (!s.hold) s.ap += (s.apTo - s.ap) * (calm ? 1 : Math.min(1, dt * 3));
      if (s.dying && s.ap < 0.02) { this.destroySun(s); this.suns.delete(key); continue; }
      const a = clamp(s.ap, 0, 1.4);
      const breathe = calm ? 1 : 1 + Math.sin(T * 0.9 + s.h1 * TAU) * 0.04;
      s.glow.position.set(s.x, s.y);
      s.glow.scale.set(((s.r * 7 * sunSc) / 64) * breathe * a * (1 + s.flare * 0.35));
      s.glow.alpha = 0.55 * Math.min(1, a);
      s.corona.position.set(s.x, s.y);
      s.corona.scale.set(((s.r * 2.6 * sunSc) / 64) * a * (1 + s.flare * 0.6));
      s.corona.alpha = 0.5 * Math.min(1, a) + s.flare * 0.4;
      s.body.position.set(s.x, s.y);
      s.body.scale.set(sunSc * a);
      s.body.alpha = Math.min(1, a);
      if (s.bodyR !== s.r) { s.bodyR = s.r; this.drawSun(s); }
      if (!s.hold) s.prog01 += (s.progTo - s.prog01) * (calm ? 1 : Math.min(1, dt * 2.2));
      if (Math.abs(s.prog01 - s.progDrawn) > 0.002) this.drawProg(s);
      s.prog.position.set(s.x, s.y);
      s.prog.scale.set(sunSc * a);
      s.prog.alpha = Math.min(1, a);
      s.orbit.position.set(s.x, s.y);
      s.orbit.alpha = Math.min(1, a);
      for (const o of [s.glow, s.corona, s.body, s.prog, s.orbit]) o.alpha *= sv;
      if (hl && !hl.suns.has(s)) for (const o of [s.glow, s.corona, s.body, s.prog, s.orbit]) o.alpha *= dimF;
      const sfade = this.fadeOf(s.data.repo);
      if (sfade < 1) for (const o of [s.glow, s.corona, s.body, s.prog, s.orbit]) o.alpha *= sfade;
    }

    // Planets and Gas
    for (const [key, n] of this.nodes) {
      const nG = this.galaxies.get(n.data.repo), sc = nodeK(k * (nG?.scale ?? 1)) / k, nv = this.vis(nG, k);
      this.targetNode(n);
      if (n.travel) {
        const tr = n.travel, u = tr.t;
        const mx = (tr.fx + n.tx) / 2 - (n.ty - tr.fy) * 0.25 * tr.side, my = (tr.fy + n.ty) / 2 + (n.tx - tr.fx) * 0.25 * tr.side;
        const v = 1 - u;
        n.x = v * v * tr.fx + 2 * v * u * mx + u * u * n.tx;
        n.y = v * v * tr.fy + 2 * v * u * my + u * u * n.ty;
        n.vx = n.vy = 0;
      } else if (K) this.spring(n, dt, K);
      else { n.x = n.tx; n.y = n.ty; }
      if (n.hist) { n.hist.push(n.x, n.y); if (n.hist.length > 60) n.hist.splice(0, 2); }
      if (!n.hold) n.ap += (n.apTo - n.ap) * (calm ? 1 : Math.min(1, dt * (n.dying ? 2 : 3)));
      if (n.dying && n.ap < 0.02) { this.destroyNode(n); this.nodes.delete(key); continue; }
      // An External Planet whose Sun is not drawn (yet) has nowhere to be.
      const a = n.data.external && !n.sun ? 0 : clamp(n.ap, 0, 1.4), al = Math.min(1, a) * nv;
      n.body.position.set(n.x, n.y);
      n.body.scale.set(sc * a);
      n.body.alpha = al;
      n.glow.position.set(n.x, n.y);
      n.glow.scale.set(n.glowS * sc * a);
      n.glow.alpha = n.glowA * al;
      if (n.ping > 0) { n.ping = Math.max(0, n.ping - dt); n.glow.alpha += n.ping * 0.5; }
      // Satellite: the issue is assigned (never on done issues).
      const sat = n.data.state !== "done" ? satelliteLabel(n.data.assignees) : null;
      n.satA += ((sat ? 1 : 0) - n.satA) * Math.min(1, dt * 1.5);
      if (n.satA > 0.01) {
        const ang = calm ? -0.8 : T * 1.7 + n.h2 * TAU;
        const rr = 11 * sc;
        n.sat.position.set(n.x + Math.cos(ang) * rr, n.y + Math.sin(ang) * rr * 0.75);
        n.sat.scale.set((3.2 * sc) / 16);
        n.sat.alpha = n.satA * al;
        n.satGlow.position.set(n.sat.x, n.sat.y);
        n.satGlow.scale.set((12 * sc) / 64);
        n.satGlow.alpha = n.satA * 0.6 * al;
      } else { n.sat.alpha = 0; n.satGlow.alpha = 0; }
      if (hl && !hl.nodes.has(n)) for (const o of [n.body, n.glow, n.sat, n.satGlow]) o.alpha *= dimF;
      else if (hl) n.glow.alpha += hlA * 0.25;
      const nfade = this.fadeOf(n.data.repo);
      if (nfade < 1) for (const o of [n.body, n.glow, n.sat, n.satGlow]) o.alpha *= nfade;
      if (sat && !n.label) {
        n.label = document.createElement("span");
        n.label.className = "lab lab-sat";
        this.o.labels.appendChild(n.label);
      }
      if (n.label) {
        if (!sat && n.satA < 0.05) { n.label.remove(); n.label = null; n.labelText = ""; }
        else if (sat) {
          const txt = sat.rest ? S.satellite.many(sat.first, sat.rest) : S.satellite.one(sat.first);
          if (n.labelText !== txt) { n.label.textContent = txt; n.labelText = txt; n.label.title = n.data.assignees.join(", "); }
        }
      }
    }
    void C;
    this.drawDyn(dt, k, dimF);
    this.drawHl(k, calm);
    this.stepParts(dt);
    this.placeLabels(k);
    // While the camera flies, bodies and cards slide under a still pointer: no hover until it lands.
    if (this.flight || this.camTo) { if (this.hover) this.setHover(null); }
    else if (this.mouse) {
      // Heading for the card across other bodies: hold the hover (within the grace) instead of switching.
      const h = this.towardTip(this.mouse.x, this.mouse.y) ? null : this.pickAt(this.mouse.x, this.mouse.y);
      if (h) { if (h !== this.hover) this.setHover(h); this.hoverOff = 0; } else this.loseHover();
    }
    if (this.hoverOff && performance.now() >= this.hoverOff) this.setHover(null);
    if (this.tipFor) this.placeTip();
    if (this.app) this.app.ticker.maxFPS = this.fxBusy > 0 || this.parts.length || this.camTo || this.filters.size || hl ? 60 : 30;
  }

  private drawDyn(dt: number, k: number, dimF: number) {
    const C = this.C, dyn = this.dyn, hl = this.hl, hlA = this.hlA;
    dyn.clear();
    // A child in another Galaxy: a long thin curve to its Sun.
    for (const n of this.nodes.values()) {
      if (n.role !== "foreign" || !n.sun) continue;
      const a = Math.min(n.ap, n.sun.ap, 1);
      if (a < 0.02) continue;
      const path: Path = { a: { x: n.x, y: n.y }, b: { x: n.sun.x, y: n.sun.y }, bend: (n.h1 < 0.5 ? -1 : 1) * 0.16 };
      const m = this.qpt(path, 0.5);
      const mx = 2 * m.x - (path.a.x + path.b.x) / 2, my = 2 * m.y - (path.a.y + path.b.y) / 2;
      const lit = !!hl && hl.nodes.has(n) && hl.suns.has(n.sun);
      const lf = !hl ? 1 : lit ? 1 + hlA * 2.2 : dimF;
      dyn.moveTo(path.a.x, path.a.y).quadraticCurveTo(mx, my, path.b.x, path.b.y)
        .stroke({ width: (0.9 + (lit ? hlA * 0.8 : 0)) / k, color: C.sky, alpha: Math.min(1, 0.24 * a * lf) });
    }
    // Adoption path, fading behind the traveller.
    for (const n of this.nodes.values()) {
      const h = n.hist;
      if (!h || h.length < 4) continue;
      const cnt = h.length / 2;
      for (let i = 1; i < cnt; i++) {
        dyn.moveTo(h[i * 2 - 2] ?? 0, h[i * 2 - 1] ?? 0).lineTo(h[i * 2] ?? 0, h[i * 2 + 1] ?? 0)
          .stroke({ width: (0.6 + (1.6 * i) / cnt) / k, color: C.ice, alpha: (0.35 * i) / cnt });
      }
      if (!n.travel) h.splice(0, 4);
    }
    // PR trails: tapered; they stay while the PR is open.
    for (const [key, t] of this.trails) {
      t.alpha += (t.aTo - t.alpha) * Math.min(1, dt * (t.dying ? 1.2 : 2));
      if (t.dying && t.alpha < 0.01) {
        if (t.head) { t.head.head.destroy(); t.head.core.destroy(); }
        gsap.killTweensOf(t);
        this.trails.delete(key);
        continue;
      }
      const path = this.trailPath(t);
      const tv = this.vis(this.galaxies.get(t.pr.repo), k);
      if (!path || t.prog <= 0.001 || tv < 0.01) continue;
      const N = 26, end = t.prog;
      const lit = !!hl && hl.trails.has(t);
      const lf = !hl ? 1 : lit ? 1 + hlA * 0.9 : dimF;
      // A draft PR's trail is dimmer than a ready one.
      const draftF = t.pr.draft ? 0.6 : 1;
      let prev = this.qpt(path, 0);
      for (let i = 1; i <= N; i++) {
        const u = (end * i) / N, p = this.qpt(path, u), q = i / N;
        const f = t.head ? q : 0.35 + 0.65 * (1 - Math.abs(q - 0.5) * 1.2);
        dyn.moveTo(prev.x, prev.y).lineTo(p.x, p.y)
          .stroke({ width: (0.6 + 2.2 * f) / Math.max(0.5, k), color: i > N - 4 && t.head ? C.ice : C.blueText, alpha: Math.min(1, t.alpha * (0.15 + 0.55 * f) * lf * draftF * tv) });
        prev = p;
      }
    }
  }

  /* ----- highlight from the log or search ----- */
  highlight(t: Targets | null): void {
    this.hlT = t && (t.issues.length || t.maps.length || t.repos.length || t.prs.length) ? t : null;
  }
  private resolveHl(t: Targets): Resolved {
    const r: Resolved = { nodes: new Set(), suns: new Set(), gals: new Set(), trails: new Set(), ringGals: new Set() };
    const fallback = new Set<string>();
    for (const k of t.issues) {
      const n = this.nodes.get(k);
      if (n && !n.dying) { r.nodes.add(n); continue; }
      fallback.add(k.slice(0, k.lastIndexOf("#")));
    }
    for (const k of t.maps) {
      const s = this.suns.get(k);
      if (s && !s.dying) r.suns.add(s); else fallback.add(k.slice(0, k.lastIndexOf("#")));
    }
    for (const k of t.prs) { const tr = this.trails.get(k); if (tr && !tr.dying) r.trails.add(tr); }
    for (const repo of [...t.repos, ...fallback]) { const G = this.galaxies.get(repo); if (G) r.gals.add(G); }
    // A Galaxy gets the ring only when nothing more precise in it is left to light.
    for (const G of r.gals) {
      const has = [...r.nodes].some((n) => n.data.repo === G.repo) || [...r.suns].some((s) => s.data.repo === G.repo) || [...r.trails].some((tr) => tr.pr.repo === G.repo);
      if (!has) r.ringGals.add(G);
    }
    return r;
  }
  private drawHl(k: number, calm: boolean) {
    const C = this.C, hl = this.hl, hlA = this.hlA, g = this.hlG;
    g.clear();
    const pts: { x: number; y: number }[] = [];
    if (hl && hlA > 0.01) {
      const pulse = calm ? 0.5 : 0.5 + 0.5 * Math.sin((performance.now() / 1000) * 3.2);
      const st = (x: number, y: number, r: number, w: number) => {
        g.circle(x, y, r).stroke({ width: w / k, color: C.ice, alpha: 0.75 * hlA });
        g.circle(x, y, r + (3 + pulse * 5) / k).stroke({ width: 1 / k, color: C.sky, alpha: (0.5 - pulse * 0.35) * hlA });
      };
      for (const n of hl.nodes) { st(n.x, n.y, (5 * nodeK(k) + 6) / k, 1.5); pts.push(n); }
      for (const s of hl.suns) { st(s.x, s.y, (s.r * sunK(k) + 12) / k, 1.5); pts.push(s); }
      for (const G of hl.ringGals) { st(G.x, G.y, G.R * 0.92, 1.5); pts.push(G); }
    }
    this.placeArrows(pts);
  }
  /** A target off screen gets a small pointer on the edge, aimed at it. */
  private placeArrows(pts: { x: number; y: number }[]) {
    const m = 28, { W, H } = this;
    let used = 0;
    for (const o of pts) {
      if (used >= 4) break;
      const p = this.toScreen(o.x, o.y);
      if (p.x >= m && p.x <= W - m && p.y >= m && p.y <= H - m) continue;
      let el = this.arrows[used];
      if (!el) {
        el = document.createElement("span");
        el.className = "hl-arrow";
        el.setAttribute("aria-hidden", "true");
        el.innerHTML = `<svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg>`;
        this.o.labels.appendChild(el);
        this.arrows[used] = el;
      }
      const ang = Math.atan2(p.y - H / 2, p.x - W / 2);
      el.style.transform = `translate(${Math.round(clamp(p.x, m, W - m))}px, ${Math.round(clamp(p.y, m, H - m))}px) rotate(${ang}rad)`;
      el.style.opacity = String(this.hlA);
      used++;
    }
    for (let i = used; i < this.arrows.length; i++) { const a = this.arrows[i]; if (a) a.style.opacity = "0"; }
  }

  /* ----- labels over the canvas ----- */
  private placeLabels(k: number) {
    const hl = this.hl, hlA = this.hlA, { W } = this;
    const ur = this.o.root.getBoundingClientRect();
    type Box = { x0: number; x1: number; y0: number; y1: number };
    const boxes: Box[] = [];
    for (const el of this.o.chrome()) {
      const he = el as HTMLElement;
      if (he.hidden || !he.offsetWidth) continue;
      const r = el.getBoundingClientRect();
      boxes.push({ x0: r.left - ur.left - 4, x1: r.right - ur.left + 4, y0: r.top - ur.top - 4, y1: r.bottom - ur.top + 4 });
    }
    const nChrome = boxes.length;
    const hits = (b: Box, list: Box[]) => list.some((o) => b.x0 < o.x1 && b.x1 > o.x0 && b.y0 < o.y1 && b.y1 > o.y0);
    for (const G of this.galaxies.values()) {
      const p = this.toScreen(G.x, G.y - G.R * 0.98);
      const lw = G.label.offsetWidth || 120;
      const x = clamp(p.x - lw / 2, 8, W - lw - 8), y = Math.max(8, p.y - 30);
      G.label.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
      const gb = { x0: x, x1: x + lw, y0: y, y1: y + 26 };
      // A Galaxy off screen keeps its label off screen too (no labels pinned to the edge).
      const away = p.x < 0 || p.x > W || p.y < -G.R * k * 2 || p.y > this.H;
      const under = away || hits(gb, boxes.slice(0, nChrome));
      G.label.style.opacity = under ? "0" : String(Math.min(1, this.introA * 1.4) * (!hl || hl.gals.has(G) ? 1 : 1 - 0.65 * hlA));
      if (!under) boxes.push(gb);
    }
    this.placeNotes(boxes);
    // Suns are obstacles too: a title never covers another Sun.
    const discs = [...this.suns.values()].filter((s) => !s.dying && s.ap > 0.3).map((s) => {
      const p = this.toScreen(s.x, s.y), r = s.r * sunK(k) + 6;
      return { s, x0: p.x - r, x1: p.x + r, y0: p.y - r, y1: p.y + r };
    });
    const order = [...this.suns.values()].sort((a, b) => b.total - a.total);
    for (const s of order) {
      const el = s.label;
      const a = Math.min(1, s.ap) * this.introA;
      const p = this.toScreen(s.x, s.y);
      const sr = s.r * sunK(k);
      const outer = s.rings.length ? (s.rings[s.rings.length - 1] ?? 0) * k : 0;
      const w = el.offsetWidth || 120, h = el.offsetHeight || 34;
      const x = p.x - w / 2, y = p.y + Math.max(sr + 12, outer + 6);
      const box = { x0: x, x1: x + w, y0: y, y1: y + h };
      const clash = hits(box, boxes) || discs.some((o) => o.s !== s && hits(box, [o]));
      const sG = this.galaxies.get(s.data.repo);
      const show = !s.dying && a > 0.3 && !clash && k * (sG?.scale ?? 1) > 0.22 && this.vis(sG, k) > 0.5;
      if (show) boxes.push(box);
      el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
      el.classList.toggle("off", !show);
      el.style.opacity = show && hl ? String(hl.suns.has(s) ? 1 : 1 - 0.65 * hlA) : "";
    }
    // Satellite labels: only where they fit, never over chrome or other labels.
    for (const n of this.nodes.values()) {
      const el = n.label;
      if (!el) continue;
      const p = this.toScreen(n.x, n.y);
      const off = 9 * nodeK(k);
      const x = p.x + off + 6, y = p.y - 7;
      const w = el.offsetWidth || 40;
      const box = { x0: x, x1: x + w, y0: y, y1: y + 14 };
      const fits = k * (this.galaxies.get(n.data.repo)?.scale ?? 1) > 0.5 && !hits(box, boxes);
      if (fits) boxes.push(box);
      el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
      el.style.opacity = fits ? String(Math.min(1, n.satA * 1.2) * (!hl || hl.nodes.has(n) ? 1 : 1 - 0.65 * hlA)) : "0";
    }
  }

  /* ----- error and empty states ----- */
  /** Per repo look, small card and quiet line, from the App (spec section 9). */
  setNotes(notes: ReadonlyMap<string, GalaxyNote>): void {
    this.notes = new Map(notes);
    if (this.ok) { this.syncNotes(); this.layout(); }
  }
  private syncNotes() {
    for (const [repo, e] of this.noteEls) {
      if (this.galaxies.has(repo)) continue;
      e.card?.remove(); e.quiet?.remove();
      this.noteEls.delete(repo);
    }
    for (const [repo, G] of this.galaxies) {
      const n = this.notes.get(repo);
      let e = this.noteEls.get(repo);
      if (!e) { e = { fade: lookFade(n), card: null, quiet: null }; this.noteEls.set(repo, e); }
      G.label.dataset.look = n?.look ?? "normal";
      const html = n?.card ? noteHtml(n.card) : "";
      if (html && !e.card) {
        e.card = document.createElement("div");
        e.card.dataset.repo = repo;
        this.o.labels.appendChild(e.card);
      }
      if (e.card && !html) { e.card.remove(); e.card = null; }
      if (e.card) {
        e.card.className = `lab lab-note${n?.look === "ghost" ? " ghost" : ""}`;
        if (e.card.innerHTML !== html) e.card.innerHTML = html;
      }
      if (n?.quiet && !e.quiet) {
        e.quiet = document.createElement("div");
        e.quiet.className = "lab lab-quiet";
        e.quiet.dataset.repo = repo;
        this.o.labels.appendChild(e.quiet);
      }
      if (e.quiet && !n?.quiet) { e.quiet.remove(); e.quiet = null; }
      if (e.quiet && n?.quiet && e.quiet.textContent !== n.quiet) e.quiet.textContent = n.quiet;
    }
  }
  private fadeOf(repo: string): number {
    return this.noteEls.get(repo)?.fade ?? 1;
  }
  private fadeStep(repo: string, dt: number, calm: boolean): number {
    const e = this.noteEls.get(repo);
    if (!e) return 1;
    const to = lookFade(this.notes.get(repo));
    e.fade += (to - e.fade) * (calm ? 1 : Math.min(1, dt * 2));
    return e.fade;
  }
  /** Ghost cards sit on their Galaxy; the rest, and the quiet line, sit just under it. */
  private placeNotes(boxes: { x0: number; x1: number; y0: number; y1: number }[]) {
    const { W, H } = this;
    const a = String(Math.min(1, this.introA * 1.4));
    for (const [repo, e] of this.noteEls) {
      const G = this.galaxies.get(repo);
      if (!G) continue;
      const ghost = this.notes.get(repo)?.look === "ghost";
      let below = this.toScreen(G.x, G.y + G.R * 0.9).y + 8;
      for (const el of [e.card, e.quiet]) {
        if (!el) continue;
        const w = el.offsetWidth || 200, h = el.offsetHeight || 40;
        const c = this.toScreen(G.x, G.y);
        const x = clamp(c.x - w / 2, 8, Math.max(8, W - w - 8));
        const y = el === e.card && ghost ? clamp(c.y - h / 2, 8, Math.max(8, H - h - 8)) : clamp(below, 8, Math.max(8, H - h - 8));
        if (!(el === e.card && ghost)) below = y + h + 6;
        el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
        el.style.opacity = a;
        boxes.push({ x0: x, x1: x + w, y0: y, y1: y + h });
      }
    }
  }

  /* ----- hover / tooltip ----- */
  private pickAt(mx: number, my: number): Node | Sun | null {
    let best: Node | Sun | null = null, bd = Infinity;
    const k = this.cam.k;
    const sr = 5 * nodeK(k);
    for (const n of this.nodes.values()) {
      if (n.dying || n.ap < 0.5 || (n.data.external && !n.sun) || this.vis(this.galaxies.get(n.data.repo), k) < 0.5) continue;
      const p = this.toScreen(n.x, n.y), d = Math.hypot(p.x - mx, p.y - my);
      if (d <= sr + 9 && d < bd) { bd = d; best = n; }
    }
    for (const s of this.suns.values()) {
      if (s.dying || s.ap < 0.5 || this.vis(this.galaxies.get(s.data.repo), k) < 0.5) continue;
      const p = this.toScreen(s.x, s.y), d = Math.hypot(p.x - mx, p.y - my);
      if (d <= s.r * sunK(k) + 8 && d < bd) { bd = d; best = s; }
    }
    return best;
  }
  private isSun(o: Node | Sun): o is Sun {
    return this.suns.get(o.key) === o;
  }
  private setHover(n: Node | Sun | null) {
    this.hover = n;
    this.hoverOff = 0;
    this.showTip();
  }
  /** The pointer left the hovered body: close its card after a short grace, unless it reaches the card. */
  private towardTip(mx: number, my: number): boolean {
    const b = this.tipBox;
    if (!b || !this.hover || this.tipFor !== this.hover) return false;
    return mx >= b.x && mx <= b.x + b.w && my >= b.gapTop && my <= b.gapBottom;
  }
  private loseHover() {
    if (this.hover && !this.hoverOff) this.hoverOff = performance.now() + HOVER_GRACE_MS;
  }
  closeTip(): void {
    this.selected = null;
    this.hover = null;
    this.hoverOff = 0;
    this.showTip();
  }
  private showTip() {
    const n = this.hover ?? this.selected;
    if (!n) {
      this.tipFor = null;
      this.tipKey = "";
      this.hit.hidden = true;
      this.o.onTip(null);
      return;
    }
    const touch = !this.hover;
    let info: TipInfo;
    if (this.isSun(n)) {
      const d = n.data;
      info = { kind: "sun", repo: d.repo, number: d.number, title: d.title, url: d.url, done: n.done, total: n.total, touch };
    } else {
      const d = n.data;
      const map = d.map ? this.suns.get(d.map) : undefined;
      info = { kind: "issue", repo: d.repo, number: d.number, title: d.title, url: d.url, state: d.state, mapTitle: map ? map.data.title : null, assignees: d.state === "done" ? [] : d.assignees, touch, external: !!d.external, outsideBlockers: d.outsideBlockers ?? [] };
    }
    const key = JSON.stringify(info);
    if (key !== this.tipKey) {
      this.tipKey = key;
      this.tipFor = n;
      this.o.onTip(info);
      this.hit.href = info.url;
      this.hit.setAttribute("aria-label", S.tip.hitAria(info.repo, info.number, info.title));
    }
    this.hit.hidden = touch;
    this.placeTip();
  }
  private placeTip() {
    const n = this.tipFor;
    if (!n) return;
    const p = this.toScreen(n.x, n.y);
    const r = this.isSun(n) ? n.r * sunK(this.cam.k) : 5 * nodeK(this.cam.k);
    const el = this.tipEl;
    if (el) {
      const tw = el.offsetWidth || 220, th = el.offsetHeight || 70;
      const x = clamp(p.x - tw / 2, 8, Math.max(8, this.W - tw - 8));
      let y = p.y - r - 14 - th;
      const above = y >= 8;
      if (!above) y = p.y + r + 14;
      this.tipBox = { x, y, w: tw, h: th, gapTop: above ? y + th : p.y + r, gapBottom: above ? p.y - r : y };
      el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
    }
    if (!this.hit.hidden) {
      const d = Math.max(28, r * 2 + 12);
      this.hit.style.width = this.hit.style.height = d + "px";
      this.hit.style.transform = `translate(${p.x - d / 2}px, ${p.y - d / 2}px)`;
    }
  }

  searchables(): Searchable[] {
    const out: Searchable[] = [];
    for (const s of this.suns.values()) if (!s.dying && s.ap > 0.3) out.push({ key: s.key, kind: "map", repo: s.data.repo, number: s.data.number, title: s.data.title, state: "map" });
    for (const n of this.nodes.values()) if (!n.dying && n.ap > 0.3) out.push({ key: n.key, kind: "issue", repo: n.data.repo, number: n.data.number, title: n.data.title, state: n.data.state });
    return out;
  }

  /* ----- input: d3-zoom for pan / pinch / wheel ----- */
  private bindInput() {
    const root = this.o.root;
    const blocked = (t: EventTarget | null) => t instanceof Element && !!t.closest("[data-chrome], .lab, .hit, .tip, button, a");
    const inTip = (t: EventTarget | null) => t instanceof Node && !!this.tipEl?.contains(t);
    const inChrome = (t: EventTarget | null) => t instanceof Element && !!t.closest("[data-chrome]");
    // Pinch on a trackpad arrives as ctrl+wheel. d3-zoom skips preventDefault when its filter says no
    // or the zoom is already at a limit, and then the browser zooms the whole page and blurs the text.
    const noPageZoom = (e: WheelEvent) => { if (e.ctrlKey) e.preventDefault(); };
    // Safari sends its own gesture events for a trackpad pinch.
    const noGesture = (e: Event) => e.preventDefault();
    window.addEventListener("wheel", noPageZoom, { passive: false });
    for (const t of ["gesturestart", "gesturechange", "gestureend"]) document.addEventListener(t, noGesture, { passive: false });
    const zoom = d3zoom<HTMLElement, unknown>()
      .scaleExtent([0.06, this.kMax])
      .clickDistance(5)
      // Wheel over labels still zooms the canvas; only the UI panels keep it (they scroll).
      .filter((ev: MouseEvent & WheelEvent) => (ev.type === "wheel" ? !inChrome(ev.target) : !blocked(ev.target)) && (!ev.ctrlKey || ev.type === "wheel") && !ev.button)
      .on("zoom", (ev: { sourceEvent: unknown; transform: { x: number; y: number; k: number } }) => {
        if (!ev.sourceEvent) return;
        this.stopFlight();
        this.autoFit = false;
        this.camTo = null;
        this.cam.x = ev.transform.x;
        this.cam.y = ev.transform.y;
        this.cam.k = ev.transform.k;
        if (this.selected) { this.selected = null; this.showTip(); }
      });
    this.zoom = zoom;
    this.zsel = select(root);
    this.zsel.call(zoom).on("dblclick.zoom", null);
    const local = (e: PointerEvent) => { const r = root.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      // On the card itself: keep it open so its link can be clicked.
      if (inTip(e.target)) { this.mouse = null; this.hoverOff = 0; return; }
      if (blocked(e.target) && e.target !== this.hit) { this.mouse = null; this.loseHover(); return; }
      this.mouse = local(e);
    };
    const onLeave = () => { this.mouse = null; if (this.hover) this.setHover(null); };
    let down: { x: number; y: number } | null = null;
    const onDown = (e: PointerEvent) => { down = local(e); };
    const onUp = (e: PointerEvent) => {
      if (e.pointerType === "mouse" || blocked(e.target)) return;
      const p = local(e);
      if (!down || Math.hypot(p.x - down.x, p.y - down.y) > 8) return;
      const n = this.pickAt(p.x, p.y);
      if (n || this.selected) { this.selected = n; this.hover = null; this.showTip(); }
    };
    root.addEventListener("pointermove", onMove);
    root.addEventListener("pointerleave", onLeave);
    root.addEventListener("pointerdown", onDown, true);
    root.addEventListener("pointerup", onUp);
    this.cleanup.push(() => {
      root.removeEventListener("pointermove", onMove);
      root.removeEventListener("pointerleave", onLeave);
      root.removeEventListener("pointerdown", onDown, true);
      root.removeEventListener("pointerup", onUp);
      window.removeEventListener("wheel", noPageZoom);
      for (const t of ["gesturestart", "gesturechange", "gestureend"]) document.removeEventListener(t, noGesture);
      this.zsel?.on(".zoom", null);
    });
  }
}

/** On-screen size grows with zoom, but never shrinks as fast, so shapes stay readable. */
const nodeK = (k: number) => clamp(0.6 + k * 0.5, 0.62, 1.6);
const sunK = (k: number) => clamp(0.35 + k * 0.6, 0.45, 1.5);

function radialTex(size: number, stops: [number, number][]): Texture {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d");
  if (g) {
    const gr = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    for (const [o, a] of stops) gr.addColorStop(o, `rgba(255,255,255,${a})`);
    g.fillStyle = gr;
    g.fillRect(0, 0, size, size);
  }
  return Texture.from(c);
}

/** How much of a Galaxy stays drawn: dim keeps the last good data readable; ghost is a faint outline. */
function lookFade(n: GalaxyNote | undefined): number {
  return n?.look === "ghost" ? 0.2 : n?.look === "dim" ? 0.42 : 1;
}

function noteHtml(c: NonNullable<GalaxyNote["card"]>): string {
  return `<b>${esc(c.title)}</b>`
    + (c.text ? `<p>${esc(c.text)}</p>` : "")
    + (c.snippet ? `<pre class="snippet"><code>${esc(c.snippet)}</code></pre>` : "")
    + (c.age ? `<p class="age">${esc(c.age)}</p>` : "");
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);
}
