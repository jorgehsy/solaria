/**
 * A tiny stand-in for GitHub's GraphQL API, for end-to-end tests. Solaria's server is started with
 * GITHUB_API_URL pointing here. Tests change the open issues with POST /__issues.
 * `acme/maps` is a repo for the reading rules (slice 4): a Map, closed children, blockers, PRs, assignees.
 * Tests replace a repo's issues and PRs with POST /__repo, and put the seed back with `{ repo, reset: true }`.
 * Several owners (slice 5): `acme/fleet`, `globex/core` and `umbrella/lab` each accept one token only
 * (`tokens` below) and answer 401 to any other; GET /__seen lists the tokens each repo was sent.
 */
import { createServer, type IncomingMessage } from "node:http";

interface Ref { repo?: string; number: number }
interface Kid extends Ref { title: string; closed?: boolean }
interface Issue { number: number; title: string; assignees?: string[]; body?: string; blockedBy?: (Ref & { closed?: boolean })[]; kids?: Kid[] }
interface Pr { number: number; title: string; draft?: boolean; merged?: boolean; closes?: Ref[] }
const repos = new Map<string, Issue[]>([
  ["acme/web", [
    { number: 1, title: "Sort the sidebar" },
    { number: 2, title: "Empty-state text", assignees: ["alice"] },
  ]],
  ["acme/maps", [
    { number: 1, title: "Map: Launch", assignees: ["dana"], kids: [
      { number: 2, title: "Write the launch post" }, { number: 3, title: "Pick a date" }, { number: 4, title: "Book the venue", closed: true },
      { number: 5, title: "Print badges" }, { number: 7, title: "Send invites" }, { number: 8, title: "Map: Not a Planet" },
    ] },
    { number: 2, title: "Write the launch post", assignees: ["alice", "bob", "carol"] },
    { number: 3, title: "Pick a date", body: "Context first.\nBlocked by: #6" },
    { number: 5, title: "Print badges", blockedBy: [{ number: 6 }] },
    { number: 6, title: "Budget sign-off" },
    { number: 7, title: "Send invites" },
    { number: 8, title: "Map: Not a Planet" },
  ]],
  ["acme/fleet", [
    { number: 1, title: "Map: Release", kids: [
      { number: 2, title: "Cut the branch" }, { repo: "globex/core", number: 3, title: "Ship the SDK" }, { repo: "other/lib", number: 4, title: "Upstream fix" },
    ] },
    { number: 2, title: "Cut the branch", body: "Blocked by: other/lib#9" },
  ]],
  ["globex/core", [
    { number: 3, title: "Ship the SDK" },
    { number: 5, title: "Rename the package" },
  ]],
  ["umbrella/lab", [{ number: 1, title: "Never read" }]],
]);
/** Repos that accept one token only, as in `e2e/fixtures/owners/.env`. */
const tokens = new Map([["acme/fleet", "main-token"], ["globex/core", "globex-token"], ["umbrella/lab", "umbrella-token"]]);
const seen = new Map<string, Set<string>>();
/** Open pull requests per repo, and the closed ones (newest first). */
const prs = new Map<string, Pr[]>([
  ["acme/maps", [{ number: 20, title: "Draft the post", draft: true, closes: [{ number: 2 }] }, { number: 21, title: "Invite list", closes: [{ number: 7 }] }]],
]);
const closedPrs = new Map<string, Pr[]>([
  ["acme/maps", [{ number: 19, title: "Venue contract", merged: true, closes: [{ number: 4 }] }]],
]);

const seed = structuredClone({ repos: [...repos], prs: [...prs], closedPrs: [...closedPrs] });

const T = "2026-11-20T10:00:00Z";
const url = (repo: string, kind: string, n: number) => `https://github.com/${repo}/${kind}/${n}`;
const ref = (here: string) => (r: Ref) => ({ number: r.number, repository: { nameWithOwner: r.repo ?? here } });
const refs = (here: string, rs: Ref[] = []) => ({ nodes: rs.map(ref(here)) });

const port = Number(process.env.FAKE_GITHUB_PORT ?? 4790);

function read(req: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let body = "";
    req.on("data", (c: Buffer) => { body += c.toString(); });
    req.on("end", () => resolve(body));
  });
}

