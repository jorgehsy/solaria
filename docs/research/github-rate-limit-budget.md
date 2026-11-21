# GitHub API rate-limit budget for Solaria

Research for issue #3: how many GitHub API calls does one refresh cost, and how do we stay under the limit?
Researched 2026-11-21. Sources are GitHub's own docs (the `docs` repo content files that render docs.github.com) and the artifact source `reference/universo-artifact.html`.

## Short answer

- The artifact's behavior, ported 1:1 to REST, costs `60 x [ sum over repos (issue pages + 2) + M + C ]` calls per hour. That is about 740/h at 3 repos and 2,500/h at 10 repos, against a 5,000/h personal-token limit. It is fine for one poller and breaks as soon as unshared pollers multiply it.
- The biggest levers, in order: one shared server-side poller (never one poller per tab), one batched GraphQL query for all repos (about 1 to 11 points per refresh instead of about 40 calls), ETag conditional requests (304 is free), then a slower or adaptive poll.
- Recommended for ~10 repos: a single server-side poller, 60 s while a browser tab is open and 5 min when none is, GraphQL batching (or REST with ETag), a budget of at most 1,500 requests or points per hour, and a throttle on `x-ratelimit-remaining`.

## 1. Limits (primary sources)

Paths below are content files in the `docs` repo that publishes docs.github.com.

| Fact | Source |
|---|---|
| REST, personal access token: 5,000 requests/hour per user. Shared with every other use of that user's token (other apps, `gh`, scripts). | `data/reusables/rest-api/primary-rate-limit-authenticated-users.md` |
| GraphQL: 5,000 **points**/hour per user, separate bucket from REST. Minimum cost of a call is 1. | `content/graphql/overview/rate-limits-and-query-limits-for-the-graphql-api.md` |
| GraphQL point formula: add up the number of requests needed to fulfil each connection (assume `first`/`last` limits are reached), divide by 100, round. Node limit 500,000 per call. | same page, "Predicting the point value of a query" and "Node limit" |
| Conditional `GET` with `If-None-Match`/`If-Modified-Since` returning **304 does not count against the primary limit**, provided the request carries a valid `Authorization` header. | `content/rest/using-the-rest-api/best-practices-for-using-the-rest-api.md`, "Use conditional requests" |
| Conditional requests are not supported for unsafe methods (POST etc.). GraphQL is POST, so ETag does not apply to it. Nothing in the GraphQL rate-limit page mentions conditional requests. | same best-practices page |
| 304s stay stable only if requests are identical (same page size, filter, params) and sort order is stable. `sort=updated` reorders pages and defeats 304. | same page, "Make requests that can be cached" |
| Secondary limits: max 100 concurrent requests (REST+GraphQL combined); 900 points/min per REST endpoint, 2,000 points/min GraphQL; 90 s CPU per 60 s real time (60 s of it GraphQL); content-creation caps (irrelevant, Solaria is read-only). Most REST GET = 1 point, GraphQL non-mutation = 1 point. Limits are "subject to change without notice". The docs do not say whether a 304 costs secondary points. | `data/reusables/rest-api/secondary-rate-limit-rest-graphql.md` |
| Best practice: prefer webhooks to polling; if polling, fixed schedule, honor `x-poll-interval` if sent, use conditional requests, make requests serially instead of concurrently. | best-practices page, "Avoid polling" and "Avoid concurrent requests" |
| On limit: 403/429. Honor `retry-after`; if `x-ratelimit-remaining` is 0 wait until `x-ratelimit-reset`; otherwise wait at least 1 minute, then back off exponentially. Continuing while limited may get the integration banned. | `content/rest/using-the-rest-api/rate-limits-for-the-rest-api.md`, "Exceeding the rate limit" |
| Response headers `x-ratelimit-limit/remaining/used/reset/resource`. `GET /rate_limit` does not count against the primary limit. | same page, "Checking the status of your rate limit" |
| REST "Issues" endpoints also return pull requests (identify by the `pull_request` key). GraphQL `issues` does not. | docs.github.com/en/rest/issues/issues (note at top) |
| A timeout deducts extra points from the primary limit for the next hour. | GraphQL rate-limit page, last section |

Not verified: whether the GraphQL `Issue` type exposes sub-issues as a connection (the objects reference page was not retrievable in this pass). REST has "List sub-issues" (`/repos/{o}/{r}/issues/{n}/sub_issues`). Check before committing to GraphQL for the sub-issue edge.

## 2. What one refresh costs today

From `reference/universo-artifact.html` (the MCP `watchTool` data layer). Each watch re-fetches every `POLL` = 60 s (`WATCH_OPTS.refetchInterval`).

| Call | Where | Frequency |
|---|---|---|
| `list_issues` open, `perPage: 100`, paged by cursor | `reconcileLive` | every poll, `P_r` pages per repo (`ceil(open issues / 100)`, at least 1) |
| `list_pull_requests` open, `perPage: 100` | `reconcileLive` | every poll, 1 per repo |
| `list_branches`, `perPage: 100` (first page only) | `reconcileLive` | every poll, 1 per repo |
| `issue_read get_sub_issues` per open Map issue | `reconcileLive` | every poll, 1 per map (`M` total) |
| `list_commits` (`perPage: 3`, `since` = 30 min) | `onBranches` / `fetchCommits` | only for `<type>/<N>-slug` or `claude/*` branches whose SHA changed since last poll and whose issue is open; capped at 12 per repo on the first delivery, 30 after. Serialized through `commitChain`. |
| `list_pull_requests` closed, `perPage: 20` | `closedPrs` | once per repo at startup (log), plus once per repo each time an open PR disappears |

