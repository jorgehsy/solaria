# The server builds the snapshot; the browser only animates

The artifact did everything in the browser: it fetched GitHub data, built a snapshot of issues, Maps and pull requests, compared it with the previous one and turned the differences into animations. In Solaria the local server fetches GitHub and builds the snapshot, then pushes the full snapshot to the browser over server-sent events (SSE) whenever it changes, with a small "still fresh" note when it doesn't. The browser keeps only the compare-and-animate part (the artifact's `diff` and scene code), unchanged.

We chose this over a thin authenticated proxy (the browser keeps the artifact's fetch-and-build logic and the server only adds the token) because the server already has to run the single shared poller that the rate-limit budget requires, and it is the only place that holds the token. Building the snapshot there means the browser never needs GitHub's response shapes, and the port swaps exactly one layer. SSE won over browser polling because the number of open connections tells the server whether anyone is watching (60 s polls while someone is, 5 min when nobody is), and news reaches the browser right after the server's poll.

## Consequences

- One endpoint carries the live picture (an SSE stream), plus `GET /api/snapshot` returning the same JSON for tests and debugging.
- The snapshot also carries the last 20 closed pull requests per repo, so the browser can tell a merge from a plain close without calling GitHub.
- Errors live inside the snapshot: a status for the whole universe and one per repo, using a fixed set of codes (`bad_token`, `no_access`, `not_found`, `rate_limited`, `network`).
- A repo that fails keeps its last good data, marked stale, so a hiccup never shows as a burst of fake "closed" animations.
- After a gap of more than 10 minutes (laptop asleep), the browser redraws quietly like a first load and lists the changes in the log instead of animating them.
- Demo mode stays entirely in the browser and needs no server data or token.