createServer(async (req, res) => {
  const body = await read(req);
  const json = (status: number, data: unknown) => {
    res.writeHead(status, { "content-type": "application/json", "x-ratelimit-remaining": "4999", "x-ratelimit-limit": "5000" });
    res.end(JSON.stringify(data));
  };
  if (req.method === "POST" && req.url === "/__issues") {
    const { repo, issues } = JSON.parse(body) as { repo: string; issues: Issue[] };
    repos.set(repo, issues);
    return json(200, { ok: true });
  }
  if (req.method === "POST" && req.url === "/__repo") {
    const r = JSON.parse(body) as { repo: string; reset?: boolean; issues?: Issue[]; prs?: Pr[]; closedPrs?: Pr[] };
    const pick = <T>(list: [string, T][], v: T | undefined, map: Map<string, T>) => {
      const value = r.reset ? structuredClone(list.find(([k]) => k === r.repo)?.[1]) : v;
      if (value === undefined) map.delete(r.repo);
      else map.set(r.repo, value);
    };
    pick(seed.repos, r.issues, repos);
    pick(seed.prs, r.prs, prs);
    pick(seed.closedPrs, r.closedPrs, closedPrs);
    return json(200, { ok: true });
  }
  if (req.method === "GET" && req.url === "/__health") return json(200, { ok: true });
  if (req.method === "GET" && req.url === "/__seen") return json(200, Object.fromEntries([...seen].map(([r, t]) => [r, [...t]])));
  if (req.method !== "POST" || req.url !== "/graphql") return json(404, { message: "Not Found" });
  if (!req.headers.authorization) return json(401, { message: "Bad credentials" });
  const { variables } = JSON.parse(body) as { variables: { owner: string; name: string; withPrs?: boolean } };
  const full = `${variables.owner}/${variables.name}`;
  const token = req.headers.authorization.replace(/^(bearer|token) /i, "");
  seen.set(full, (seen.get(full) ?? new Set()).add(token));
  const want = tokens.get(full);
  if (want && token !== want) return json(401, { message: "Bad credentials" });
  const issues = repos.get(full);
  if (!issues) return json(200, { data: { repository: null }, errors: [{ type: "NOT_FOUND", message: `Could not resolve to a Repository with the name '${full}'.` }] });
  return json(200, {
    data: {
      rateLimit: { cost: 1, remaining: 4999, limit: 5000, resetAt: new Date(Date.now() + 3_600_000).toISOString() },
      repository: {
        nameWithOwner: full,
        issues: {
          pageInfo: { hasNextPage: false, endCursor: null },
          nodes: issues.map((i) => ({
            number: i.number, title: i.title, url: url(full, "issues", i.number), body: i.body ?? "",
            createdAt: T, assignees: { nodes: (i.assignees ?? []).map((login) => ({ login })) },
            blockedBy: { nodes: (i.blockedBy ?? []).map((b) => ({ ...ref(full)(b), state: b.closed ? "CLOSED" : "OPEN" })) },
            subIssues: {
              totalCount: i.kids?.length ?? 0,
              nodes: (i.kids ?? []).map((k) => ({
                ...ref(full)(k), title: k.title, url: url(k.repo ?? full, "issues", k.number),
                state: k.closed ? "CLOSED" : "OPEN", createdAt: T, closedAt: k.closed ? "2026-11-21T10:00:00Z" : null,
              })),
            },
          })),
        },
        ...(variables.withPrs ? {
          pullRequests: { nodes: (prs.get(full) ?? []).map((p) => ({ number: p.number, title: p.title, url: url(full, "pull", p.number), isDraft: !!p.draft, createdAt: T, closingIssuesReferences: refs(full, p.closes) })) },
          closedPullRequests: { nodes: (closedPrs.get(full) ?? []).map((p) => ({ number: p.number, title: p.title, url: url(full, "pull", p.number), merged: !!p.merged, mergedAt: p.merged ? T : null, closedAt: T, closingIssuesReferences: refs(full, p.closes) })) },
        } : {}),
      },
    },
  });
}).listen(port, "127.0.0.1", () => console.log(`Fake GitHub on http://127.0.0.1:${port}`));
