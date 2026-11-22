import { emptyUniverse, issueKey, prKey } from "./model.ts";
import type { ClosedPullRequest, Issue, MapIssue, PullRequest, Universe } from "./model.ts";

/** Small builders for tests. */
export function universe(repos = ["acme/web"]): Universe {
  return { ...emptyUniverse(repos), at: 1_000_000 };
}
export function addMap(u: Universe, repo: string, n: number, title: string, o: Partial<MapIssue> = {}): MapIssue {
  const m: MapIssue = { key: issueKey(repo, n), repo, number: n, title, url: `https://github.com/${repo}/issues/${n}`, assignees: [], created: 10, ...o };
  u.maps[m.key] = m;
  return m;
}
export function addIssue(u: Universe, repo: string, n: number, o: Partial<Issue> = {}): Issue {
  const i: Issue = { key: issueKey(repo, n), repo, number: n, title: `Issue ${n}`, url: `https://github.com/${repo}/issues/${n}`, map: null, blockers: [], assignees: [], closed: false, created: 10, closedAt: 0, ...o };
  u.issues[i.key] = i;
  return i;
}
export function addPr(u: Universe, repo: string, n: number, o: Partial<PullRequest> = {}): PullRequest {
  const p: PullRequest = { key: prKey(repo, n), repo, number: n, title: `PR ${n}`, url: `https://github.com/${repo}/pull/${n}`, draft: false, closes: [], created: 10, ...o };
  u.prs[p.key] = p;
  return p;
}
export function addClosedPr(u: Universe, repo: string, n: number, o: Partial<ClosedPullRequest> = {}): ClosedPullRequest {
  const p: ClosedPullRequest = { key: prKey(repo, n), repo, number: n, title: `PR ${n}`, url: `https://github.com/${repo}/pull/${n}`, merged: false, at: 20, closes: [], ...o };
  u.closedPrs[p.key] = p;
  return p;
}
