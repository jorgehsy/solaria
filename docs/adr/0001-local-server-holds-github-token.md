# A local server holds the GitHub token

The original artifact read GitHub through the claude.ai connector, which does not exist on a person's own machine. Solaria instead calls the GitHub API directly with the person's personal access token, and that token lives only in a small local Node server (`GITHUB_TOKEN` in `.env`), never in the browser. We chose this over a browser-only app (token pasted into the page and kept in browser storage) because it keeps the token out of the page, and lets one place cache responses to stay under GitHub's rate limit.

## Consequences

- Solaria needs Node to run; it is not a single static HTML file.
- The server is the only thing that talks to GitHub; the browser talks only to the server.
- Repos from several owners may each use their own token (`GITHUB_TOKEN_<OWNER>`, owner in capitals, `-` as `_`), with `GITHUB_TOKEN` as the fallback for owners without one. A fine-grained token reads private repos of one owner only, so this keeps people read-only without forcing a classic token.
