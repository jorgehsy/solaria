import type { UniverseData } from "@solaria/contract";
import { isMapTitle, issueKey, prKey, stripMapPrefix } from "@solaria/universe";
import type { GqlRef, GqlSubIssue, RepoReply } from "../github/query.ts";
import { blockedByRefs, configuredRepos } from "./refs.ts";

type Issue = UniverseData["issues"][string];

const time = (s: string | null | undefined): number => {
  const t = Date.parse(s ?? "");
  return Number.isNaN(t) ? 0 : t;
};
const unique = <T>(xs: T[]): T[] => [...new Set(xs)];
/** Refs as written, deduplicated the way GitHub compares names (case-insensitive), first spelling kept. */
const uniqueRefs = (xs: string[]): string[] => {
  const seen = new Set<string>();
  return xs.filter((x) => !seen.has(x.toLowerCase()) && !!seen.add(x.toLowerCase()));
};

/**
 * Build the Universe from GitHub's replies. Pure: replies in, Universe out.
 * Reading rules (spec section 5, `docs/repo-requirements.md`):
 * - A Map is an open issue titled `Map: `/`Mapa: ` with at least one sub-issue; its title loses the prefix.
 * - Its sub-issues are Planets (closed ones too, for progress), except children titled as Maps.
 *   A sub-issue in a repo outside the config is an External Planet: from the same reply, no extra call.
 * - Every other open issue is Gas.
 * - Blockers come from `Blocked by:` body lines and GitHub's native blocked-by; PR links only from
 *   GitHub's closing references. Refs to repos outside the config never count: blockers there are kept
 *   as plain text (`outsideBlockers`) for the detail card; PR links there are dropped.
 * The state itself is derived in `@solaria/universe` (`issueStates`), not stored.
 * Galaxies keep config order; a repo without a reply (failed, never read) is still a Galaxy, with no issues.
 */
export function buildUniverse(repos: readonly string[], replies: ReadonlyMap<string, RepoReply>, at: number): UniverseData {
  const u: UniverseData = { at, repos: repos.slice(), maps: {}, issues: {}, prs: {}, closedPrs: {} };
  const inUniverse = configuredRepos(repos);
  const keyOf = (r: GqlRef): string | null => {
    const repo = inUniverse(r.repository.nameWithOwner);
    return repo ? issueKey(repo, r.number) : null;
  };

  // Maps first, across every repo: a Planet may live in another configured repo.
  const mapOf = new Map<string, string>();
  const closedKids = new Map<string, { kid: GqlSubIssue; repo: string; map: string }>();
  const externalKids = new Map<string, { kid: GqlSubIssue; map: string }>();
  for (const repo of repos) {
    for (const i of replies.get(repo)?.issues ?? []) {
      const kids = i.subIssues;
      if (!isMapTitle(i.title) || !kids || Math.max(kids.totalCount, kids.nodes.length) === 0) continue;
      const key = issueKey(repo, i.number);
      u.maps[key] = { key, repo, number: i.number, title: stripMapPrefix(i.title), url: i.url, assignees: i.assignees.nodes.map((a) => a.login), created: time(i.createdAt) };
      for (const kid of kids.nodes) {
        if (isMapTitle(kid.title)) continue; // A Map never becomes a Planet.
        const kidRepo = inUniverse(kid.repository.nameWithOwner);
        if (!kidRepo) {
          const extKey = issueKey(kid.repository.nameWithOwner, kid.number);
          if (!externalKids.has(extKey)) externalKids.set(extKey, { kid, map: key });
          continue;
        }
        const kidKey = issueKey(kidRepo, kid.number);
        if (!mapOf.has(kidKey)) mapOf.set(kidKey, key);
        if (kid.state === "CLOSED") closedKids.set(kidKey, { kid, repo: kidRepo, map: key });
      }
    }
  }

  const blockersOf = new Map<string, string[]>();
  const outsideOf = new Map<string, string[]>();
  for (const repo of repos) {
    for (const i of replies.get(repo)?.issues ?? []) {
      const key = issueKey(repo, i.number);
      if (u.maps[key]) continue;
      const raw: GqlRef[] = [
        ...blockedByRefs(i.body, repo).map((r) => ({ number: r.number, repository: { nameWithOwner: r.repo } })),
        // A closed native blocker blocks nothing, wherever it lives.
        ...(i.blockedBy?.nodes ?? []).filter((b) => b.state !== "CLOSED"),
      ];
      blockersOf.set(key, unique(raw.map(keyOf).filter((k): k is string => !!k && k !== key)));
      const outside = uniqueRefs(raw.filter((r) => !inUniverse(r.repository.nameWithOwner)).map((r) => issueKey(r.repository.nameWithOwner, r.number)));
      if (outside.length) outsideOf.set(key, outside);
      u.issues[key] = {
        key, repo, number: i.number, title: i.title, url: i.url,
        map: mapOf.get(key) ?? null, blockers: [], assignees: i.assignees.nodes.map((a) => a.login),
        closed: false, created: time(i.createdAt), closedAt: 0,
      };
    }
  }

  // Closed children of open Maps: Done Planets. Never Satellites, never blockers of anything open.
  for (const [key, { kid, repo, map }] of closedKids) {
    if (u.issues[key]) continue; // The child's own repo says it is open: its own read wins.
    u.issues[key] = {
      key, repo, number: kid.number, title: kid.title, url: kid.url,
      map, blockers: [], assignees: [], closed: true, created: time(kid.createdAt), closedAt: time(kid.closedAt),
    } satisfies Issue;
  }

  // External Planets: what the sub-issues reply says, nothing more (no assignees, blockers or PR links).
  for (const [key, { kid, map }] of externalKids) {
    u.issues[key] = {
      key, repo: kid.repository.nameWithOwner, number: kid.number, title: kid.title, url: kid.url,
      map, blockers: [], assignees: [], closed: kid.state === "CLOSED", created: time(kid.createdAt),
      closedAt: kid.state === "CLOSED" ? time(kid.closedAt) : 0, external: true,
    } satisfies Issue;
  }

  // Only refs to issues in the Universe stay: anything else is closed, unread or outside the config.
  const present = (k: string) => !!u.issues[k] || !!u.maps[k];
  for (const [key, bs] of blockersOf) {
    const issue = u.issues[key];
    if (!issue) continue;
    issue.blockers = bs.filter((k) => present(k) && !u.issues[k]?.external);
    const outside = outsideOf.get(key);
    if (outside) issue.outsideBlockers = outside;
  }

  for (const repo of repos) {
    const r = replies.get(repo);
    for (const p of r?.prs ?? []) {
      const key = prKey(repo, p.number);
      const closes = unique((p.closingIssuesReferences?.nodes ?? []).map(keyOf).filter((k): k is string => !!k && present(k)));
      u.prs[key] = { key, repo, number: p.number, title: p.title, url: p.url, draft: p.isDraft, closes, created: time(p.createdAt) };
    }
    for (const p of r?.closedPrs ?? []) {
      const key = prKey(repo, p.number);
      // Issues a closed PR closed are usually closed now too, so they are kept even when absent.
      const closes = unique((p.closingIssuesReferences?.nodes ?? []).map(keyOf).filter((k): k is string => !!k));
      u.closedPrs[key] = { key, repo, number: p.number, title: p.title, url: p.url, merged: p.merged, at: time(p.mergedAt ?? p.closedAt), closes };
    }
  }
  return u;
}