`WORK_TTL` (30 min) is not a poll interval: it only sets how long a commit keeps an issue "worked on" and the `since` window. It does not add calls.

**Formula (REST, one poller):**

```
refresh   = sum_r (P_r + 2) + M          (+ C commit calls when branch SHAs changed)
per hour  = 60 x (sum_r (P_r + 2) + M) + pushes/h
startup   = N closed-PR calls + up to 12N commit calls (one-time burst)
```

with `N` repos, `P_r` issue pages, `M` open maps, and `pushes/h` the number of SHA changes on matching branches (one commit call each). With all `P_r = 1`: base refresh = `3N + M`.

Worked numbers (assumptions stated):

| Scenario | Assumptions | Calls/refresh (base) | Calls/hour | % of 5,000 |
|---|---|---|---|---|
| N=3 | 1 issue page/repo, 1 map/repo (M=3), 2 active branches/repo x 3 pushes/h (18 commit calls/h) | 12 | 720 + 18 = **~740** | 15% |
| N=10 | same per-repo shape (M=10, 60 commit calls/h) | 40 | 2,400 + 60 = **~2,460** | 49% |
| N=10, heavy | 2 issue pages/repo, 2 maps/repo (M=20), same branches | 60 | 3,600 + 60 = **~3,660** | 73% |
| N=10, 3 unshared pollers | e.g. three tabs each with its own poller, base case | 120 | **~7,400** | over the limit |

Startup burst at N=10: 10 x 3 + 10 + 10 closed + up to 120 commits = about 170 calls once.

Caveats: the artifact never paginates branches past 100, so heavy repos silently lose branch signals. On REST, `/issues` includes PRs, so `P_r` counts open issues plus open PRs. Secondary limits are not the problem at this rate: about 40 serial requests per minute is far below 900 points/min, and serialized calls stay far below 100 concurrent.

## 3. Levers

Savings are against the N=10 base case (~2,460/h).

| Lever | Effect | Notes |
|---|---|---|
| **Shared server-side poller + cache** | Cost no longer scales with tabs/clients. Removes the 3x blowup above. | Mandatory. Server polls once and serves all browsers from memory (SSE or plain `GET /state`). Poll only while at least one client is connected. |
| **GraphQL batching, all repos in one query** | 60 queries/h. Per the point formula, per repo `issues(first:100)`, `pullRequests(first:100)`, `refs(first:100)` is about 10 x 4 = 40 requests, so 1 point. With nested `history(first:1)` on each ref (this also returns last-commit date and message, which replaces all `list_commits` calls) about 10 x 103 = 1,030 requests, so about 10 points. Result: **60 to ~660 points/h** versus 2,460 calls/h on REST. | No ETag on GraphQL, so unchanged data still costs points, but the cost is already tiny. Separate 5,000-point bucket from REST. Sub-issue edge needs checking (section 1). Stay under the 500k node limit. |
| **REST + ETag conditional requests** | Each unchanged poll is free of primary limit. If 80 to 90% of polls return 304, 2,400/h becomes ~240 to 480/h. | Only helps while the list is unchanged: any edit or comment on any open issue changes the issues list response, so an active repo refreshes often. Never use `sort=updated`; keep params identical per poll. The hit rate is an estimate, not a measurement. Secondary-point treatment of 304 is undocumented. |
| **Slower poll** | Linear: 120 s halves the per-poll cost, 300 s cuts it by 5 (about 500/h for the base case). | Commit calls do not shrink. Costs freshness; the artifact shows "updated N s ago". |
| **Skip branches/commits** | Removes `N` branch calls per refresh plus commit calls: 10 of 40 calls (-25%) at N=10. | Loses the "someone is working" glow; the `en-curso` label signal remains. Under GraphQL this is nearly free, so not worth giving up. |
| **Webhooks/events** | Best practice per GitHub. | A local-only tool has no public endpoint. Out of scope; the Events API with `x-poll-interval` is a possible later optimization. |

## 4. Recommendation for ~10 repos

Target: **at most ~1,500 requests (REST) or points (GraphQL) per hour in steady state (30% of 5,000)**, leaving room for the user's other use of the same token.

Design:

1. One poller in the Node server, independent of the number of browser tabs. Results live in memory; browsers read the cache. No per-client GitHub calls.
2. Poll every 60 s while a client is connected (SSE or a recent `GET /state`). With no client connected, poll every 5 min or pause. Do not poll for a hidden tab (the browser reports visibility to the server).
3. Preferred transport: one GraphQL query for all repos (issues, open PRs, branch refs with last-commit data, maps' sub-issues if the edge exists). Estimated 60 to ~660 points/h, no commit fan-out.
4. If REST wins instead: send `If-None-Match` for every list call and store the ETag per URL; keep params constant and the default sort; fetch commits only for branches whose SHA changed; fetch closed PRs only when an open PR vanishes (as today). Expected 250 to 800/h, worst case ~2,460/h.
5. Serialize requests (concurrency cap about 4) to stay clear of the secondary limits.
6. Read `x-ratelimit-remaining` on every response. Below 20%, stretch the interval to 5 min; at 0, wait for `x-ratelimit-reset`; on 403/429 honor `retry-after`, else wait at least 60 s then back off exponentially. Show the state in the UI ("rate limited until HH:MM") instead of retrying.
7. Log per-hour call and point counts so real figures can replace the assumptions here.

Open assumptions to measure once code exists: real ETag hit rate, typical open-issue counts per repo, number of maps and pushes per hour, and the point cost reported by `rateLimit { cost }` for the final query.
