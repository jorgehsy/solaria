# Solaria UI copy deck (English)

All UI text lives in one plain English file in code later (no i18n, no locale layer). Keys below are suggestions for that file. `${x}` marks a runtime value. "Artifact L" refers to `reference/universo-artifact.html`.

Voice: space words for events and objects, short and playful, with the GitHub word (issue, PR, repo) always nearby. Status and error text stays neutral and never uses "I". Users never see code names (`bigbang`, `prgone`, `glow`...), only the space names. Map titles in log lines and search are shown without the `Map: ` prefix, inside «».

## 1. Brand / header

| key | English | notes |
|---|---|---|
| `brand.pageTitle` | Solaria | Browser `<title>`. Artifact L2 |
| `brand.badge` | SOLARIA | Wordmark badge above the title (replaces the Blutions eyebrow). Artifact L279 |
| `brand.title` | Universe | h1 under the badge. Artifact L280 |
| `brand.ariaLabel` | Solaria Universe | Canvas/root aria-label. Artifact L273 |
| `status.badgeDemo` | Demo | Badge in status line. Artifact L1094 |
| `status.demoText` | demo data | Status dot text in demo mode. Artifact L1094 |
| `status.loading` | loading | Status text while the first snapshot loads. Artifact L1098 |
| `status.updated` | updated ${ago} | Status text when fresh. Artifact L1105 |
| `status.updatedAria` | Updated ${ago}. ${why} | aria-label of the status dot. Artifact L1105 |
| `universe.srDescription` | ${ni} open issues in ${maps} Maps, across ${repos} repos. Each repo is a Galaxy; each Map is a Sun with its issues in orbit. Issues with no Map drift as a reddish cloud of Gas. | Screen-reader only. Artifact L1420 |

## 2. HUD & legend

| key | English | notes |
|---|---|---|
| `legend.aria` | Legend | aria-label of the legend. Artifact L294 |
| `legend.map` | Map | Sun swatch. Artifact L295 |
| `legend.todo` | To do | Planet with no PR. Artifact L296 |
| `legend.draftPr` | Draft PR open | Planet whose PR is a draft (was "En curso"). Artifact L297 |
| `legend.blocked` | Blocked | Artifact L298 |
| `legend.inReview` | In review | Planet with a ready PR. Artifact L299 |
| `legend.assigned` | Assigned | Satellite swatch (was "Alguien trabaja"). Artifact L300 |
| `legend.gas` | Gas (no Map) | Gas swatch (was "Sin mapa"); glossary term shown next to the plain meaning. Artifact L301 |
| `state.todo` | To do | State chip in tooltip. Artifact L334 |
| `state.draftPr` | Draft PR open | State chip in tooltip. Artifact L334 |
| `state.blocked` | Blocked | State chip in tooltip. Artifact L334 |
| `state.inReview` | In review | State chip in tooltip. Artifact L334 |
| `state.done` | Done | State chip in tooltip. Artifact L334 |
| `galaxy.open` | ${n} open | Galaxy label count (same for 1 and many). Artifact L1511; prototype error-states |
| `galaxy.nothingOpen` | nothing open | Galaxy label when no open issues. Artifact L1511; prototype |
| `galaxy.noData` | no data | Galaxy label when the repo could not be read at all. Prototype error-states |
| `map.progress` | ${done} of ${total} | Map label sub-line. Artifact L1476 |
| `map.noSubIssues` | no sub-issues | Map label sub-line with no children. Artifact L1476 |
| `map.subIssuesFailed` | Couldn't read its sub-issues | Map label sub-line on read failure (neutral voice). Artifact L1476 |
| `map.aria` | Map ${title}: ${done} of ${total} done | aria-label of a Map label. Artifact L1475 |
| `satellite.one` | ${assignee} | Satellite label, single assignee (e.g. `alice`) |
| `satellite.many` | ${assignee} +${rest} | Satellite label, several assignees (e.g. `alice +2`) |
| `time.logNow` | now | Log `ago`. Artifact L441 |
| `time.logMin` | ${m} min | Log `ago`. Artifact L441 |
| `time.logHour` | ${h} h | Log `ago`. Artifact L441 |
| `time.logDay` | ${d} d | Log `ago`. Artifact L441 |
| `time.justNow` | just now | Status line / hover age. Artifact L1085 |
| `time.secAgo` | ${n} s ago | Artifact L1086 |
| `time.minAgo` | ${m} min ago | Artifact L1088 |
| `time.hourAgo` | ${h} h ago | Artifact L1089 |
| `time.inMin` | in ${m} min | Rate-limit countdown. Prototype error-states |

