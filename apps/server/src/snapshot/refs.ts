/**
 * Issue refs as people write them (spec section 5, "Refs"):
 * `#N` is the same repo, `repo#N` the same owner, `owner/repo#N` any repo.
 */
export interface Ref {
  /** `owner/repo` as written or completed from the issue it was written in (not yet matched to the config). */
  repo: string;
  number: number;
}

const REF = /(?:([A-Za-z0-9_.-]+)\/)?([A-Za-z0-9_.-]+)?#(\d+)\b/g;
const BLOCKED_LINE = /^Blocked by:(.*)$/gm;

/** Refs in one piece of text, completed against `here` (`owner/repo` of the issue it was written in). */
export function parseRefs(text: string, here: string): Ref[] {
  const [hereOwner = "", hereRepo = ""] = here.split("/");
  const out: Ref[] = [];
  for (const m of text.matchAll(REF)) {
    const [, owner, repo, n] = m;
    const number = Number(n);
    if (!number) continue;
    if (owner && repo) out.push({ repo: `${owner}/${repo}`, number });
    else if (repo) out.push({ repo: `${hereOwner}/${repo}`, number });
    else if (!owner) out.push({ repo: `${hereOwner}/${hereRepo}`, number });
  }
  return out;
}

/** Refs on every body line that starts with `Blocked by:`. Other body text is never read. */
export function blockedByRefs(body: string | null | undefined, here: string): Ref[] {
  if (!body) return [];
  const out: Ref[] = [];
  for (const m of body.replace(/\r/g, "").matchAll(BLOCKED_LINE)) out.push(...parseRefs(m[1] ?? "", here));
  return out;
}

/**
 * Matches `owner/repo` (as written, or GitHub's `nameWithOwner`) to the configured spelling.
 * GitHub names are case-insensitive. Null means the repo is not in the Universe.
 */
export function configuredRepos(repos: readonly string[]): (repo: string) => string | null {
  const byLower = new Map(repos.map((r) => [r.toLowerCase(), r]));
  return (repo) => byLower.get(repo.toLowerCase()) ?? null;
}
