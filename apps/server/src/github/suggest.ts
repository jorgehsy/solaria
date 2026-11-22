import { DEFAULT_API_URL, graphqlUrl } from "./client.ts";
import type { FetchLike } from "./client.ts";

/** The owner's repo names, most recently pushed first: the did-you-mean for `not_found` (spec section 9). */
export const OWNER_REPOS_QUERY = /* GraphQL */ `
  query OwnerRepos($owner: String!) {
    repositoryOwner(login: $owner) {
      repositories(first: 100, orderBy: { field: PUSHED_AT, direction: DESC }) { nodes { name } }
    }
  }
`;

/**
 * `owner/closest-name` when the owner has a repo whose name is a small typo away, else null.
 * One extra read, only after a `not_found`. Never throws.
 */
export async function suggestRepo(repo: string, token: string, opts: { apiUrl?: string; fetch?: FetchLike } = {}): Promise<string | null> {
  const [owner = "", name = ""] = repo.split("/");
  const doFetch: FetchLike = opts.fetch ?? (globalThis.fetch as unknown as FetchLike);
  try {
    const res = await doFetch(graphqlUrl(opts.apiUrl ?? DEFAULT_API_URL), {
      method: "POST",
      headers: { authorization: `bearer ${token}`, "content-type": "application/json", "user-agent": "solaria" },
      body: JSON.stringify({ query: OWNER_REPOS_QUERY, variables: { owner } }),
      signal: AbortSignal.timeout(20_000),
    });
    if (res.status !== 200) return null;
    const body = (await res.json()) as { data?: { repositoryOwner?: { repositories?: { nodes?: { name: string }[] } } | null } };
    const list = body.data?.repositoryOwner?.repositories?.nodes?.map((n) => n.name) ?? [];
    const hit = closest(name, list);
    return hit ? `${owner}/${hit}` : null;
  } catch {
    return null;
  }
}

/** The candidate within a small edit distance (2, or 1 for short names), ignoring case. */
export function closest(name: string, candidates: readonly string[]): string | null {
  const want = name.toLowerCase();
  const max = want.length <= 3 ? 1 : 2;
  let best: string | null = null;
  let bestD = Infinity;
  for (const c of candidates) {
    const d = distance(want, c.toLowerCase());
    if (d <= max && d < bestD) { best = c; bestD = d; }
  }
  return best;
}

/** Damerau-Levenshtein (adjacent swaps count as one edit, so `dcos` is one away from `docs`). */
function distance(a: string, b: string): number {
  const w = b.length + 1;
  const d = new Array<number>((a.length + 1) * w).fill(0);
  const at = (i: number, j: number) => d[i * w + j] ?? 0;
  for (let i = 0; i <= a.length; i++) d[i * w] = i;
  for (let j = 0; j <= b.length; j++) d[j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      let v = Math.min(at(i - 1, j) + 1, at(i, j - 1) + 1, at(i - 1, j - 1) + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, at(i - 2, j - 2) + 1);
      d[i * w + j] = v;
    }
  }
  return at(a.length, b.length);
}