## 3. Tooltips / hover cards

| key | English | notes |
|---|---|---|
| `tip.sunChip` | Map · ${done} of ${total} done | Chip on a Sun tooltip. Artifact L2300 |
| `tip.planetAssigned` | · assigned to ${names} | Appended to the Planet chip; names comma-separated (`alice, bob`). Artifact L2300 |
| `tip.ref` | ${repo} #${n} · ${mapTitle} | Reference line under the title |
| `tip.openOnGithub` | Open on GitHub | Link shown on touch devices. Artifact L2301 |
| `tip.external` | external | Tag on an External Planet's card (sub-issue in a repo not in the config). Spec section 5 |
| `tip.outsideBlocker` | blocked by ${ref} (not in your universe) | One line per blocker in a repo not in the config (`other/lib#4`). Plain text, no link. Spec section 5 |
| `tip.hitAria` | ${repo} #${n}: ${title} | aria-label of the hit target. Artifact L2305 |
| `log.showInUniverse` | Show in the Universe | Title of the log row button. Artifact L1032 |
| `log.openOnGithub` | Open on GitHub | Title of the log external link. Artifact L1032 |
| `log.openOnGithubAria` | Open on GitHub: ${text} | aria-label of the log external link. Artifact L1032 |
| `statusTip.demo` | Demo data. Add a GitHub token to see your own repos. | Status dot hover in demo mode. Artifact L1093 (second sentence rewritten: claude.ai connector gone) |
| `statusTip.ok` | All good. Checking GitHub every minute. | Status dot hover, healthy. Artifact L1101; 60 s poll while a browser is open (rate-limit decision) |
| `statusTip.stale` | Couldn't read ${repos}. Showing data from ${age}. | Status dot hover, some repos failed. Artifact L1102 |
| `statusTip.old` | No new data from GitHub for over 3 minutes. Showing data from ${age}. | Status dot hover, whole feed old. Artifact L1103 |

## 4. Controls, search & keyboard

| key | English | notes |
|---|---|---|
| `tool.search` | Search (key /) | aria-label and title. Artifact L284 |
| `tool.tourOn` | Auto tour: on (key P) | Artifact L2538 |
| `tool.tourOff` | Auto tour: off (key P) | Artifact L2538 |
| `tool.demo` | Demo mode (key D) | Artifact L286 |
| `tool.recenter` | Recenter (key 0) | Artifact L287 |
| `tool.fullscreenEnter` | Full screen (key F) | Artifact L2630 |
| `tool.fullscreenExit` | Exit full screen (key F) | Artifact L2630 |
| `search.dialogAria` | Search the Universe | Artifact L291 |
| `search.placeholder` | #123, repo#123 or part of the title | Artifact L292 |
| `search.inputAria` | Search for an issue or Map | Artifact L292 |
| `search.resultsAria` | Results | Artifact L293 |
| `search.noResults` | Nothing matches «${q}». | Artifact L2598 |

## 5. Activity log events

Log row = tag + sentence, then ` · ${repo} · ${ago}`. `${refs}` is a comma list of `repo#n` (repo omitted when same repo). Tags are never lowercase code names.

