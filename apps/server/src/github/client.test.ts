import { describe, expect, it } from "vitest";
import { fetchRepo, graphqlUrl } from "./client.ts";
import type { FetchLike } from "./client.ts";

type Answer = { status: number; body?: unknown; headers?: Record<string, string> };
function fake(...answers: Answer[]): FetchLike & { calls: { url: string; body: unknown; auth: string | undefined }[] } {
  const calls: { url: string; body: unknown; auth: string | undefined }[] = [];
  const f = (async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body), auth: init.headers.authorization });
    const a = answers.shift() ?? { status: 500 };
    return { status: a.status, headers: { get: (n: string) => a.headers?.[n.toLowerCase()] ?? null }, json: async () => a.body };
  }) as FetchLike & { calls: typeof calls };
  f.calls = calls;
  return f;
}
const page = (numbers: number[], next: string | null) => ({
  data: {
    rateLimit: { cost: 1, remaining: 4990, limit: 5000, resetAt: "2026-11-22T06:00:00Z" },
    repository: {
      nameWithOwner: "acme/web",
      issues: {
        pageInfo: { hasNextPage: !!next, endCursor: next },
        nodes: numbers.map((n) => ({ number: n, title: `#${n}`, url: `u${n}`, createdAt: "2026-11-20T10:00:00Z", assignees: { nodes: [] } })),
      },
    },
  },
});

describe("fetchRepo", () => {
  it("posts the query with the token to <api>/graphql and joins pages", async () => {
    const f = fake({ status: 200, body: page([1, 2], "c1") }, { status: 200, body: page([3], null) });
    const r = await fetchRepo("acme/web", "tok", { apiUrl: "http://fake/", fetch: f });
    expect(r.ok && r.reply.issues.map((i) => i.number)).toEqual([1, 2, 3]);
    expect(f.calls[0]).toMatchObject({ url: "http://fake/graphql", auth: "bearer tok", body: { variables: { owner: "acme", name: "web", after: null } } });
    expect(f.calls[1]?.body).toMatchObject({ variables: { after: "c1" } });
    expect(r.rate).toMatchObject({ remaining: 4990, limit: 5000, cost: 1 });
  });

  it("maps 401 to bad_token", async () => {
    expect(await fetchRepo("acme/web", "t", { fetch: fake({ status: 401 }) })).toMatchObject({ ok: false, code: "bad_token" });
  });
  it("maps a plain 403 to no_access", async () => {
    expect(await fetchRepo("acme/web", "t", { fetch: fake({ status: 403 }) })).toMatchObject({ ok: false, code: "no_access" });
  });
  it("maps 429 and an exhausted 403 to rate_limited, honouring retry-after", async () => {
    expect(await fetchRepo("acme/web", "t", { fetch: fake({ status: 429, headers: { "retry-after": "120" } }) })).toMatchObject({ code: "rate_limited", retryAfterMs: 120_000 });
    const r = await fetchRepo("acme/web", "t", { fetch: fake({ status: 403, headers: { "x-ratelimit-remaining": "0", "x-ratelimit-limit": "5000", "x-ratelimit-reset": "1" } }) });
    expect(r).toMatchObject({ code: "rate_limited" });
    expect(!r.ok && r.retryAfterMs).toBeGreaterThanOrEqual(60_000);
  });
  it("maps GraphQL NOT_FOUND to not_found", async () => {
    const body = { data: { repository: null }, errors: [{ type: "NOT_FOUND", message: "Could not resolve to a Repository" }] };
    expect(await fetchRepo("acme/nope", "t", { fetch: fake({ status: 200, body }) })).toMatchObject({ ok: false, code: "not_found" });
  });
  it("maps a thrown fetch and 5xx to network", async () => {
    const boom: FetchLike = async () => { throw new Error("ECONNREFUSED"); };
    expect(await fetchRepo("acme/web", "t", { fetch: boom })).toMatchObject({ ok: false, code: "network" });
    expect(await fetchRepo("acme/web", "t", { fetch: fake({ status: 502 }) })).toMatchObject({ ok: false, code: "network" });
  });
  it("builds the GraphQL URL from GITHUB_API_URL", () => {
    expect(graphqlUrl("https://api.github.com")).toBe("https://api.github.com/graphql");
    expect(graphqlUrl("http://127.0.0.1:4790/")).toBe("http://127.0.0.1:4790/graphql");
  });
});
