# Read GitHub with one GraphQL query per repo

The server reads each configured repo with a single GraphQL query on every poll. The query covers open issues with assignees, sub-issues and native blocked-by; open pull requests with `isDraft` and `closingIssuesReferences`; and the last 20 closed pull requests. REST is not used for reading.

The API research recommended REST: its permissions are documented per endpoint, and an ETag request answered `304` does not count against the rate limit. We still chose GraphQL, because Solaria's reading rule links a pull request to the issues GitHub says it closes (see `docs/repo-requirements.md`). The REST pull-request list has no such field. GraphQL has it as `closingIssuesReferences`, which we checked live on 2026-11-22 at a cost of 1 point. GraphQL also returns sub-issues and blocked-by inside the same query, where REST needs one extra call per issue. Without ETag, about 10 repos polled every 60 s cost roughly 600 points an hour, well under the 1,500 budget.

## Consequences

- There are no ETag caches and no per-endpoint REST rules in the poller. Each repo costs one query per poll.
- The token permissions stay the same: Issues and Pull requests read, plus Metadata. GraphQL does not publish a per-field permission map, so the fake-GitHub tests and the install guide must check a fine-grained token end to end.
- GitHub's parsers read GraphQL shapes (`OPEN`/`CLOSED` states, `nodes` connections, camelCase fields). Switching back to REST would mean rewriting them and finding another source for the PR-to-issue link.