| key | English | notes |
|---|---|---|
| `log.aria` | Activity | Panel name and `<ol>` aria-label. Artifact L292 ("Bitácora") |
| `log.row` | ${text} · ${repo} · ${ago} | Row layout |
| `log.bigbang.tag` | Big Bang | New Map. Artifact L1057 |
| `log.bigbang.text` | New Map «${title}» | Only emitted on first load by the original; demo button also creates it |
| `log.rift.tag` | Rift | New issue with no Map (lands in Gas). Artifact L844, L1059 |
| `log.rift.text` | New issue #${n} | |
| `log.flare.tag` | Flare | New issue that joins a Map. Artifact L843, L1059 |
| `log.flare.text` | #${n} joins «${map}» | |
| `log.adopt.tag` | Adopt | Existing issue added to a Map. Artifact L849 |
| `log.adopt.text` | #${n} added to «${map}» | |
| `log.comet.tag` | Comet | PR opened. Artifact L863, L1062 |
| `log.comet.textRefs` | PR #${pr} opened, closes ${refs} | PR with closing refs |
| `log.comet.text` | PR #${pr} opened | PR with no closing refs |
| `log.close.tag` | Close | Issue closed. Artifact L871, L1060 |
| `log.close.text` | #${n} closed | No demo button exists for this event |
| `log.supernova.tag` | Supernova | PR merged. Artifact L908, L1064, L1075 |
| `log.supernova.textRefs` | PR #${pr} merged, closes ${refs} | |
| `log.supernova.text` | PR #${pr} merged | Code quirk: merged PRs with no closing refs are emitted as `prgone` (Artifact L910); show the Supernova tag and this text anyway |
| `log.fade.tag` | Fade | PR closed without merging (`prgone`). Artifact L911 |
| `log.fade.text` | PR #${pr} closed without merging | |

## 6. Demo panel

| key | English | notes |
|---|---|---|
| `demo.title` | Demo mode | Panel heading. Artifact L305 |
| `demo.kbd` | D | Key chip. Artifact L305 |
| `demo.noteDemo` | Try each event on the demo Universe. | Note when data is the demo universe. Artifact L2424 |
| `demo.noteLive` | Try each event on your own data. It's pretend: it disappears on the next refresh. | Note when data is live. Artifact L2424 |
| `demo.bigbang.label` | Big Bang | Button. Artifact L2401 |
| `demo.bigbang.hint` | New Map | |
| `demo.rift.label` | Rift | Button |
| `demo.rift.hint` | New issue, no Map | |
| `demo.flare.label` | Flare | Button |
| `demo.flare.hint` | New issue joins a Map | |
| `demo.adopt.label` | Adopt | Button |
| `demo.adopt.hint` | Existing issue added to a Map | |
| `demo.comet.label` | Comet | Button |
| `demo.comet.hint` | PR opened | |
| `demo.supernova.label` | Supernova | Button |
| `demo.supernova.hint` | PR merged | |
| `demo.fade.label` | Fade | Button (event `prgone`) |
| `demo.fade.hint` | PR closed without merging | |
| `demo.testPrTitle` | Test PR | Title of the PR the Comet button creates. Artifact L2483 (no "Example:" prefix) |

## 7. Status, errors & empty states

Neutral voice, no "I". Prototype `error-states` wording kept verbatim except as noted. `${code}` is one of `bad_token`, `no_access`, `not_found`, `rate_limited`, `network`.

