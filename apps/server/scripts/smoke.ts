/**
 * Smoke test against the real GitHub GraphQL API (CI runs it with the workflow token).
 * Reads one repo with the same query and builder the server uses and fails if GitHub rejects
 * a field (sub-issues, native blocked-by, closing refs) or the snapshot breaks the contract.
 *
 *   GITHUB_TOKEN=... SMOKE_REPO=owner/repo pnpm --filter @solaria/server smoke
 */
import { UniverseData } from "@solaria/contract";
import { fetchRepo } from "../src/github/client.ts";
import { buildUniverse } from "../src/snapshot/build.ts";

const token = process.env.GITHUB_TOKEN;
const repo = process.env.SMOKE_REPO ?? "jorgehsy/solaria";
if (!token) {
  console.error("smoke: set GITHUB_TOKEN");
  process.exit(1);
}

const res = await fetchRepo(repo, token, { apiUrl: process.env.GITHUB_API_URL });
if (!res.ok) {
  console.error(`smoke: ${repo} failed: ${res.code} (${res.message})`);
  process.exit(1);
}
const { issues, prs = [], closedPrs = [] } = res.reply;
const problems: string[] = [];
for (const i of issues) {
  if (!i.subIssues) problems.push(`#${i.number}: no subIssues field`);
  else if (i.subIssues.totalCount > 0 && i.subIssues.nodes.length === 0) problems.push(`#${i.number}: ${i.subIssues.totalCount} sub-issues but none returned`);
  if (!i.blockedBy) problems.push(`#${i.number}: no blockedBy field`);
}
const universe = UniverseData.parse(buildUniverse([repo], new Map([[repo, res.reply]]), Date.now()));
const subIssues = issues.reduce((n, i) => n + (i.subIssues?.nodes.length ?? 0), 0);
const blockers = issues.reduce((n, i) => n + (i.blockedBy?.nodes.length ?? 0), 0);
console.log(
  `smoke: ${repo}: ${issues.length} open issues, ${subIssues} sub-issues, ${blockers} native blockers, ` +
    `${prs.length} open PRs, ${closedPrs.length} closed PRs -> ${Object.keys(universe.maps).length} Maps, ` +
    `${Object.keys(universe.issues).length} drawn issues. Cost ${res.rate?.cost ?? "?"} points, ${res.rate?.remaining ?? "?"} left.`,
);
if (problems.length) {
  console.error(`smoke: ${problems.join("; ")}`);
  process.exit(1);
}
