# Security

## How Solaria handles your token

- Tokens live only in `.env` on your machine (git-ignored). The config file holds repo names, never secrets.
- Only the local server reads the token and talks to GitHub ([ADR 0001](docs/adr/0001-local-server-holds-github-token.md)). The browser never receives it.
- The server listens on `127.0.0.1` only, so other machines on your network cannot reach it.
- Solaria only reads. It never writes to GitHub.
- Logs name the token variable (`GITHUB_TOKEN_ACME`), never its value.

Use a fine-grained, read-only token (Issues read, Pull requests read). A classic `repo` token works for private repos but can write, so prefer fine-grained.

## Reporting a vulnerability

Please report it privately through [GitHub security advisories](https://github.com/jorgehsy/solaria/security/advisories/new), not in a public issue. Include what you found, how to reproduce it and what it lets an attacker do. You should get an answer within a week.

## Supported versions

Only the latest commit on `main` gets fixes.
