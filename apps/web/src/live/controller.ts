import {
  diff, emptyMasks, emptyUniverse, holdFor, makeDemoUniverse, demoEvent, release, settle, viewOf, repoOf, seeded,
} from "@solaria/universe";
import type { DemoEventKind, IssueKey, Masks, PrKey, Universe, UniverseEvent, View } from "@solaria/universe";
import type { LiveSnapshot, RepoStatus, UniverseStatus } from "@solaria/contract";

/** One event plays every 1.5 s (spec section 7). */
export const QUEUE_GAP = 1500;
/** The Activity log shows the last 5 rows from the last 2 hours. */
export const LOG_WINDOW = 2 * 60 * 60 * 1000;
const LOG_MAX = 5;
/**
 * Browser gap rule (spec section 6): when the data was last checked more than 10 minutes before a new
 * snapshot (laptop asleep), redraw quietly like a first load and only list the changes in the log.
 */
export const GAP_MS = 10 * 60 * 1000;

/** What an event touched: lit when its log row is hovered, framed when the camera travels to it. */
export interface Targets {
  issues: IssueKey[];
  maps: IssueKey[];
  repos: string[];
  prs: PrKey[];
}

export interface LogEntry {
  id: string;
  ev: UniverseEvent;
  at: number;
  /** Plays the "in" animation once. */
  fresh: boolean;
  targets: Targets;
}

/** What the Scene must do for the controller. The Scene owns PixiJS; the controller never touches it. */
export interface SceneApi {
  ready(): boolean;
  refresh(view: View, opts: { first: boolean; ev?: UniverseEvent }): void;
  /** Play the animation; call `done` when it has landed so held state can be dropped. */
  fx(ev: UniverseEvent, done: () => void): void;
  touring(): boolean;
  needsTravel(t: Targets): boolean;
  travelForEvent(t: Targets, done: () => void): void;
}

export type Mode = "loading" | "demo" | "live";

export interface ControllerState {
  mode: Mode;
  /** Live mode: the whole Universe's health and each repo's. */
  status: UniverseStatus;
  repos: RepoStatus[];
  log: LogEntry[];
  /** When the data was last checked (for "updated N ago"). */
  checkedAt: number;
}

/**
 * The browser's single source of truth: the latest Universe, the event queue, the masks that hold
 * new data back until its event plays, and the Activity log. React reads it with useSyncExternalStore.
 */
export class Controller {
  private latest: Universe = emptyUniverse();
  private masks: Masks = emptyMasks();
  private queue: UniverseEvent[] = [];
  private nextAt = 0;
  private holding = false;
  /** The event whose camera travel is under way: shifted off the queue but not yet played. */
  private travelling: UniverseEvent | null = null;
  private first = true;
  private scene: SceneApi | null = null;
  private listeners = new Set<() => void>();
  private state: ControllerState = { mode: "loading", status: { state: "loading" }, repos: [], log: [], checkedAt: 0 };
  private rng = seeded(Date.now() >>> 0);
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly reducedMotion: () => boolean;

