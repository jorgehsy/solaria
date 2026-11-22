import type { Env } from "./env.ts";

export const MAIN_TOKEN = "GITHUB_TOKEN";

/** `my-org` becomes `GITHUB_TOKEN_MY_ORG`. */
export function ownerTokenVar(owner: string): string {
  return `${MAIN_TOKEN}_${owner.toUpperCase().replace(/[^A-Z0-9]/g, "_")}`;
}

export type TokenChoice =
  | { kind: "token"; repo: string; variable: string; token: string }
  /** No applicable token: the repo shows `bad_token` with a hint naming the variable to add. */
  | { kind: "none"; repo: string; hint: string };

/**
 * The owner's own token wins; otherwise the main token. There is no fallback after a failure:
 * this only decides which variable a repo uses.
 */
export function chooseToken(repo: string, env: Env): TokenChoice {
  const owner = repo.split("/")[0] ?? "";
  const ownVar = ownerTokenVar(owner);
  const own = env[ownVar]?.trim();
  if (own) return { kind: "token", repo, variable: ownVar, token: own };
  const main = env[MAIN_TOKEN]?.trim();
  if (main) return { kind: "token", repo, variable: MAIN_TOKEN, token: main };
  return { kind: "none", repo, hint: `${ownVar} or ${MAIN_TOKEN}` };
}

/** Startup log: `owner/repo → TOKEN_NAME` (the variable name, never the secret). */
export function tokenLogLine(c: TokenChoice): string {
  return c.kind === "token" ? `${c.repo} → ${c.variable}` : `${c.repo} → no token (add ${c.hint} to .env)`;
}
