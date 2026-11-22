# Solaria build spec

Build-ready handoff spec. It says WHAT to build. The ADRs in `docs/adr/` keep the WHY. Vocabulary is `GLOSSARY.md`; use its terms exactly (Universe, Galaxy, Focus, Horizon, Map, Sun, Planet, External Planet, Gas, Satellite, Event and the event tags Big Bang, Rift, Flare, Adopt, Comet, Close, Supernova, Fade). User-facing text is in `docs/copy/ui-strings.md` (the copy deck); this spec never restates it. What a repo must look like for Solaria is in `docs/repo-requirements.md`.

Each section ends with a `Source:` line. Issue numbers are `jorgehsy/solaria#N`.

Anchors: `#overview`, `#install`, `#architecture`, `#github-reading`, `#reading-rules`, `#snapshot`, `#diff-events`, `#layout`, `#errors`, `#chrome`, `#multi-owner`, `#testing`, `#slices`, `#sources`.

---

<a id="overview"></a>
## 1. Overview and scope

Solaria is an open-source, English-only tool run locally. A small Node server reads the GitHub issues and pull requests of the repos listed in `solaria.config.json`, using the user's own personal access token. A browser draws them as a spatial Universe (pan, zoom, watch changes). The artifact `reference/universo-artifact.html` ("Universo Blutions") is the behavioural reference, rebuilt, not ported.