  constructor(opts: { reducedMotion: () => boolean }) {
    this.reducedMotion = opts.reducedMotion;
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => this.pump(performance.now()), 100);
  }
  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  getState = (): ControllerState => this.state;
  private set(patch: Partial<ControllerState>) {
    this.state = { ...this.state, ...patch };
    for (const fn of this.listeners) fn();
  }

  attachScene(scene: SceneApi | null): void {
    this.scene = scene;
    if (scene && !this.first) scene.refresh(this.view(), { first: true });
  }

  view(): View {
    return viewOf(this.latest, this.masks);
  }
  universe(): Universe {
    return this.latest;
  }

  /** Demo mode: the browser builds the demo Universe itself (no server data, no token). */
  startDemo(now = Date.now()): void {
    this.set({ mode: "demo", status: { state: "ok" } });
    this.ingest(makeDemoUniverse(now));
  }

  /** A live snapshot from the server: its health, then its Universe. */
  live(snap: LiveSnapshot): void {
    // The first snapshot with data draws quietly, like a first load: no storm of Rifts.
    const last = this.state.checkedAt;
    if (last === 0 && snap.checkedAt > 0) this.first = true;
    const quiet = last > 0 && snap.checkedAt - last > GAP_MS;
    this.set({ mode: "live", status: snap.status, repos: snap.repos });
    // A rejected token draws no Galaxies: only the card in empty space.
    const rejected = snap.status.state === "error" && snap.status.code === "bad_token";
    this.ingest(rejected ? { ...snap.universe, repos: [] } : snap.universe, { quiet });
    this.set({ checkedAt: snap.checkedAt });
  }

  /** Nothing changed on the server's last poll. */
  fresh(checkedAt: number): void {
    this.set({ checkedAt });
  }

  /**
   * A new snapshot. The first one draws quietly; later ones are diffed and played as events.
   * `quiet` (after a long gap) shows everything at once and only logs what changed.
   */
  ingest(next: Universe, opts: { quiet?: boolean } = {}): void {
    if (this.first) {
      this.first = false;
      this.latest = next;
      this.set({ checkedAt: next.at });
      this.scene?.refresh(this.view(), { first: true });
      return;
    }
    const prev = this.latest;
    const evs = diff(prev, next, next.at);
    if (opts.quiet) {
      // Events not played yet are listed too; nothing is animated or held back.
      const missed = [...(this.travelling ? [this.travelling] : []), ...this.queue, ...evs];
      this.queue = [];
      this.travelling = null;
      this.masks = emptyMasks();
      this.latest = next;
      this.set({ checkedAt: next.at });
      this.scene?.refresh(this.view(), { first: true });
      this.pushLog(missed, false);
      return;
    }
    holdFor(prev, next, evs, this.masks);
    this.latest = next;
    this.queue.push(...evs);
    this.set({ checkedAt: next.at });
    this.scene?.refresh(this.view(), { first: false });
  }

  /** A demo-panel button. When there is nothing to act on, it plays the needed event first. */
  demo(kind: DemoEventKind): void {
    const r = demoEvent(this.latest, kind, { rng: this.rng, now: Date.now(), live: this.state.mode === "live" });
    if (r.kind === "ok") {
      this.ingest(r.next);
      return;
    }
    this.demo(r.first);
    if (r.first === "comet") setTimeout(() => this.demo(kind), 3600);
  }

  pending(): number {
    return this.queue.length;
  }

  pump(now: number): void {
    if (this.holding || !this.queue.length || now < this.nextAt) return;
    const ev = this.queue.shift();
    if (!ev) return;
    this.nextAt = now + QUEUE_GAP;
    const t = this.targetsOf(ev);
    // On the Auto tour, the camera first travels to an event that is off screen or too small.
    if (this.scene?.touring() && this.scene.needsTravel(t)) {
      this.holding = true;
      this.travelling = ev;
      this.scene.travelForEvent(t, () => {
        this.holding = false;
        // A gap redraw while travelling already showed and logged this event.
        if (this.travelling !== ev) return;
        this.travelling = null;
        this.nextAt = performance.now() + QUEUE_GAP;
        this.play(ev);
      });
      return;
    }
    this.play(ev);
  }

  private play(ev: UniverseEvent): void {
    release(ev, this.masks);
    const scene = this.scene;
    const animate = !!scene && scene.ready() && !this.reducedMotion();
    scene?.refresh(this.view(), { first: false, ev: animate ? ev : undefined });
    const done = () => {
      settle(ev, this.masks);
      this.scene?.refresh(this.view(), { first: false });
    };
    if (animate && scene) scene.fx(ev, done);
    else done();
    this.pushLog([ev], true);
  }

  private pushLog(evs: UniverseEvent[], fresh: boolean): void {
    if (!evs.length) return;
    const now = Date.now();
    const rows = evs.map((ev): LogEntry => ({ id: Math.random().toString(36).slice(2), ev, at: Math.min(now, ev.at || now), fresh, targets: this.targetsOf(ev) }));
    // Stable sort: events from one snapshot keep their play order.
    const log = [...this.state.log, ...rows].sort((a, b) => a.at - b.at).slice(-LOG_MAX);
    this.set({ log });
  }

  /** Drop rows older than the log window, keeping at least the newest. */
  pruneLog(now = Date.now()): void {
    const log = this.state.log;
    const keep = log.filter((e, i) => now - e.at < LOG_WINDOW || i === log.length - 1);
    if (keep.length !== log.length) this.set({ log: keep });
  }

  markLogSeen(id: string): void {
    const e = this.state.log.find((x) => x.id === id);
    if (e) e.fresh = false;
  }

  targetsOf(ev: UniverseEvent): Targets {
    const t: Targets = { issues: [], maps: [], repos: [ev.repo], prs: [] };
    switch (ev.type) {
      case "bigbang": t.maps.push(ev.map); t.issues.push(...ev.kids); break;
      case "rift": case "close": t.issues.push(ev.issue); break;
      case "flare": case "adopt": t.issues.push(ev.issue); t.maps.push(ev.map); break;
      case "comet": t.prs.push(ev.pr); t.issues.push(...ev.closes); break;
      case "supernova": t.prs.push(ev.pr); t.issues.push(...ev.issues); break;
      case "prgone": t.prs.push(ev.pr); break;
    }
    const v = this.view();
    for (const k of t.issues) {
      const i = v.issues.get(k) ?? this.latest.issues[k];
      if (i?.map) t.maps.push(i.map);
      t.repos.push(i ? i.repo : repoOf(k));
    }
    return { issues: [...new Set(t.issues)], maps: [...new Set(t.maps)], repos: [...new Set(t.repos)], prs: [...new Set(t.prs)] };
  }
}
