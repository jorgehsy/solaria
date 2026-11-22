import type { UniverseEvent } from "./diff.ts";
import type { Issue, IssueKey, IssueState, MapIssue, PrKey, PullRequest, Universe } from "./model.ts";
import { issueStates } from "./state.ts";

export interface IssueView extends Issue {
  state: IssueState;
  /** Gone from the data but kept on screen until its event has played. */
  ghost: boolean;
}

/** What the Scene draws: the latest Universe, minus what is still waiting for its event. */
export interface View {
  repos: string[];
  maps: Map<IssueKey, MapIssue>;
  issues: Map<IssueKey, IssueView>;
  prs: Map<PrKey, PullRequest>;
}

/**
 * Data that arrived but whose event has not played yet. A new Map stays hidden until its Big Bang,
 * an adopted issue stays in its old place until its Adopt, a closed issue stays drawn until its Close.
 */
export interface Masks {
  hiddenIssues: Set<IssueKey>;
  hiddenMaps: Set<IssueKey>;
  hiddenPrs: Set<PrKey>;
  heldMap: Map<IssueKey, IssueKey | null>;
  heldState: Map<IssueKey, IssueState>;
  ghostIssues: Map<IssueKey, IssueView>;
  ghostPrs: Map<PrKey, PullRequest>;
}

export const emptyMasks = (): Masks => ({
  hiddenIssues: new Set(), hiddenMaps: new Set(), hiddenPrs: new Set(),
  heldMap: new Map(), heldState: new Map(), ghostIssues: new Map(), ghostPrs: new Map(),
});

export function viewOf(u: Universe, masks: Masks): View {
  const states = issueStates(u);
  const issues = new Map<IssueKey, IssueView>();
  for (const i of Object.values(u.issues)) {
    if (masks.hiddenIssues.has(i.key)) continue;
    issues.set(i.key, {
      ...i,
      map: masks.heldMap.has(i.key) ? (masks.heldMap.get(i.key) ?? null) : i.map,
      state: masks.heldState.get(i.key) ?? states.get(i.key) ?? "todo",
      ghost: false,
    });
  }
  for (const [k, g] of masks.ghostIssues) if (!issues.has(k)) issues.set(k, { ...g, ghost: true, state: masks.heldState.get(k) ?? g.state });
  const maps = new Map<IssueKey, MapIssue>();
  for (const m of Object.values(u.maps)) if (!masks.hiddenMaps.has(m.key)) maps.set(m.key, m);
  for (const i of issues.values()) if (i.map && !maps.has(i.map)) i.map = null;
  const prs = new Map<PrKey, PullRequest>();
  for (const p of Object.values(u.prs)) if (!masks.hiddenPrs.has(p.key)) prs.set(p.key, p);
  for (const [k, p] of masks.ghostPrs) if (!prs.has(k)) prs.set(k, p);
  return { repos: u.repos.slice(), maps, issues, prs };
}

/** Before events play: hide or hold what each event will reveal. */
export function holdFor(a: Universe, b: Universe, events: readonly UniverseEvent[], masks: Masks): void {
  const sa = issueStates(a);
  const sb = issueStates(b);
  for (const ev of events) {
    switch (ev.type) {
      case "bigbang":
        masks.hiddenMaps.add(ev.map);
        for (const k of ev.kids) {
          const o = a.issues[k];
          if (o) masks.heldMap.set(k, o.map);
          else masks.hiddenIssues.add(k);
        }
        break;
      case "rift":
      case "flare":
        masks.hiddenIssues.add(ev.issue);
        break;
      case "adopt":
        masks.heldMap.set(ev.issue, ev.from);
        break;
      case "comet":
        masks.hiddenPrs.add(ev.pr);
        for (const k of ev.closes) {
          const o = sa.get(k);
          if (o && o !== sb.get(k) && !masks.heldState.has(k)) masks.heldState.set(k, o);
        }
        break;
      case "close":
        holdClosed(a, b, ev.issue, sa.get(ev.issue), masks);
        break;
      case "supernova":
        for (const k of ev.issues) holdClosed(a, b, k, sa.get(k), masks);
        ghostPr(a, ev.pr, masks);
        break;
      case "prgone":
        ghostPr(a, ev.pr, masks);
        break;
    }
  }
}
function holdClosed(a: Universe, b: Universe, k: IssueKey, was: IssueState | undefined, masks: Masks) {
  const o = a.issues[k];
  if (!o || o.closed) return;
  if (was && !masks.heldState.has(k)) masks.heldState.set(k, was);
  if (!b.issues[k]) masks.ghostIssues.set(k, { ...o, state: was ?? "todo", ghost: true });
}
function ghostPr(a: Universe, k: PrKey, masks: Masks) {
  const p = a.prs[k];
  if (p) masks.ghostPrs.set(k, p);
}

/** When an event starts playing: show what it brings. */
export function release(ev: UniverseEvent, masks: Masks): void {
  switch (ev.type) {
    case "bigbang":
      masks.hiddenMaps.delete(ev.map);
      for (const k of ev.kids) { masks.hiddenIssues.delete(k); masks.heldMap.delete(k); }
      break;
    case "rift":
    case "flare":
      masks.hiddenIssues.delete(ev.issue);
      break;
    case "adopt":
      masks.heldMap.delete(ev.issue);
      break;
    case "comet":
      masks.hiddenPrs.delete(ev.pr);
      break;
    default:
      break;
  }
}

/** When an event's animation has landed (or right away with reduced motion): drop what it was holding. */
export function settle(ev: UniverseEvent, masks: Masks): void {
  switch (ev.type) {
    case "comet":
      for (const k of ev.closes) masks.heldState.delete(k);
      break;
    case "close":
      masks.heldState.delete(ev.issue);
      masks.ghostIssues.delete(ev.issue);
      break;
    case "supernova":
      for (const k of ev.issues) { masks.heldState.delete(k); masks.ghostIssues.delete(k); }
      masks.ghostPrs.delete(ev.pr);
      break;
    case "prgone":
      masks.ghostPrs.delete(ev.pr);
      break;
    default:
      break;
  }
}
