# solaria

See your GitHub issues as a universe you can pan, zoom and watch change.

What your repos and issues must follow for Solaria to show them as expected: [docs/repo-requirements.md](docs/repo-requirements.md).

## Run it

Needs Node 22.12 or newer.

```sh
corepack enable && pnpm install
pnpm dev
```

`pnpm dev` starts the Solaria server on `127.0.0.1:4747` and the web app on `http://127.0.0.1:5173`. With no `solaria.config.json` it shows the demo Universe (the fictional `acme` team). Press `D` for the demo panel.

## Develop

| Command | What it does |
|---|---|
| `pnpm lint` | ESLint over the whole repo |
| `pnpm typecheck` | TypeScript in every workspace |
| `pnpm test` | Vitest (`packages/contract`, `packages/universe`, `apps/server`) |
| `pnpm e2e` | Playwright against the built app |

Layout: `apps/server` (Express), `apps/web` (React + Vite, PixiJS canvas in `src/scene`), `packages/contract` (zod schemas), `packages/universe` (pure model: diff, layout, demo), `packages/config` (shared tsconfig and ESLint). The build spec is [docs/spec.md](docs/spec.md).
