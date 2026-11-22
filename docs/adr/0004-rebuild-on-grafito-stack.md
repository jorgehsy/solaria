# Rebuild the artifact on grafito's stack instead of porting it

The first plan was to port the artifact as-is: split its single HTML file into a few files and swap only the data layer. We instead rebuild it with the same structure and tools as grafito, another project by the same author: a pnpm + Turborepo monorepo in strict TypeScript (ESM), React and Vite for `apps/web`, Express for `apps/server`, shared code in `packages/*`, Vitest and Playwright for tests, ESLint flat config, and plain CSS. We chose this because one familiar stack across both projects is cheaper to maintain than a hand-split HTML file, and it brings tests, CI and a contract package with it. The cost is a real rewrite of the UI rather than a mechanical port.

## Consequences

- Install is `corepack enable && pnpm install`. Node `>=22.12.0` (stricter than grafito, since Node 20 is out of support).
- Two commands: `pnpm dev` for contributors (Vite and the server on separate ports, like grafito) and `pnpm start` for users (builds the web app once, then the server serves it on one port). grafito has no `start`.
- The server listens on `127.0.0.1` only, port `4747` by default (`PORT` to change it), and never opens the browser. Unlike grafito, which listens on all interfaces, because Solaria's server holds a GitHub token.
- `.env` and `solaria.config.json` live at the repo root, next to `.env.example` and `solaria.config.example.json`, which the README says to copy.
- A missing config or `.env` still starts the server; the browser opens in demo mode with a banner pointing at the example files. A malformed config (bad JSON or wrong shape, checked with zod) stops the server with the exact problem. A well-formed repo that does not exist shows `not_found`. A port already in use prints a message and exits.
- Repo extras copied from grafito: CI and release workflows, `ARCHITECTURE.md`, `CONTRIBUTING.md`, `CODING_STANDARDS.md`, `SECURITY.md`, `CHANGELOG.md`, Code of Conduct. grafito's `pnpm share` and tunnel are left out (Solaria is local-only).
