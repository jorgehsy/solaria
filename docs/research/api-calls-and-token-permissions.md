# GitHub API calls that replace each connector call, and the token permissions they need

Research for [issue #2](https://github.com/jorgehsy/solaria/issues/2). Researched 2026-11-21.

## Sources

Primary sources used. "Docs source" means the Markdown/JSON files that docs.github.com is built from.

- [S1] GitHub REST OpenAPI description (`github/rest-api-description`, `descriptions/api.github.com/api.github.com.json`): endpoints, parameters, response schemas.
- [S2] Docs source `src/github-apps/data/fpt-2022-11-28/fine-grained-pat-permissions.json`: the permission each REST endpoint requires for a fine-grained PAT. Rendered at <https://docs.github.com/rest/authentication/permissions-required-for-fine-grained-personal-access-tokens>.
- [S3] Docs: [Managing your personal access tokens](https://docs.github.com/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens).
- [S4] Docs: [Setting a personal access token policy for your organization](https://docs.github.com/organizations/managing-programmatic-access-to-your-organization/setting-a-personal-access-token-policy-for-your-organization).
- [S5] Docs: [Scopes for OAuth apps](https://docs.github.com/apps/oauth-apps/building-oauth-apps/scopes-for-oauth-apps) (classic PAT scopes).
- [S6] Docs: [Forming calls with GraphQL](https://docs.github.com/graphql/guides/forming-calls-with-graphql), [GraphQL rate limits](https://docs.github.com/graphql/overview/rate-limits-and-query-limits-for-the-graphql-api), [REST best practices](https://docs.github.com/rest/using-the-rest-api/best-practices-for-using-the-rest-api).
- [S7] Live check on 2026-11-21 against `jorgehsy/solaria` with a classic PAT (REST and GraphQL calls named below).

The reference code is `reference/universo-artifact.html`. Line numbers below refer to it.

## 1. Connector call to API call

### Summary table

| Connector call | REST | GraphQL | Returns every field the code reads? |
| --- | --- | --- | --- |
| `list_issues` (OPEN, 100/page, cursor) | `GET /repos/{owner}/{repo}/issues?state=open&per_page=100` | `repository.issues(states: OPEN, first: 100, after:)` | REST: yes, but also returns PRs and paginates by `Link` header, not cursor. GraphQL: yes, no PRs, cursor like the connector. |
| `issue_read` `get_sub_issues` | `GET /repos/{owner}/{repo}/issues/{issue_number}/sub_issues?per_page=100` | `Issue.subIssues(first:)` | Yes. |
| `list_pull_requests` open | `GET /repos/{owner}/{repo}/pulls?state=open&per_page=100` | `repository.pullRequests(states: OPEN)` | Yes. |
| `list_pull_requests` closed, sorted by updated | `GET /repos/{owner}/{repo}/pulls?state=closed&sort=updated&direction=desc&per_page=20` | `pullRequests(states: [CLOSED, MERGED], orderBy: {field: UPDATED_AT, direction: DESC})` | Yes, with one field difference (`merged` boolean, see below). |
| `list_branches` | `GET /repos/{owner}/{repo}/branches?per_page=100` | `repository.refs(refPrefix: "refs/heads/", first: 100)` | Yes. |
| `list_commits` (`sha`=branch, `since`) | `GET /repos/{owner}/{repo}/commits?sha={branch}&since={ISO}&per_page=3` | `ref(qualifiedName:).target ... on Commit { history(since:, first: 3) }` | Yes. |

All REST rows are in [S1]. GraphQL field names for subIssues and blockedBy were exercised live [S7]; the other GraphQL rows come from the GraphQL schema as I know it and were not run in this session (see Open points).

### list_issues (code at lines 568 to 577)

Code reads: `number, title, body, state, assignees, labels, created_at, updated_at`, and `pageInfo.hasNextPage/endCursor`.

- REST list-for-repo [S1] returns an issue object with all of these. `assignees` and `labels` are arrays of objects, and the code's `login()` and `labelNames()` helpers already accept objects.
- Gap 1, pull requests: the endpoint docs say "GitHub's REST API considers every pull request an issue ... Issues endpoints may return both issues and pull requests. You can identify pull requests by the `pull_request` key." The port must drop any item that has a `pull_request` key. Otherwise PR numbers show up as issues. The connector's `list_issues` did not return PRs, so this is a new filter.
- Gap 2, pagination: REST uses `per_page` (max 100) and `page`, or the `Link: rel="next"` header. There is no `endCursor`. The code's `after` loop (lines 568 to 577) has to follow `Link` instead.
- `state=open` is the default. `sort=updated` is available. `since` filters by last update, which could cut re-reads later.
- GraphQL `repository.issues(states: OPEN, first: 100, after: $cursor)` returns only issues, with `pageInfo`, so it keeps the connector's cursor shape. Labels and assignees are nested connections, so it needs `labels(first: 20) { nodes { name } }`, and `createdAt`/`updatedAt` are camelCase. The code already accepts `createdAt` and `{nodes: [...]}` (lines 426, 428), which suggests the connector was GraphQL-backed.

### issue_read get_sub_issues (line 593)

- REST `GET /repos/{owner}/{repo}/issues/{issue_number}/sub_issues` [S1], permission `issues:read` [S2]. Parameters are only `per_page` and `page`. There is no state filter.
- Each item is a full issue object. The code uses `title, state, number, body, assignees, labels, html_url, created_at, updated_at, closed_at`, and `whereOf()` resolves a sub-issue in another repo through `html_url` or `repository_url`. Both are in the schema [S1]. Live check [S7]: `html_url`, `repository_url`, `state` ("open"), `labels` (objects), `assignees`, `updated_at`, `closed_at` were present, and the sub-issue from `issues/1` pointed at `jorgehsy/solaria#2`.
- State is lowercase (`open`/`closed`) in REST. The code lowercases before comparing (line 641), so it is fine. GraphQL returns `OPEN`/`CLOSED`.
- Limits: at most 100 sub-issues per parent and 8 nesting levels [docs: Adding sub-issues, `projects.sub-issue_limit: '100'`]. One page of 100 therefore always covers a map. The code passes `perPage: 100` already.
- Closed sub-issues: the endpoint has no `state` parameter and the docs do not say whether closed children are included. My live check only had open children. The artifact needs closed ones (the "done" planets). Verify with a closed child before building.
- GraphQL `Issue.subIssues(first: 100)` worked live [S7] (`totalCount`, `nodes { number state repository { nameWithOwner } }`). With aliases, one query can fetch the sub-issues of every map.
- Sub-issues can cross repos and owners, so one map can pull in an issue the token cannot read. See section 2.

### Native dependencies (`blocked_by`): they exist, the artifact does not use them

- REST: `GET /repos/{owner}/{repo}/issues/{issue_number}/dependencies/blocked_by` and `.../dependencies/blocking` exist [S1], with `issues:read` [S2]. Issue objects also carry `issue_dependencies_summary` and `parent_issue_url` [S1].
- GraphQL: `Issue.blockedBy` worked live [S7] (issue 7 returned blocker #2). `GET .../issues/2/dependencies/blocking` returned #7 and #8, the same relation seen from the other side.
- The artifact derives blockers from a `Blocked by:` line in the issue body (`blockedRefs`, line 385) and never calls these. Reading conventions are fixed in the map, so this is only a note for the spec: if native dependencies are ever wanted, the data is available with the same permission and one extra call per issue (REST) or one nested field (GraphQL).

### list_pull_requests (lines 581, 725)

Open: code reads `number, title, body, draft, html_url, created_at, head`. REST pull-request-simple [S1] has all of them. `head.ref` is the branch name. The code strips an `owner:` prefix from `head.ref || head.label` (line 614 (buildLiveSnap)), so either works.

Closed: code reads `number, title, body, merged, merged_at, closed_at, html_url`. The REST list schema has `merged_at` and `closed_at` but no `merged` boolean [S1]. The code computes `merged = !!(c.merged || c.merged_at)` (lines 906, 1073), so a missing `merged` is harmless. `merged_at` is non-null only for merged PRs. `sort=updated&direction=desc` are supported values [S1]. GraphQL has a `merged` field and a `MERGED` state, so it has no such gap.

Note: `GET /pulls` needs `pull_requests:read` [S2], not `issues:read`, even though PRs also appear in the issues list.

### list_branches (line 586)

`GET /branches` returns `name`, `commit.sha`, `protected` [S1]. The code reads `br.name` and `br.commit.sha`. Complete. Permission is `contents:read` [S2]. Only 100 per page: a repo with more than 100 branches needs pagination, which the artifact never did. The code's comment at line 678 says branches "today ... 403" through the connector; with a PAT that has Contents read this signal works.

### list_commits (line 704)

`GET /commits?sha={branch}&since={ISO}&per_page=3` [S1]: `sha` accepts a branch name and `since` is an ISO 8601 timestamp. The response has `sha, html_url, commit{message, author{date}, committer{date}}, author, committer`, which is every field the code reads (`commit.committer.date`, `commit.message` for the `Co-authored-by: Claude` test). Permission `contents:read` [S2]. One REST call per changed branch, as now. GraphQL could fetch many branches' history in one query.

## 2. Minimum token permissions

### Permission map (from [S2])

| Needed for | REST endpoints | Fine-grained permission | Classic scope (private repos) |
| --- | --- | --- | --- |
| Issues, sub-issues, dependencies | `/issues`, `/issues/{n}/sub_issues`, `/dependencies/*` | Issues: read | `repo` |
| Pull requests | `/pulls` | Pull requests: read | `repo` |
| Branches, commits (optional signal) | `/branches`, `/commits` | Contents: read | `repo` |
| Anything | all | Metadata: read (granted automatically with any repository permission) | none extra |

Metadata is shown as a `read`-only repository permission in [S3]. I did not find a statement that it is auto-granted in the sources read, but it is read-only and cannot be removed in the token form; treat it as always present.

So the minimum fine-grained set is **Issues: read, Pull requests: read, Contents: read** (Contents is only for branches and commits; without it only the "someone is working on branch X" signal goes dark, which is how the artifact already degrades, lines 518 to 523).

GraphQL: [S6] says "the data that you are requesting will dictate which scopes or permissions" the token needs, and that the API errors with the missing scopes. The documented per-endpoint map [S2] is REST only, so the exact fine-grained permission per GraphQL field is less visible. Assume the same three permissions and test.

### Fine-grained PAT [S3, S4]

- Public repositories: "Tokens always include read-only access to all public repositories on GitHub" ([S3], line 110 of the source). A fine-grained token can read public repos of any owner with no extra grant. Orgs "will still be able to read public resources" without approval ([S4]).
- Private repositories: the token needs the repository selected (or "All repositories") under its resource owner, plus the three permissions.
- One resource owner per token: "Each token is limited to access resources owned by a single user or organization" and the listed gap "Using a fine-grained PAT to access multiple organizations at once" [S3]. A single `GITHUB_TOKEN` therefore cannot read private repos for several owners. Options: classic PAT, or one fine-grained token per owner (a design change to `.env` and config).
- Outside or repository collaborator: [S3] lists "contribute to repositories where the user is an outside or repository collaborator" as a gap. The text is about contributing, so reading is not explicitly covered; the safe reading is that private repos of another user or org where you are only a collaborator need a classic PAT. Not verified.
- Org approval: organizations default to "Require administrator approval" for fine-grained tokens. A pending token "will only be able to read public resources" until an org admin approves it ([S3] line 118, [S4]). Org owners' own tokens do not need approval. Orgs can also block fine-grained tokens entirely, and then the org does not appear as a resource owner.
- Lifetime: default expiry in the creation form is 30 days; org default maximum is 366 days ([S3], [S4]).
- Account owned by a user (not an org): no approval step; resource owner = that user. Repos owned by other users that you do not collaborate on can only be read if public.

### Classic PAT [S5, S3, S4]

- Public repos only: no scope is needed ("a token with no assigned scopes can only access public information", [S3]); `public_repo` is the explicit scope [S5, S6].
- Private repos (any owner, org or user): `repo`. There is no read-only repo scope. `repo` grants read and write to code, plus org-owned resources [S5]. Note that Solaria only reads, so this is the main downside of classic tokens.
- `read:org` is not needed. Live check [S7]: the token used here carried `repo` among others, and the three endpoints answered.
- Orgs with SAML SSO: the classic token must be authorized for the org ([S3] step on SSO).
- Org policies: classic tokens are not subject to the approval policy, which applies only to fine-grained tokens, "unless the organization has restricted access by classic PATs" [S4]. Orgs can also impose a maximum lifetime on classic tokens.

### Which token to ask users for

| Situation | Token |
| --- | --- |
| Public repos only, any owners | Fine-grained, no permissions needed (or no-scope classic) |
| Private repos, one owner | Fine-grained, that owner as resource owner, selected repos, Issues/Pull requests/Contents read. Org may need admin approval. |
| Private repos, several owners, or collaborator access | Classic PAT with `repo` (plus SSO authorization), or one fine-grained token per owner |

## 3. Recommendation: REST, with GraphQL held in reserve

Recommend **REST** for the port.

- Fits "port, don't rewrite": REST payloads are snake_case with `html_url`, `repository_url`, `created_at`, which are the names the artifact's parsers (`whereOf`, `listOf`, `labelNames`) already handle. Changes are the transport, the `pull_request` filter, and `Link` pagination.
- Permissions are documented per endpoint [S2], so the README can state exact token settings. GraphQL permissions are less explicit [S6].
- Polling cost: REST supports conditional requests; a `304 Not Modified` "does not count against your primary rate limit" [S6]. The artifact's loop re-reads issues, PRs, branches and each map's sub-issues on every refresh, so most reads can be free. GraphQL has no equivalent.
- Rate budget is the same for both: 5,000 per hour for a PAT [S6]. A rough estimate (mine, not from the docs): with 10 repos, 3 list calls each plus one sub-issue call per map is about 40 calls per refresh, so refresh every 60 s would be about 2,400/h before 304s.
- REST costs: the `pull_request` filter, and N extra calls for sub-issues and commits.

Use GraphQL later only if call count becomes a problem. It can fetch issues, PRs and branches per repo in one query, and all maps' sub-issues in one aliased query, and it avoids the PR filter. The price is rewriting the parsers and giving up ETag caching.

## Open points

1. Do REST `sub_issues` include closed children? Not stated in the docs; test with a closed child before building. If not, use GraphQL `subIssues` or fetch the closed ones separately.
2. GraphQL rows for PRs, refs and commit history were not run here.
3. Whether a fine-grained token works for reading a private repo where the user is only a collaborator (the docs gap is worded around contributing).
4. Per-field fine-grained permissions for GraphQL are not published the way the REST map is.
