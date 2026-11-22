/**
 * The Universe as data: the same shape for live repos and for the demo.
 * Keys: an issue (or Map) is `owner/repo#N`, a pull request is `owner/repo!N`.
 * Times are epoch milliseconds; 0 means unknown.
 */
export type IssueKey = string;
export type PrKey = string;

export type IssueState = "todo" | "doing" | "blocked" | "review" | "done";

/** A Map: an open issue titled `Map: …` with sub-issues. `title` is stored without the prefix. */
export interface MapIssue {
  key: IssueKey;
  repo: string;
  number: number;
  title: string;
  url: string;
  assignees: string[];
  created: number;
}

/** A Planet (when `map` is set) or Gas (when it is not). */
export interface Issue {
  key: IssueKey;
  repo: string;
  number: number;
  title: string;
  url: string;
  /** The Map this issue belongs to, or null for Gas. */
  map: IssueKey | null;
  /** Issues that block this one (only refs inside the Universe). */
  blockers: IssueKey[];
  assignees: string[];
  closed: boolean;
  created: number;
  closedAt: number;
  /**
   * An External Planet: a sub-issue whose repo is not in the Universe. It orbits its Map's Sun,
   * tagged "external", and never gets PR signals, blockers or Satellites. Absent means false.
   */
  external?: boolean;
  /** Blockers in repos outside the Universe, as `owner/repo#N`: plain text in the detail card, never state. */
  outsideBlockers?: string[];
}

export interface PullRequest {
  key: PrKey;
  repo: string;
  number: number;
  title: string;
  url: string;
  draft: boolean;
  /** Issues GitHub says this pull request closes. */
  closes: IssueKey[];
  /** Closing refs to repos outside the Universe, as `owner/repo#N`: plain text in the log, never state. */
  outsideCloses?: string[];
  created: number;
}

export interface ClosedPullRequest {
  key: PrKey;
  repo: string;
  number: number;
  title: string;
  url: string;
  merged: boolean;
  at: number;
  closes: IssueKey[];
  outsideCloses?: string[];
}

export interface Universe {
  at: number;
  /** Galaxies, in config order. */
  repos: string[];
  maps: Record<IssueKey, MapIssue>;
  issues: Record<IssueKey, Issue>;
  prs: Record<PrKey, PullRequest>;
  /** The last closed pull requests per repo, so a merge can be told from a plain close. */
  closedPrs: Record<PrKey, ClosedPullRequest>;
}

export const issueKey = (repo: string, n: number): IssueKey => `${repo}#${n}`;
export const prKey = (repo: string, n: number): PrKey => `${repo}!${n}`;
export const numberOf = (key: string): number => Number(key.slice(Math.max(key.lastIndexOf("#"), key.lastIndexOf("!")) + 1));
export const repoOf = (key: string): string => key.slice(0, Math.max(key.lastIndexOf("#"), key.lastIndexOf("!")));

export const emptyUniverse = (repos: string[] = []): Universe => ({ at: 0, repos: repos.slice(), maps: {}, issues: {}, prs: {}, closedPrs: {} });

export function cloneUniverse(u: Universe): Universe {
  const each = <T extends object>(r: Record<string, T>, f: (v: T) => T): Record<string, T> => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, f(v)]));
  return {
    at: u.at,
    repos: u.repos.slice(),
    maps: each(u.maps, (m) => ({ ...m, assignees: m.assignees.slice() })),
    issues: each(u.issues, (i) => ({ ...i, blockers: i.blockers.slice(), assignees: i.assignees.slice(), ...(i.outsideBlockers ? { outsideBlockers: i.outsideBlockers.slice() } : {}) })),
    prs: each(u.prs, (p) => ({ ...p, closes: p.closes.slice(), ...(p.outsideCloses ? { outsideCloses: p.outsideCloses.slice() } : {}) })),
    closedPrs: each(u.closedPrs, (p) => ({ ...p, closes: p.closes.slice(), ...(p.outsideCloses ? { outsideCloses: p.outsideCloses.slice() } : {}) })),
  };
}

/** Accepted Map title prefixes (glossary). */
export const MAP_PREFIXES = ["Map: ", "Mapa: "] as const;
export const isMapTitle = (title: string): boolean => MAP_PREFIXES.some((p) => title.startsWith(p));
export function stripMapPrefix(title: string): string {
  for (const p of MAP_PREFIXES) if (title.startsWith(p)) return title.slice(p.length).trim();
  return title;
}