In scope:
- Local Node server holding the token; the browser never sees it.
- Repos from several owners, one main token plus optional per-owner tokens.
- Reading conventions fixed, not configurable (same as the artifact, except the changes in [Reading rules](#reading-rules)). Map titles accept `Map: ` and `Mapa: `.
- Live Universe, Events, Activity log, search, Auto tour, demo mode (kept, also when live works).
- Focus + Horizon layout for many repos (laptop screens).
- Error and empty states drawn in space.
- Solaria wordmark top-left (replaces Blutions). English only. License MIT. README links `docs/repo-requirements.md`.

Out of scope:
- Configurable reading conventions (custom Map prefix, labels, branch patterns).
- A hosted or deployed version. No Docker, no `npx`, no `pnpm share` or tunnel.
- Writing to GitHub. Solaria only reads.
- Phone and small-screen layouts (laptop only in this stage).
- i18n or locale layer.
- Signals from branches, commits, commit trailers, the `en-curso` label, GitHub Actions, and the Claude-vs-human colour. Dropped; the events `agent`, `human`, `glow` and `action` do not exist.
- Webhooks (a local tool has no public endpoint).

Source: #1, #7 (dropped list), #11, ADR 0002.

---

<a id="install"></a>
## 2. Install, config and tokens

Commands:
- `corepack enable && pnpm install`.
- `pnpm dev`: contributors. Vite and the server on two ports; Vite proxies `/api`.
- `pnpm start`: users. Builds the web app once, then the server serves it on one port.

Runtime:
- Node `>=22.12.0` (set in `engines`).
- Server listens on `127.0.0.1` only, never on all interfaces. Default port `4747`; `PORT` changes it. It prints the URL and never opens the browser.
- `GITHUB_API_URL` overrides the GitHub base URL (used to point the server at the fake GitHub in tests; default is the real GitHub API).

Files, at the repo root, both git-ignored, copied by the user from `.env.example` and `solaria.config.example.json`. No wizard.
- `.env`: `GITHUB_TOKEN` (main token) and optional `GITHUB_TOKEN_<OWNER>`.
- `solaria.config.json`: exactly `{ "repos": ["owner/repo", ...] }`. No secrets, safe to share. Unknown keys mean a broken config and the server refuses to start. (Source: ticket #16 (handoff).)

Tokens:
- `GITHUB_TOKEN` is the main token. An owner may have its own `GITHUB_TOKEN_<OWNER>`: owner uppercased, `-` replaced by `_` (`my-org` becomes `GITHUB_TOKEN_MY_ORG`). It wins for that owner's repos. Tokens live in `.env` only, never in the config.
- `GITHUB_TOKEN` may be omitted if every configured owner has its own.
- A repo with no applicable token gets `bad_token` with a hint naming the variable to add (`GITHUB_TOKEN_ACME` or `GITHUB_TOKEN`). Other repos keep working.
- No fallback on failure: if an owner token fails, do not retry with the main token; show the error.
- Recommended token: fine-grained, read-only, Issues read + Pull requests read, plus Metadata read (implicit). No Contents permission. A classic `repo` token also works (needed for private repos; warn that it can write). Public repos need no permissions.
- Startup log: one line per repo, `owner/repo → TOKEN_NAME` (the variable name, never the secret).

Start-up outcomes:
| Situation | Behaviour |
|---|---|
| `solaria.config.json` missing | Server starts; demo mode runs, and the browser shows the demo Universe behind the "Demo mode: no token" card (see [Error and empty states](#errors)). Demo mode runs only in this case. (Source: ticket #16 (handoff).) |
| Config present but no usable token (no `.env`, or no token for any owner) | Not demo. Universe-wide `bad_token` card. (Source: ticket #16 (handoff).) |
| Config is bad JSON, wrong shape or has unknown keys (checked with zod) | Server refuses to start and prints the exact problem. |
| Port already in use | Print a message and exit. |
| Repo well-formed but does not exist | Server runs; that Galaxy shows `not_found`. |
| Duplicate config entries | `owner/repo` matched case-insensitively; duplicates collapse to one Galaxy; server logs a warning. |
| Config lists zero repos | Server runs; "No repos yet" card. |

Repo extras copied from grafito (CI and release workflows, `ARCHITECTURE.md`, `CONTRIBUTING.md`, `CODING_STANDARDS.md`, `SECURITY.md`, `CHANGELOG.md`, Code of Conduct) and the README/CHANGELOG content are decided in slice 1, not in this spec. Source: ticket #16 (handoff).

Source: #5, #9, #6 (item 3), ADR 0001, ADR 0004.

---

<a id="architecture"></a>
## 3. Architecture

Stack: pnpm + Turborepo monorepo, strict TypeScript (ESM), React + Vite (`apps/web`), Express (`apps/server`), Vitest + Playwright, ESLint flat config, plain CSS. Canvas libraries from npm: PixiJS, GSAP, d3.

Workspaces:
| Path | Contents |
|---|---|
| `apps/server` | Express. GitHub fetch and snapshot builder in separate folders; SSE; serves the built web app. The builder is a pure function: GitHub replies in, snapshot out. |
| `apps/web` | React + Vite. Folders under `src/`: `scene/`, `live/` (SSE client + controller), `ui/`, `demo/`. |
| `packages/contract` | zod schemas: snapshot, per-repo status, SSE messages, the 5 error codes, config shape. Shared by server and web. The JSON field names are defined once here during slice 3; this spec does not list them. |
| `packages/universe` | Pure, no DOM, no Node: view model, `diff`, layout, demo Universe (seeded random). |
| `packages/config` | Shared tsconfig and ESLint config. |

Browser rules:
- The canvas is one plain TypeScript `Scene` class (`apps/web/src/scene/`) that owns PixiJS, GSAP and d3, draws each frame and plays animations. One React component mounts it and hands it snapshots and events. React state never holds Pixi objects; the Scene keeps its own maps of Galaxies, Suns, Planets and trails.
- React renders only the DOM overlays: header/wordmark, tools bar, search, Activity log, legend, tooltip, error cards, demo panel.
- No store library. One TS controller holds the latest snapshot, the event queue (one event played per 1.5 s), the hidden/held/ghost sets and the 10-minute quiet redraw. React reads it via `useSyncExternalStore`.
- Layout is a pure function in `packages/universe`: (snapshot, viewport, reduced motion) to positions.
- Kept from the artifact, same behaviour: idle Auto tour, keyboard shortcuts, fullscreen, recenter.
- Demo mode runs entirely in the browser: when `solaria.config.json` is missing the server reports `mode: "demo"` with no GitHub data and the browser builds the demo Universe and demo-panel events locally. Works with no `.env`.

Source: #5, #11, ADR 0003, ADR 0004, ADR 0005.

---

<a id="github-reading"></a>
## 4. GitHub reading

Only the server talks to GitHub. Read-only. Transport is GraphQL, decided in [ADR 0006](adr/0006-read-github-with-graphql.md) (verified live 2026-11-22: `closingIssuesReferences` works and costs 1 point). Source: ticket #16 (handoff).

Query: one GraphQL query per repo on each poll, covering:
- open issues (with assignees, body for the `Blocked by:` line, `state`, `createdAt`, `updatedAt`);
- open PRs with `isDraft` and `closingIssuesReferences`;
- `subIssues` for each Map (closed children included; each child has its own state and repository);
- `blockedBy` (native blocked-by);
- the last 20 closed PRs (merged or not, with the issues they close) for the snapshot.

No branch or commit queries (ADR 0002). REST is only the fallback if GraphQL ever fails; no REST or ETag rules are specified.

Token permissions: fine-grained Issues read + Pull requests read, plus Metadata read; classic `repo` for private repos, none for public. A fine-grained token has one resource owner and reads private repos of that owner only. Orgs may require admin approval (until approved the token reads public data only) and classic tokens may need SSO authorization; both surface as `no_access` with a hint (see [Multi-owner](#multi-owner)).

Poller:
- One shared poller in the server, independent of how many browsers are open. Mandatory.
- Cadence: 60 s while at least one live SSE connection is open (a hidden tab still counts); 5 min when none is. On a new connection while in slow mode, poll GitHub immediately.
- Budget: Solaria spends at most 1,500 points/h. The full query costs about 4 points per repo per poll (measured in slice 4; the 1-point figure was `closingIssuesReferences` alone), so up to 6 repos poll every 60 s and more repos stretch the interval to stay under the cap (10 repos: about 96 s). GraphQL points are a separate 5,000/h bucket per user (not per token).
- Serialize requests. Read the rate-limit state on every response; below 20% remaining stretch the interval to 5 min; at 0 wait until reset; on 403/429 honour `retry-after`, else wait at least 60 s then back off exponentially. Surface this as `rate_limited` with the resume time (never retry in a loop).
- Log per-hour point counts.

Source: #2, #3, #10, ADR 0002, ADR 0003, ADR 0006, ticket #16 (handoff).

---

<a id="reading-rules"></a>
## 5. Reading rules

The user-facing explanation and tables are in `docs/repo-requirements.md`; do not duplicate them. A builder must implement:

- Only open issues are read (plus closed children of open Maps via sub-issues). Closed Maps disappear.
- **Map**: an open issue whose title starts with `Map: ` or `Mapa: ` AND that has at least one sub-issue. Drawn as a Sun. A Map without sub-issues is not a Map (its issue is Gas). A sub-issue titled `Map: …` never becomes a Planet. A parent without the prefix is not a Map and its sub-issues become Gas. Map titles are shown without the prefix.
- **Planet**: a sub-issue of a Map, orbiting that Sun. Map progress is "done of total", counting closed children.
- **Gas**: open issues of a repo that belong to no Map.
- **External Planet**: a sub-issue whose repo is not configured. Taken from the sub-issues response (no extra calls), orbits its Map's Sun, tagged "external", no PR signals.
- **Blocked**: a line in the issue body starting with `Blocked by:` followed by refs, OR GitHub's native blocked-by link. Blocked only while at least one blocker is open.
- **Refs**: `#N` = same repo; `repo#N` = same owner as the issue it is written in; `owner/repo#N` = any repo. A ref to a repo not in the config is not drawn and does not affect state; it appears as plain text in the issue's detail card ("blocked by other/lib#4 (not in your universe)"). A `Closes` ref to a repo not in the config is likewise not drawn and does not affect state; a PR has no detail card, so it appears as plain text in the PR's log line ("PR #12 opened, closes other/lib#4"), from the same reply, no extra call.
- **PR to issue link**: only GitHub's own list of issues a PR closes (closing keywords in the PR description and Development-box links). Never scan PR text; "see #42" is not a link.
- **Draft PR** linked: state Draft PR open ("doing"). **Ready PR** linked: In review.
- **State order**, first match wins: Done (closed), In review, Blocked, Draft PR open, To do.
- **Satellite**: any open issue, Maps included, with at least one assignee, in every open state; never on done issues. One Satellite labelled with the first login plus a count (`alice +2`); all names only on hover. Assigning does not change state.
- Issue identity everywhere is `owner/repo#N`.
- Search `#N` matches every repo; results show `owner/repo#N`.
- Closed PRs: the snapshot carries the last 20 per repo (see [Snapshot](#snapshot)).

Source: #6, #7, #10, #15, ADR 0002, `docs/repo-requirements.md`.

---

<a id="snapshot"></a>
## 6. Snapshot contract and SSE

The server builds the snapshot (the artifact's `buildLiveSnap` moves here) and pushes it whole. The browser never calls GitHub. Schemas live in `packages/contract` (zod).

Endpoints:
- SSE stream: pushes the full snapshot whenever anything changed; pushes a tiny "still fresh, checked at …" note when nothing changed. No patches.
- On connect: send the latest snapshot at once; if none exists yet send `loading`, then the snapshot.
- `GET /api/snapshot`: same JSON, no stream (tests and debugging).

Snapshot content:
- `mode`: `"demo"` (no GitHub data) or live.
- Universe: Galaxies (config order preserved), Maps with sub-issues, Planets, Gas, External Planets, per-issue state inputs (draft/ready PR links, blockers, assignees), refs to unconfigured repos (for the detail card).
- Last 20 closed PRs per repo (merged or not, when, which issues they close) so the browser tells a merge from a plain close.
- Universe status: `ok`, `loading` or `error` + code.
- Per-repo status: ok or not, `stale` flag, error code.
- Error codes, exactly five: `bad_token`, `no_access`, `not_found`, `rate_limited`, `network`. No others (org approval / SSO is `no_access` with a hint).
- A time the data was last checked (for "updated N ago").

Behaviour:
- A failing repo keeps its last good data, marked `stale`. It is never dropped, so no fake Close animations.
- The first snapshot draws the Universe and emits no events (no Big Bang storm on start). Source: ticket #16 (handoff).
- Browser gap rule: if the gap between snapshots exceeds 10 minutes (laptop asleep), redraw quietly like a first load and list the changes in the Activity log; under 10 minutes animate as usual.
- Whole-feed freshness: status text uses "updated ${ago}"; no new data for over 3 minutes shows the `statusTip.old` text.

Source: #8, ADR 0003, #9 (item 4), #14.

---

<a id="diff-events"></a>
## 7. Diff and events

`diff(old, new)` lives in `packages/universe`, pure, and returns typed events with no text; the UI writes the English text from the copy deck. Browser queue plays one event per 1.5 s; on the Auto tour the camera first travels to an event that is off screen or too small.

Event types (code name to user-facing tag):
| Code | Tag | Meaning |
|---|---|---|
| `bigbang` | Big Bang | new Map |
| `rift` | Rift | new issue, no Map (joins Gas) |
| `flare` | Flare | new issue born inside a Map |
| `adopt` | Adopt | existing issue added to a Map |
| `comet` | Comet | PR opened |
| `close` | Close | issue closed |
| `supernova` | Supernova | PR merged |
| `prgone` | Fade | PR closed without merging |

- Code names are never shown to users.
- A merged PR is shown with the Supernova tag and text even when it has no closing refs. The artifact emitted that case as `prgone`; the deck says to show Supernova anyway.
- An open issue that vanishes between snapshots is a Close event. Source: ticket #16 (handoff).
- A merged PR without closing refs: Supernova in the UI, `prgone` stays the internal code. Source: ticket #16 (handoff).
- No `assigned` event. `agent`, `human`, `glow`, `action` do not exist.
- The Satellite already shows assignment.
- Activity log ("Activity"): row = tag + sentence + ` · repo · ago`; Map titles shown without prefix inside «». Row buttons: show in the Universe, open on GitHub. Text per event is in copy deck section 5.
- Demo panel (key D, shown even when live works): one button per event (Big Bang, Rift, Flare, Adopt, Comet, Supernova, Fade; no Close button). Live-data demo events are pretend and vanish on the next refresh. Demo Universe is the fictional `acme` team in copy deck section 8, seeded random.

Source: #11 (items 3, 5, 7), #14, GLOSSARY.md, `docs/copy/ui-strings.md`.

---

<a id="layout"></a>
## 8. Layout

A pure function of snapshot + viewport + reduced motion, in `packages/universe`. Laptop only (target check: 1440x900 with 30 repos).

- **Focus**: the up to 3 Galaxies with the most open issues, full size, side by side in the centre, busiest in the middle. Ties break by config order. Fewer than 4 repos: every Galaxy is in Focus and there is no Horizon. A single repo is one centred full-size Galaxy.
- Focus is always automatic and recomputed from every snapshot. When a repo enters or leaves Focus it animates between its two places. Clicking a Horizon Galaxy only flies the camera to it; nothing swaps.
- **Horizon**: every other Galaxy, shrunk to about 30 px on screen (scaled 0.6 to 1x by the square root of its real size), spaced evenly on an ellipse near the screen edges, starting at 12 o'clock and going clockwise, in config-file order. If a ring is too crowded use a second, then a third inner ring. Repos with nothing open sit at the end.
- **Labels**: Focus Galaxies show the full `owner/repo` label with the open count. Horizon Galaxies show the repo name only, truncated with an ellipsis; full name on hover. Long labels truncate with "…".
- **Camera**: default fit frames Focus + Horizon together. Zoom and pan work as in the artifact; `0` recenters.
- Owner does not affect placement. Horizon order is config-file order. Source: ticket #16 (handoff).

Source: #13, #6 (items 1, 2), prototype `prototype/layout-many-repos`.

---

<a id="errors"></a>
## 9. Error and empty states

All shown inside the Universe, not in a banner or side panel. Wording is in copy deck section 7.

Rules:
1. A universe-wide problem is one centred card in space that names the next step with the exact `.env` line or config snippet.
2. One failing repo becomes a faint ghost Galaxy with a small card at its own spot: code title + hint.
3. Stale data stays drawn, dimmed, with a small card saying how old it is. No fake Close animations.
4. Empty is quiet, not an error: a faint italic line under the Galaxy.

| Case | What shows |
|---|---|
| No token / no `.env` (demo) | Demo Universe keeps running behind a blur/dim veil; centred card with the `cp` + `GITHUB_TOKEN=` lines. |
| Bad token (`bad_token`) | Shown when the token is rejected (401) or every repo fails; also when config exists with no usable token. Otherwise each failing repo is a ghost Galaxy. No Galaxies; centred card in empty space: token invalid or expired, how to make a new one. |
| Zero repos | Centred card with the `solaria.config.json` snippet. |
| Some repos failing | Healthy Galaxies normal. `no_access`: ghost + card with the SSO/approval hint or the `GITHUB_TOKEN_<OWNER>` snippet. `network`: last data kept, dimmed, card with age. |
| `not_found` | Ghost + card "check the name", with a did-you-mean when a close match exists. |
| `rate_limited` (whole Universe) | Card parked top-centre (not centred, so stale data stays visible) with resume time and countdown; Galaxies dimmed with small cards. |
| Repo with no Maps | Loose issues draw as Gas; card under it pointing to `docs/repo-requirements.md`. |
| Repo with no open issues | Empty Galaxy with a faint italic "owner/repo: no open issues". |
| Broken config | Terminal error: server refuses to start (see [Install](#install)). |
| WebGL missing or draw init fails | Cards `err.webgl.*` / `err.webgl.initFailed`. |

Universe-wide card rule: only a rejected token (401) or every repo failing. Source: ticket #16 (handoff).

Prototype (link only, never reuse code): `prototype/error-states`, `prototypes/error-states/index.html`, `?case=…&variant=C`.

Source: #12, #9 (items 4, 6), #14, `docs/repo-requirements.md`.

---

<a id="chrome"></a>
## 10. UI chrome

- **Wordmark** (variant D, orbit badge): top-left, in place of the Blutions eyebrow, a glass pill (same `--glass` / `--glass-line` as the tool buttons) holding an orbit glyph and **SOLARIA** in tracked uppercase (13 px, weight 600, about 0.24em letter-spacing, `--ink`). Glyph: 18 px dashed ring, a warm sun dot in the centre (`--human`), a tiny sky-blue planet circling every 6 s; the spin stops under `prefers-reduced-motion`. Below it the title **Universe** (30 px, weight 500). The status line (Demo pill, repo dots) stays under it. Existing tokens and DM Sans only; no new colours or fonts. Prototype: `prototype/wordmark`.
- **Legend** entries: Map, To do, Draft PR open, Blocked, In review, Assigned, Gas (no Map). Look as in the artifact.
- **Auto tour** (toggle, key `P`): after 2 minutes with no input the camera tours all Galaxies, Focus first, any input stops it at once; per artifact, about 7 s dwell per Galaxy and a slow 20 s drift. On by default unless reduced motion. State is remembered in `localStorage` key `solaria.tour`. Source: ticket #16 (handoff).
- Tools bar and keys, same as the artifact: `/` search, `P` Auto tour, `D` demo panel, `0` recenter, `F` full screen, arrows pan, `+`/`-` zoom.
- Search: finds issues and Maps by `#N`, `repo#N` or part of the title.
- Tooltips, status line, "updated ${ago}" timing, screen-reader description, all aria labels: copy deck sections 1 to 4.
- Strings: one plain English strings file in code, keys from the deck, no i18n. All strings of the deck must be present.

Source: #4, #14, #11 (item 9), `docs/copy/ui-strings.md`.

---

<a id="multi-owner"></a>
## 11. Multi-owner behaviour

- Repos from several owners are allowed. Token resolution per owner as in [Install](#install).
- Galaxy label is always `owner/repo` (Focus); issue key is `owner/repo#N` everywhere.
- Placement does not depend on owner or config order except as Focus tie-break (see [Layout](#layout)).
- A sub-issue in an unconfigured repo is an External Planet; a ref to an unconfigured repo is plain text in the detail card; neither triggers extra API calls.
- Org approval or SSO not granted: `no_access` with hint "Org needs to approve this token" or "Authorize this token for SSO at github.com/settings/tokens", plus the `GITHUB_TOKEN_<OWNER>` snippet. No new error code.
- Several tokens from one person share one 5,000/h rate-limit budget; the 1,500/h budget applies to the sum.

Source: #6, #9, ADR 0001.

---

<a id="testing"></a>
## 12. Testing

- **Vitest** on `packages/contract`, `packages/universe` (diff, layout, view model) and the server snapshot builder (pure function, fed saved JSON GitHub replies). No component tests; animations and the Scene are not unit tested.
- **Playwright** against a local fake GitHub (server started with `GITHUB_API_URL` pointing at it): app starts; demo banner/card shows with no files; search finds an issue; a new snapshot adds an Activity log line.
- The demo Universe uses a seeded random so tests and fixtures are stable.
- CI runs lint, typecheck, Vitest, Playwright.

Source: #11 (items 2, 6), ADR 0005.

---

<a id="slices"></a>
## 13. Build slices

Order: 1, then 2, then 3 first; 4 to 8 mostly parallel after 3; 9 last. Section links are anchors in this file.

| # | Slice | Sections | Done when |
|---|---|---|---|
| 1 | Skeleton + demo | [3](#architecture), [7](#diff-events) (demo part), [10](#chrome) (basics), [12](#testing) | `corepack enable && pnpm install && pnpm dev` opens the demo `acme` Universe (3 Galaxies, 4 Maps) on `127.0.0.1`; demo-panel buttons play events; monorepo, CI, Vitest on `diff` and the seeded demo pass. |
| 2 | Config + token loading | [2](#install), [11](#multi-owner) (token part) | `pnpm start` serves the app on `127.0.0.1:4747`; bad config exits with the exact problem; a missing `solaria.config.json` gives demo mode; config with no usable token gives the `bad_token` card; the startup log prints one `owner/repo → TOKEN_NAME` line per repo; duplicate config entries collapse with a warning. |
| 3 | Real GitHub, one repo | [4](#github-reading), [6](#snapshot), [5](#reading-rules) (basic Gas/To do/Done), [12](#testing) | With one configured repo the Universe shows its real open issues from `GET /api/snapshot` and the SSE stream; polls 60 s with a browser open and 5 min without; Playwright runs against the fake GitHub (`GITHUB_API_URL`) and sees a snapshot update arrive. |
| 4 | Repo reading rules | [5](#reading-rules), [7](#diff-events) (event derivation), [6](#snapshot) (closed PRs) | A fake-GitHub fixture repo with a Map, closed children, a `Blocked by:` line, a native blocker, a draft and a ready PR, and assignees shows Sun/Planets with correct states and Satellites (`alice +2`); builder Vitest tests cover each rule in the state order. |
| 5 | Several owners | [11](#multi-owner), [2](#install), [5](#reading-rules) (refs) | Repos of two owners with `GITHUB_TOKEN_<OWNER>` render; owner token wins and does not fall back; labels are `owner/repo`, keys `owner/repo#N`; External Planet and plain-text ref appear for unconfigured repos. |
| 6 | Events + animation + Activity log | [7](#diff-events), [6](#snapshot) (10-min gap), [10](#chrome) (search, keys) | A changed snapshot plays the matching animation (one event per 1.5 s) and adds an Activity row with the right tag; a gap over 10 minutes redraws quietly and logs changes; Playwright checks the log line. |
| 7 | Error and empty states | [9](#errors), [6](#snapshot) (status, stale) | Each case of the section 9 table can be triggered (fake GitHub returning 401/403/404/rate limit/network error) and shows the in-space card, ghost Galaxy, dimmed stale data or quiet empty line with the deck wording. |
| 8 | Many repos (Focus + Horizon) | [8](#layout) | With 3, 10 and 30 fixture repos the 3 busiest Galaxies are in Focus and the rest sit on the Horizon ring(s) with truncated labels and no overlaps at 1440x900; Focus recomputes on each snapshot; Vitest covers the layout function. |
| 9 | Finish | [10](#chrome), [4](#github-reading) (throttling), `docs/copy/ui-strings.md` | Orbit-badge wordmark, legend, Auto tour (2 min idle, `P`), all keyboard shortcuts and every copy-deck string are in place; README links `docs/repo-requirements.md`; repo extras (CHANGELOG, SECURITY, etc.) exist. |

Source: #1, #5, #11.

---

<a id="sources"></a>
## 14. Sources

Tickets (`jorgehsy/solaria`):
- Map: [#1](https://github.com/jorgehsy/solaria/issues/1)
- [#2](https://github.com/jorgehsy/solaria/issues/2) API calls and token permissions
- [#3](https://github.com/jorgehsy/solaria/issues/3) rate-limit budget
- [#4](https://github.com/jorgehsy/solaria/issues/4) wordmark
- [#5](https://github.com/jorgehsy/solaria/issues/5) install
- [#6](https://github.com/jorgehsy/solaria/issues/6) several owners
- [#7](https://github.com/jorgehsy/solaria/issues/7) repo requirements decision
- [#8](https://github.com/jorgehsy/solaria/issues/8) snapshot and SSE
- [#9](https://github.com/jorgehsy/solaria/issues/9) tokens across owners
- [#10](https://github.com/jorgehsy/solaria/issues/10) closed sub-issues
- [#11](https://github.com/jorgehsy/solaria/issues/11) apps and packages
- [#12](https://github.com/jorgehsy/solaria/issues/12) error and empty states
- [#13](https://github.com/jorgehsy/solaria/issues/13) many-repo layout
- [#14](https://github.com/jorgehsy/solaria/issues/14) UI strings
- [#15](https://github.com/jorgehsy/solaria/issues/15) repo-requirements guide
- [#16](https://github.com/jorgehsy/solaria/issues/16) this spec

ADRs: [0001](adr/0001-local-server-holds-github-token.md), [0002](adr/0002-signals-come-from-issues-and-prs-only.md), [0003](adr/0003-server-builds-the-snapshot-browser-animates.md), [0004](adr/0004-rebuild-on-grafito-stack.md), [0005](adr/0005-canvas-drawn-by-a-plain-pixi-scene-not-react.md), [0006](adr/0006-read-github-with-graphql.md).

Docs: [GLOSSARY.md](../GLOSSARY.md), [repo-requirements.md](repo-requirements.md), [copy deck](copy/ui-strings.md), reference artifact `reference/universo-artifact.html`.

Research (branches):
- [api-calls-and-token-permissions](https://github.com/jorgehsy/solaria/blob/research/api-calls-and-token-permissions/docs/research/api-calls-and-token-permissions.md)
- [github-rate-limit-budget](https://github.com/jorgehsy/solaria/blob/research/rate-limit-budget/docs/research/github-rate-limit-budget.md)

Prototypes (throwaway, link only, never reuse code): [prototype/error-states](https://github.com/jorgehsy/solaria/tree/prototype/error-states), [prototype/layout-many-repos](https://github.com/jorgehsy/solaria/tree/prototype/layout-many-repos), [prototype/wordmark](https://github.com/jorgehsy/solaria/tree/prototype/wordmark).

Supersessions applied: REST/ETag research recommendation overridden by ADR 0006 (GraphQL); research findings that assume branch/commit reading and Contents permission are overridden by #7 and ADR 0002; #5's "browser opens with a banner" is overridden by #12's in-space card; #6's config-order placement is overridden by #13's Focus + Horizon.
