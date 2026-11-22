# Contributing

Thanks for helping. Solaria is small on purpose; read these first:

- [docs/spec.md](docs/spec.md): what to build.
- [GLOSSARY.md](GLOSSARY.md): the words (Universe, Galaxy, Map, Sun, Planet, Gas, ...). Use them exactly, in code and docs.
- [docs/adr/](docs/adr/): why things are the way they are. Propose a new ADR before going against one.
- [ARCHITECTURE.md](ARCHITECTURE.md): where code lives.

## Setup

```sh
npm install -g corepack@latest && corepack enable && pnpm install
pnpm dev      # server on 127.0.0.1:4747, Vite on 127.0.0.1:5173
```

No token? Leave out `solaria.config.json` and you get the demo Universe.

## Before you open a pull request

```sh
pnpm lint && pnpm typecheck && pnpm test && pnpm e2e
```

- Work test-first. Pure logic (`packages/universe`, the server's snapshot builder, the poller) gets Vitest tests; user-visible behaviour gets a Playwright test against `e2e/fake-github.ts`.
- User-facing text goes in `apps/web/src/ui/strings.ts` and must match [docs/copy/ui-strings.md](docs/copy/ui-strings.md); a test checks every key.
- Keep pull requests to one change, and link the issue (`Closes #N`).
- Add a line under `Unreleased` in [CHANGELOG.md](CHANGELOG.md) for anything a user would notice.

## Code of conduct

Everyone taking part agrees to the [Code of Conduct](CODE_OF_CONDUCT.md).
