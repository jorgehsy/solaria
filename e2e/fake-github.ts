/**
 * A tiny stand-in for GitHub's GraphQL API, for end-to-end tests. Solaria's server is started with
 * GITHUB_API_URL pointing here. Tests change the open issues with POST /__issues.
 */
import { createServer, type IncomingMessage } from "node:http";

interface Issue { number: number; title: string; assignees?: string[] }
const repos = new Map<string, Issue[]>([
  ["acme/web", [
    { number: 1, title: "Sort the sidebar" },
    { number: 2, title: "Empty-state text", assignees: ["alice"] },
  ]],
]);

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
  if (req.method === "GET" && req.url === "/__health") return json(200, { ok: true });
  if (req.method !== "POST" || req.url !== "/graphql") return json(404, { message: "Not Found" });
  if (!req.headers.authorization) return json(401, { message: "Bad credentials" });
  const { variables } = JSON.parse(body) as { variables: { owner: string; name: string } };
  const full = `${variables.owner}/${variables.name}`;
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
            number: i.number, title: i.title, url: `https://github.com/${full}/issues/${i.number}`,
            createdAt: "2026-11-20T10:00:00Z", assignees: { nodes: (i.assignees ?? []).map((login) => ({ login })) },
          })),
        },
      },
    },
  });
}).listen(port, "127.0.0.1", () => console.log(`Fake GitHub on http://127.0.0.1:${port}`));
