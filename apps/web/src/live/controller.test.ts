import { describe, expect, it } from "vitest";
import { emptyUniverse, issueKey } from "@solaria/universe";
import type { Issue, Universe, UniverseEvent, View } from "@solaria/universe";
import type { LiveSnapshot } from "@solaria/contract";
import { Controller, GAP_MS, QUEUE_GAP } from "./controller.ts";
import type { SceneApi, Targets } from "./controller.ts";

const REPO = "acme/web";
const MIN = 60_000;
const T0 = 1_700_000_000_000;

function issue(n: number, o: Partial<Issue> = {}): Issue {
  return {
    key: issueKey(REPO, n), repo: REPO, number: n, title: `Issue ${n}`, url: `https://github.com/${REPO}/issues/${n}`,
    map: null, blockers: [], assignees: [], closed: false, created: T0, closedAt: 0, ...o,
  };
}

function uni(at: number, numbers: number[]): Universe {
  const u = { ...emptyUniverse([REPO]), at };
  for (const n of numbers) u.issues[issueKey(REPO, n)] = issue(n);
  return u;
}

function snap(checkedAt: number, numbers: number[]): LiveSnapshot {
  return {
    mode: "live", checkedAt, pollMs: 60_000, status: { state: "ok" }, repos: [{ repo: REPO, ok: true, stale: false }],
    universe: uni(checkedAt, numbers),
  } as LiveSnapshot;
}

/** A Scene stand-in that records what the controller asked of it. */
class FakeScene implements SceneApi {
  refreshes: { view: View; first: boolean; ev?: UniverseEvent }[] = [];
  played: UniverseEvent[] = [];
  tour = false;
  pendingTravel: (() => void) | null = null;
  ready() { return true; }
  refresh(view: View, opts: { first: boolean; ev?: UniverseEvent }) { this.refreshes.push({ view, ...opts }); }
  fx(ev: UniverseEvent, done: () => void) { this.played.push(ev); done(); }
  touring() { return this.tour; }
  travelForEvent(_t: Targets, done: () => void) { this.pendingTravel = done; }
}

function setup() {
  const c = new Controller({ reducedMotion: () => false });
  const scene = new FakeScene();
  c.attachScene(scene);
  return { c, scene };
}

const drain = (c: Controller) => {
  for (let t = 0; c.pending() > 0; t += QUEUE_GAP) c.pump(1e12 + t);
};
const tags = (c: Controller) => c.getState().log.map((e) => e.ev.type);

describe("Controller: live snapshots", () => {
  it("draws the first snapshot quietly, with no events", () => {
    const { c, scene } = setup();
    c.live(snap(T0, [1, 2]));
    expect(c.pending()).toBe(0);
    expect(scene.refreshes.at(-1)?.first).toBe(true);
    expect(c.getState().log).toEqual([]);
  });

  it("animates a change under 10 minutes: one event per 1.5 s, each with an Activity row", () => {
    const { c, scene } = setup();
    c.live(snap(T0, [1, 2]));
    c.live(snap(T0 + MIN, [2, 3, 4]));
    expect(c.pending()).toBe(3);
    // New issues stay hidden until their event plays.
    expect(c.view().issues.has(issueKey(REPO, 3))).toBe(false);

    c.pump(1e12);
    expect(scene.played.map((e) => e.type)).toEqual(["rift"]);
    c.pump(1e12 + QUEUE_GAP - 1);
    expect(scene.played).toHaveLength(1);
    c.pump(1e12 + QUEUE_GAP);
    expect(scene.played).toHaveLength(2);
    drain(c);
    expect(scene.played.map((e) => e.type)).toEqual(["rift", "rift", "close"]);
    expect(tags(c)).toEqual(["rift", "rift", "close"]);
    expect(c.getState().log.every((e) => e.fresh)).toBe(true);
  });

  it("redraws quietly after a gap over 10 minutes and lists the changes in the Activity log", () => {
    const { c, scene } = setup();
    c.live(snap(T0, [1, 2]));
    scene.refreshes = [];
    c.live(snap(T0 + GAP_MS + 1, [2, 3]));

    expect(c.pending()).toBe(0);
    expect(scene.played).toEqual([]);
    expect(scene.refreshes).toHaveLength(1);
    expect(scene.refreshes[0]?.first).toBe(true);
    expect(scene.refreshes[0]?.ev).toBeUndefined();
    // Everything is shown at once: nothing held back for an animation.
    const v = c.view();
    expect([...v.issues.keys()].sort()).toEqual([issueKey(REPO, 2), issueKey(REPO, 3)]);
    expect(tags(c).sort()).toEqual(["close", "rift"]);
    // Quiet rows do not play the "in" animation.
    expect(c.getState().log.every((e) => !e.fresh)).toBe(true);
  });

  it("measures the gap from the last time the data was checked, including still-fresh notes", () => {
    const { c, scene } = setup();
    c.live(snap(T0, [1]));
    c.fresh(T0 + 6 * MIN, 60_000);
    c.fresh(T0 + 12 * MIN, 60_000);
    c.live(snap(T0 + 13 * MIN, [1, 2]));
    expect(c.pending()).toBe(1);
    c.pump(1e12);
    expect(scene.played.map((e) => e.type)).toEqual(["rift"]);
  });

  it("animates at exactly 10 minutes", () => {
    const { c } = setup();
    c.live(snap(T0, [1]));
    c.live(snap(T0 + GAP_MS, [1, 2]));
    expect(c.pending()).toBe(1);
  });

  it("logs events still waiting in the queue when a gap redraws, without playing them", () => {
    const { c, scene } = setup();
    c.live(snap(T0, [1]));
    c.live(snap(T0 + MIN, [1, 2, 3]));
    c.pump(1e12); // plays #2, #3 still queued
    c.live(snap(T0 + MIN + GAP_MS + 1, [1, 2, 3, 4]));
    expect(c.pending()).toBe(0);
    expect(scene.played).toHaveLength(1);
    expect(c.getState().log.map((e) => e.ev.type === "rift" && e.ev.issue)).toEqual([
      issueKey(REPO, 2), issueKey(REPO, 3), issueKey(REPO, 4),
    ]);
    expect(c.view().issues.size).toBe(4);
  });

  it("drops an event whose camera travel was cut short by a gap redraw, logging it once", () => {
    const { c, scene } = setup();
    scene.tour = true;
    c.live(snap(T0, [1]));
    c.live(snap(T0 + MIN, [1, 2]));
    c.pump(1e12); // starts travelling to #2
    expect(scene.pendingTravel).not.toBeNull();
    c.live(snap(T0 + MIN + GAP_MS + 1, [1, 2, 3]));
    scene.pendingTravel?.();
    expect(scene.played).toEqual([]);
    expect(tags(c)).toEqual(["rift", "rift"]);
    // The queue moves on after the dropped travel.
    c.live(snap(T0 + 2 * MIN + GAP_MS, [1, 2, 3, 4]));
    expect(c.pending()).toBe(1);
  });

  it("starts quietly again when the first snapshot with data follows a loading one", () => {
    const { c } = setup();
    c.live(snap(0, []));
    c.live(snap(T0, [1, 2]));
    expect(c.pending()).toBe(0);
    expect(c.getState().log).toEqual([]);
  });
});
