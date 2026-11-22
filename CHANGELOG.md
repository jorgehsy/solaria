# Changelog

All notable changes to Solaria. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- First version (v1), built in nine slices (#17):
  - Demo Universe (`acme`, 3 Galaxies, 4 Maps) that runs in the browser when `solaria.config.json` is missing (#18).
  - Config and token loading: `solaria.config.json`, `GITHUB_TOKEN` and per-owner `GITHUB_TOKEN_<OWNER>`, no fallback between them (#19).
  - Live data from GitHub over one GraphQL query per repo, a shared poller (60 s with a browser open, 5 min without) and a server-sent snapshot stream (#20).
  - Reading rules: Maps as Suns, Planets with states (Done, In review, Blocked, Draft PR open, To do), Satellites for assignees, closed PRs (#21).
  - Several owners, External Planets and plain-text refs for repos outside the config (#22).
  - Events with animations, one every 1.5 s, an Activity log, and a quiet redraw after a gap of over 10 minutes (#23).
  - Error and empty states drawn in space: universe-wide cards, ghost Galaxies, dimmed stale data (#24).
  - Focus + Horizon layout for many repos (#25).
  - Finish: copy-deck test, hourly points budget for the poller, smoke test against the real GitHub API in CI, license and repo docs (#26).
