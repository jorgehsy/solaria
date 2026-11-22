import type { IssueKey, PrKey, Universe } from "./model.ts";

interface Base {
  repo: string;
  /** When it happened (epoch ms). */
  at: number;
  /** The GitHub page for the log row's "Open on GitHub". */
  url: string;
}

/** One change between two snapshots. Typed, with no user-facing text: the UI writes that from the copy deck. */
export type UniverseEvent =
  | (Base & { type: "bigbang"; map: IssueKey; mapTitle: string; kids: IssueKey[] })
  | (Base & { type: "rift"; issue: IssueKey })
  | (Base & { type: "flare"; issue: IssueKey; map: IssueKey; mapTitle: string })
  | (Base & { type: "adopt"; issue: IssueKey; map: IssueKey; mapTitle: string; from: IssueKey | null })
  | (Base & { type: "comet"; pr: PrKey; closes: IssueKey[] })
  | (Base & { type: "close"; issue: IssueKey })
  | (Base & { type: "supernova"; pr: PrKey; issues: IssueKey[] })
  /** A pull request that left without closing anything. `merged` PRs are still shown as Supernova. */
  | (Base & { type: "prgone"; pr: PrKey; merged: boolean });

export type EventType = UniverseEvent["type"];

/**
 * What changed from `a` to `b`, in play order: new Maps, new and adopted issues, new PRs,
 * closed issues, then PRs that left. Pure: it reads both snapshots and nothing else.
 */
export function diff(a: Universe, b: Universe, now: number = b.at || Date.now()): UniverseEvent[] {
  const evs: UniverseEvent[] = [];
  const newMaps = new Set<IssueKey>();

  for (const m of Object.values(b.maps)) {
    if (a.maps[m.key]) continue;
    newMaps.add(m.key);
    const kids = Object.values(b.issues)
      .filter((i) => i.map === m.key)
      .sort((x, y) => x.number - y.number)
      .map((i) => i.key);
    evs.push({ type: "bigbang", repo: m.repo, at: m.created || now, url: m.url, map: m.key, mapTitle: m.title, kids });
  }

  const closing = new Map<IssueKey, { repo: string; url: string }>();
  for (const i of Object.values(b.issues)) {
    const o = a.issues[i.key];
    if (!o) {
      if (i.closed) continue;
      if (i.map && newMaps.has(i.map)) continue;
      const map = i.map ? b.maps[i.map] : undefined;
      if (map) evs.push({ type: "flare", repo: i.repo, at: i.created || now, url: i.url, issue: i.key, map: map.key, mapTitle: map.title });
      else evs.push({ type: "rift", repo: i.repo, at: i.created || now, url: i.url, issue: i.key });
      continue;
    }
    if (i.map && i.map !== o.map && !newMaps.has(i.map)) {
      const map = b.maps[i.map];
      if (map) evs.push({ type: "adopt", repo: i.repo, at: now, url: i.url, issue: i.key, map: map.key, mapTitle: map.title, from: o.map });
    }
    if (!o.closed && i.closed) closing.set(i.key, o);
  }
  // An open issue that vanishes between snapshots is closed too.
  for (const o of Object.values(a.issues)) if (!o.closed && !b.issues[o.key]) closing.set(o.key, o);

  for (const p of Object.values(b.prs)) {
    if (a.prs[p.key]) continue;
    evs.push({ type: "comet", repo: p.repo, at: p.created || now, url: p.url, pr: p.key, closes: p.closes.slice() });
  }

  const gone: UniverseEvent[] = [];
  const merged = new Set<IssueKey>();
  for (const p of Object.values(a.prs)) {
    if (b.prs[p.key]) continue;
    const c = b.closedPrs[p.key];
    const at = c?.at || now;
    const closes = c?.closes.length ? c.closes : p.closes;
    if (c?.merged && closes.length) {
      for (const k of closes) merged.add(k);
      gone.push({ type: "supernova", repo: p.repo, at, url: p.url, pr: p.key, issues: closes.slice() });
    } else gone.push({ type: "prgone", repo: p.repo, at, url: p.url, pr: p.key, merged: !!c?.merged });
  }
  // An issue closed by a merged PR plays inside that Supernova, not as its own Close.
  for (const [k, o] of closing) if (!merged.has(k)) evs.push({ type: "close", repo: o.repo, at: now, url: o.url, issue: k });
  evs.push(...gone);
  return evs;
}
