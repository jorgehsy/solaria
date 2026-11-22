# solaria

See your GitHub issues as a universe you can pan, zoom and watch change.

What your repos and issues must follow for Solaria to show them as expected: [docs/repo-requirements.md](docs/repo-requirements.md).

## Run it

Needs Node 22.12 or newer.

```sh
corepack enable && pnpm install
cp .env.example .env                                  # then put your token in GITHUB_TOKEN
cp solaria.config.example.json solaria.config.json    # then list your repos as owner/repo
pnpm start
```

`pnpm start` builds the web app once and serves it at `http://127.0.0.1:4747` (`PORT` changes the port). The server only listens on `127.0.0.1` and never opens the browser.

- **Token**: a fine-grained, read-only token with Issues read and Pull requests read is enough. Repos of another owner can use their own `GITHUB_TOKEN_<OWNER>` (owner in capitals, `-` as `_`), which wins over `GITHUB_TOKEN` for that owner. The startup log prints which variable each repo uses (`owner/repo → GITHUB_TOKEN_ACME`), never the token.
- **Config**: `solaria.config.json` is exactly `{ "repos": ["owner/repo", ...] }`. A broken file stops the server with the exact problem. Without the file, Solaria shows the demo Universe (the fictional `acme` team).

Contributors: `pnpm dev` runs the server on `127.0.0.1:4747` and Vite on `http://127.0.0.1:5173`. Press `D` for the demo panel.

## Develop

| Command | What it does |
|---|---|
| `pnpm lint` | ESLint over the whole repo |
| `pnpm typecheck` | TypeScript in every workspace |
| `pnpm test` | Vitest (`packages/contract`, `packages/universe`, `apps/server`) |
| `pnpm e2e` | Playwright against the built app |

Layout: `apps/server` (Express), `apps/web` (React + Vite, PixiJS canvas in `src/scene`), `packages/contract` (zod schemas), `packages/universe` (pure model: diff, layout, demo), `packages/config` (shared tsconfig and ESLint). The build spec is [docs/spec.md](docs/spec.md).