| key | English | notes |
|---|---|---|
| `err.allFailed.title` | Couldn't read GitHub. | Artifact L602, L1115 (default title) |
| `err.allFailed.text` | GitHub didn't respond. Trying again on the next refresh. | Artifact L602 |
| `err.webgl.title` | This screen needs WebGL. | Artifact L1188, L1196 |
| `err.webgl.text` | Your browser doesn't have it enabled. Try an up-to-date Chrome, Edge or Safari, or turn on hardware acceleration. | Artifact L1188 |
| `err.webgl.initFailed` | Couldn't start drawing in your browser. Try an up-to-date Chrome, Edge or Safari. | Artifact L1196 |
| `code.bad_token` | Token rejected | Per-repo code title. Prototype error-states |
| `code.no_access` | No access | |
| `code.not_found` | Repo not found | |
| `code.rate_limited` | Rate limited | |
| `code.network` | Can't reach GitHub | |
| `repo.staleAge` | Showing data from ${age}. | Line on a ghost Galaxy card. Prototype error-states C |
| `universe.demoNoToken.title` | Demo mode: no token | Universe-level card |
| `universe.demoNoToken.hint` | No .env or solaria.config.json found, so Solaria is showing made-up demo data. Copy the example files, add your token, then restart. | |
| `universe.demoNoToken.snippet` | cp .env.example .env<br>cp solaria.config.example.json solaria.config.json<br># then edit .env:<br>GITHUB_TOKEN=github_pat_xxxxxxxx | Code block |
| `universe.badToken.title` | GitHub rejected the token | |
| `universe.badToken.hint` | The token in .env is invalid or expired. Make a new fine-grained read-only token (Issues + Pull requests: read), put it in .env, then restart. | |
| `universe.badToken.snippet` | GITHUB_TOKEN=github_pat_xxxxxxxx | |
| `universe.noRepos.title` | No repos yet | |
| `universe.noRepos.hint` | The token works, but solaria.config.json lists no repos. Add at least one as owner/repo, then restart. | |
| `universe.noRepos.snippet` | { "repos": ["acme/web", "acme/api"] } | Prototype used `acme/website`, `acme-corp/api`; changed to match the demo owner |
| `universe.rateLimited.title` | GitHub rate limit reached | |
| `universe.rateLimited.hint` | GitHub's hourly limit for this account is used up. Nothing to fix: Solaria resumes at ${time} (${countdown}). Other tools on the same GitHub account share this limit. | Prototype placeholders `{time}`, `{cd}` |
| `repo.noAccess.hint` | Org ${org} has not approved this token. Authorize it for SSO at github.com/settings/tokens, or ask an org owner to approve it. Or give this org its own token: | Prototype hard-coded `acme-corp` |
| `repo.noAccess.snippet` | GITHUB_TOKEN_${ORG}=github_pat_xxxxxxxx | Prototype: `GITHUB_TOKEN_ACME_CORP=...` |
| `repo.network.hint` | Can't reach api.github.com. Showing the last good data. Check your connection; Solaria retries on its own. | |
| `repo.notFound.hint` | GitHub has no repo ${repo}. Check the spelling in solaria.config.json (did you mean ${suggestion}?). | Prototype: `acme/dcos`, `acme/docs` |
| `repo.notFound.snippet` | "repos": ["${suggestion}"] | |
| `repo.rateLimited.hint` | Showing the last good data until the limit resets. | Per-repo rate-limit hint |
| `repo.noMaps.hint` | These issues belong to no Map yet. Open an issue titled "Map: …" and add sub-issues to it. See docs/repo-requirements.md. | NOMAPS_HINT |
| `repo.noMaps.title` | No Maps yet | Card title on the Gas |
| `repo.noOpenIssues` | ${repo}: no open issues | Quiet line under an empty Galaxy |

## 8. Demo universe data

Owner `acme`, three repos, 4 Maps, 26 Planets, 4 Gas issues, 30 issues in total plus the 4 Map issues. Titles carry the `Map: ` prefix in data (shown without it in the UI). Numbers are suggestions for stable fixtures.

### Repos

| key | English | notes |
|---|---|---|
| `demo.repo.web` | acme/web | Hosts Dark mode and the Gas |
| `demo.repo.api` | acme/api | Hosts Email alerts and Usage dashboard |
| `demo.repo.mobile` | acme/mobile | Hosts Offline mode |

### Maps and issues

| key | English | notes |
|---|---|---|
| `demo.map.dark` | Map: Dark mode | acme/web #10 |
| `demo.dark.1` | Add a dark mode toggle | #11 |
| `demo.dark.2` | Dark palette for charts | #12 |
| `demo.dark.3` | Remember the theme choice | #13 |
| `demo.dark.4` | Follow the system theme | #14 |
| `demo.dark.5` | Fix button contrast in dark mode | #15 |
| `demo.dark.6` | Dark logo variant | #16 |
| `demo.dark.7` | Dark theme for code blocks | #17 |
| `demo.dark.8` | Document the theme tokens | #18 |
| `demo.map.usage` | Map: Usage dashboard | acme/api #40 |
| `demo.usage.1` | Track API calls per key | #41 |
| `demo.usage.2` | Monthly usage chart | #42 |
| `demo.usage.3` | Budget alert | #43 |
| `demo.usage.4` | Export usage to CSV | #44 |
| `demo.map.alerts` | Map: Email alerts | acme/api #30 |
| `demo.alerts.1` | Email template for alerts | #31 |
| `demo.alerts.2` | Group repeated alerts | #32 |
| `demo.alerts.3` | Mute an alert rule | #33 |
| `demo.alerts.4` | Link to the issue in the email | #34 |
| `demo.alerts.5` | Daily summary email | #35 |
| `demo.alerts.6` | Clean up old alerts | #36 |
| `demo.alerts.7` | Log response times | #37 |
| `demo.alerts.8` | Document the alert format | #38 |
| `demo.map.offline` | Map: Offline mode | acme/mobile #50 |
| `demo.offline.1` | Cache the home screen | #51 |
| `demo.offline.2` | Queue edits while offline | #52 |
| `demo.offline.3` | Show an offline banner | #53 |
| `demo.offline.4` | Sync when back online | #54 |
| `demo.offline.5` | Resolve edit conflicts | #55 |
| `demo.offline.6` | Test on slow networks | #56 |

