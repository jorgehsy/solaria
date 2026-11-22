import type { ErrorCode } from "@solaria/contract";
import { REPO_QUERY } from "./query.ts";
import type { GqlClosedPullRequest, GqlIssue, GqlPullRequest, GqlRepoPage, RepoReply } from "./query.ts";

export const DEFAULT_API_URL = "https://api.github.com";

export interface RateInfo {
  remaining: number;
  limit: number;
  /** Epoch ms when the budget resets. */
  resetAt: number;
  /** Points this read cost. */
  cost: number;
}

export type FetchResult =
  | { ok: true; reply: RepoReply; rate: RateInfo | null }
  | { ok: false; code: ErrorCode; message: string; rate: RateInfo | null; retryAfterMs?: number };

export type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body: string; signal?: AbortSignal }) => Promise<{
  status: number;
  headers: { get(name: string): string | null };
  json(): Promise<unknown>;
}>;

const MAX_PAGES = 10;

/**
 * Read one repo with the GraphQL query, following pages of open issues.
 * Pull requests come with the first page only.
 * Maps every failure onto one of the five error codes, never throws.
 */
export async function fetchRepo(repo: string, token: string, opts: { apiUrl?: string; fetch?: FetchLike; timeoutMs?: number } = {}): Promise<FetchResult> {
  const [owner = "", name = ""] = repo.split("/");
  const url = graphqlUrl(opts.apiUrl ?? DEFAULT_API_URL);
  const doFetch: FetchLike = opts.fetch ?? (globalThis.fetch as unknown as FetchLike);
  const issues: GqlIssue[] = [];
  let prs: GqlPullRequest[] = [];
  let closedPrs: GqlClosedPullRequest[] = [];
  let nameWithOwner = repo;
  let after: string | null = null;
  let rate: RateInfo | null = null;
  for (let page = 0; page < MAX_PAGES; page++) {
    let res: Awaited<ReturnType<FetchLike>>;
    try {
      res = await doFetch(url, {
        method: "POST",
        headers: { authorization: `bearer ${token}`, "content-type": "application/json", "user-agent": "solaria" },
        body: JSON.stringify({ query: REPO_QUERY, variables: { owner, name, after, withPrs: page === 0 } }),
        signal: AbortSignal.timeout(opts.timeoutMs ?? 20_000),
      });
    } catch (e) {
      return { ok: false, code: "network", message: (e as Error).message, rate };
    }
    rate = rateFromHeaders(res.headers) ?? rate;
    if (res.status === 401) return { ok: false, code: "bad_token", message: "GitHub rejected the token (401)", rate };
    if (res.status === 429 || (res.status === 403 && (rate?.remaining === 0 || res.headers.get("retry-after")))) {
      return { ok: false, code: "rate_limited", message: `GitHub rate limit (${res.status})`, rate, retryAfterMs: retryAfter(res.headers, rate) };
    }
    if (res.status === 403) return { ok: false, code: "no_access", message: "GitHub refused access (403)", rate };
    if (res.status >= 500) return { ok: false, code: "network", message: `GitHub answered ${res.status}`, rate };
    if (res.status !== 200) return { ok: false, code: "network", message: `Unexpected answer ${res.status}`, rate };
    let body: { data?: GqlRepoPage | null; errors?: { type?: string; message?: string }[] };
    try {
      body = (await res.json()) as typeof body;
    } catch (e) {
      return { ok: false, code: "network", message: `Bad JSON from GitHub: ${(e as Error).message}`, rate };
    }
    const err = body.errors?.[0];
    if (err) {
      const type = err.type ?? "";
      if (type === "NOT_FOUND") return { ok: false, code: "not_found", message: err.message ?? "Repo not found", rate };
      if (type === "FORBIDDEN" || type === "INSUFFICIENT_SCOPES") return { ok: false, code: "no_access", message: err.message ?? "No access", rate };
      if (type === "RATE_LIMITED") return { ok: false, code: "rate_limited", message: err.message ?? "Rate limited", rate, retryAfterMs: retryAfter(res.headers, rate) };
      if (!body.data?.repository) return { ok: false, code: "network", message: err.message ?? "GitHub error", rate };
    }
    const data = body.data;
    if (data?.rateLimit) rate = { remaining: data.rateLimit.remaining, limit: data.rateLimit.limit, resetAt: Date.parse(data.rateLimit.resetAt) || 0, cost: data.rateLimit.cost };
    const r = data?.repository;
    if (!r) return { ok: false, code: "not_found", message: "Repo not found", rate };
    nameWithOwner = r.nameWithOwner;
    issues.push(...r.issues.nodes);
    if (page === 0) {
      prs = r.pullRequests?.nodes ?? [];
      closedPrs = r.closedPullRequests?.nodes ?? [];
    }
    if (!r.issues.pageInfo.hasNextPage || !r.issues.pageInfo.endCursor) break;
    after = r.issues.pageInfo.endCursor;
  }
  return { ok: true, reply: { nameWithOwner, issues, prs, closedPrs }, rate };
}

export function graphqlUrl(apiUrl: string): string {
  return apiUrl.replace(/\/+$/, "") + "/graphql";
}

function rateFromHeaders(h: { get(name: string): string | null }): RateInfo | null {
  const remaining = h.get("x-ratelimit-remaining");
  const limit = h.get("x-ratelimit-limit");
  const reset = h.get("x-ratelimit-reset");
  if (remaining === null || limit === null) return null;
  return { remaining: Number(remaining), limit: Number(limit), resetAt: reset ? Number(reset) * 1000 : 0, cost: 0 };
}

function retryAfter(h: { get(name: string): string | null }, rate: RateInfo | null): number {
  const ra = Number(h.get("retry-after"));
  if (ra > 0) return ra * 1000;
  if (rate?.remaining === 0 && rate.resetAt) return Math.max(60_000, rate.resetAt - Date.now());
  return 60_000;
}
