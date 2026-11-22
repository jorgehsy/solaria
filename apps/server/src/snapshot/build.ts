import type { UniverseData } from "@solaria/contract";
import type { RepoReply } from "../github/query.ts";

const time = (s: string | null | undefined): number => {
  const t = Date.parse(s ?? "");
  return Number.isNaN(t) ? 0 : t;
};

/**
 * Build the Universe from GitHub's replies. Pure: replies in, Universe out.
 * Slice 3 reading rules: every open issue is Gas and To do. Galaxies keep config order;
 * a repo without a reply (failed, never read) is still a Galaxy, with no issues.
 */
export function buildUniverse(repos: readonly string[], replies: ReadonlyMap<string, RepoReply>, at: number): UniverseData {
  const u: UniverseData = { at, repos: repos.slice(), maps: {}, issues: {}, prs: {}, closedPrs: {} };
  for (const repo of repos) {
    const r = replies.get(repo);
    if (!r) continue;
    for (const i of r.issues) {
      const key = `${repo}#${i.number}`;
      u.issues[key] = {
        key, repo, number: i.number, title: i.title, url: i.url,
        map: null, blockers: [], assignees: i.assignees.nodes.map((a) => a.login),
        closed: false, created: time(i.createdAt), closedAt: 0,
      };
    }
  }
  return u;
}