### Gas (acme/web, no Map)

| key | English | notes |
|---|---|---|
| `demo.gas.1` | Sort the sidebar | #20 |
| `demo.gas.2` | New icon for Drafts | #21 |
| `demo.gas.3` | Empty-state text | #22 |
| `demo.gas.4` | Check contrast on the login page | #23 |

### Pull requests and Satellites

| key | English | notes |
|---|---|---|
| `demo.pr.1` | Add a dark mode toggle | acme/web PR #60, ready for review, closes #11 |
| `demo.pr.2` | Link to the issue in the email | acme/api PR #45, draft, closes #34 |
| `demo.pr.3` | Tidy alert logging | acme/api PR #46, ready, no closing refs |
| `demo.pr.4` | Queue edits while offline | acme/mobile PR #57, closed without merging, would close #52 |
| `demo.assignee.1` | alice | Assignee of #11 and #34, label `alice` |
| `demo.assignee.2` | alice, bob, carol | Assignees of #12, label `alice +2` |
| `demo.assignee.3` | bob | Assignee of #41, label `bob` |
| `demo.assignee.4` | carol | Assignee of #52, label `carol` |

### Random pools (demo buttons)

| key | English | notes |
|---|---|---|
| `demo.randomMap.1` | Map: Weekly reports | Big Bang button pool. Artifact L791 |
| `demo.randomMap.2` | Map: Customer dashboard | |
| `demo.randomMap.3` | Map: Shared calendar | |
| `demo.randomMap.4` | Map: Single sign-on | |
| `demo.randomIssue.1` | Move the language selector | Rift / Flare / Adopt pool. Artifact L790 |
| `demo.randomIssue.2` | New welcome email | |
| `demo.randomIssue.3` | Measure load time | |
| `demo.randomIssue.4` | Sort the filters | |
| `demo.randomIssue.5` | Session-expired notice | |
| `demo.randomIssue.6` | Labels on Drafts | |
| `demo.randomIssue.7` | Test on tablets | |
| `demo.randomIssue.8` | Review the error messages | |
| `demo.randomIssue.9` | Shortcut to search | |
| `demo.randomIssue.10` | Save the chosen view | |

## 9. Other

| key | English | notes |
|---|---|---|
| `convention.mapPrefix` | Map: | Prefix that makes an issue a Map; `Mapa: ` is also accepted (glossary). Artifact L366 |

## Dropped

- Spanish `Mapa:` text in titles: kept only as an accepted prefix, not shown.
- `agent` / `human` / `glow` events and buttons ("Agente", "Humano", "Un agente trabaja", the claude branch glow): came from branches/commits, removed by ADR 0002/0005.
- `action` ok / fail events and buttons: GitHub Actions, token has no such scope.
- Planet chip suffix "un agente trabaja", Satellite label "#n agente / persona": replaced by assignee-based labels.
- New "assigned" log event: decided against (rule 7).
- Branch names and `en-curso` label in demo data (`feat/...`, `fix/...`, `chore/...`): no branches in Solaria.
- Connector notice cards (`server_not_connected`, `needs_reauth`, `selection_required`, `approval_required`, `not_in_manifest`, `blocked_by_policy`, `other`) and their buttons: claude.ai connector no longer exists (ADR 0001).
- "Datos de ejemplo. Ábrelo en claude.ai..." second sentence: claude.ai connector.
- Blutions eyebrow, `torre-de-control`, "Agente", "Instalación", "Planilla" and the "Ejemplo:" prefix: replaced by plain `acme` product words.
- Prototype chrome (variant names, case switchers, readout table, "Previous/Next variant"): not product copy.
- localStorage key `universo.paseo`: not user-visible.
- Banner-and-marks, status-dock and shelf-grid strings: those prototype designs were not chosen (in-space errors, focus + horizon layout won).
