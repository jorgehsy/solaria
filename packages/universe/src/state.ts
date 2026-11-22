import type { IssueKey, IssueState, Universe } from "./model.ts";

/**
 * Each issue's state, first match wins (spec section 5):
 * Done (closed), In review (ready PR), Blocked (an open blocker), Draft PR open, To do.
 * Assigning never changes state.
 */
export function issueStates(u: Universe): Map<IssueKey, IssueState> {
  const open = new Set<IssueKey>();
  for (const i of Object.values(u.issues)) if (!i.closed) open.add(i.key);
  for (const m of Object.values(u.maps)) open.add(m.key);
  const ready = new Set<IssueKey>();
  const draft = new Set<IssueKey>();
  for (const p of Object.values(u.prs)) for (const k of p.closes) (p.draft ? draft : ready).add(k);
  const out = new Map<IssueKey, IssueState>();
  for (const i of Object.values(u.issues)) {
    let s: IssueState = "todo";
    if (i.closed) s = "done";
    else if (ready.has(i.key)) s = "review";
    else if (i.blockers.some((b) => b !== i.key && open.has(b))) s = "blocked";
    else if (draft.has(i.key)) s = "doing";
    out.set(i.key, s);
  }
  return out;
}

/** Satellite label: first assignee plus a count of the rest (`alice +2`). */
export function satelliteLabel(assignees: readonly string[]): { first: string; rest: number } | null {
  const first = assignees[0];
  return first ? { first, rest: assignees.length - 1 } : null;
}
