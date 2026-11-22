# Architecture

A short map of the code. The full picture is [docs/spec.md](docs/spec.md) section 3; the reasons are in [docs/adr/](docs/adr/).

```
GitHub GraphQL ──> apps/server ──SSE snapshot──> apps/web
                   poller, builder              controller, Scene (PixiJS), React overlays
```

| Path | What lives there |
|---|---|
| `apps/server/src/config` | Reads `solaria.config.json` and `.env`, picks the token per owner. |
| `apps/server/src/github` | The one GraphQL query per repo and the client that maps failures to the five error codes. |
| `apps/server/src/live` | The shared poller: cadence, rate-limit budget, last good data. |
| `apps/server/src/snapshot` | The builder: a pure function from GitHub replies to a snapshot. |
| `apps/web/src/live` | SSE client and the controller: latest snapshot, event queue (one per 1.5 s), 10-minute quiet redraw. |
| `apps/web/src/scene` | `Scene`: one plain TypeScript class that owns PixiJS, GSAP and d3 and draws every frame. |
| `apps/web/src/ui` | React overlays (header, tools, search, Activity log, legend, tooltip, cards) and `strings.ts`. |
| `packages/contract` | zod schemas shared by server and web: snapshot, statuses, error codes, config. |
| `packages/universe` | Pure model, no DOM or Node: view model, diff into Events, layout (Focus + Horizon), demo Universe. |
| `e2e` | Playwright specs and `fake-github.ts`, the stand-in GitHub the server talks to in tests. |

Rules that hold everywhere:

- Only the server holds tokens and talks to GitHub, and it only reads (ADR 0001).
- Signals come from issues and pull requests only, never branches or commits (ADR 0002).
- The server builds the snapshot; the browser diffs and animates (ADR 0003).
- React never holds Pixi objects; the Scene keeps its own maps (ADR 0005).
