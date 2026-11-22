import path from "node:path";
import type { LiveSnapshot, RepoStatus, ServerSnapshot } from "@solaria/contract";
import { loadConfig } from "./config/config.ts";
import { loadEnv } from "./config/env.ts";
import type { Env } from "./config/env.ts";
import { chooseToken, tokenLogLine, MAIN_TOKEN } from "./config/tokens.ts";
import type { TokenChoice } from "./config/tokens.ts";

export type Startup =
  | { mode: "demo"; log: string[] }
  | { mode: "live"; repos: string[]; tokens: TokenChoice[]; log: string[]; warnings: string[] };

/**
 * Decide how to run from the files at the repo root. Throws ConfigError for a broken config.
 * Missing config: demo. Config present: live, even with no usable token (then `bad_token`).
 */
export function startup(root: string, shell: Env = process.env): Startup {
  const configFile = path.join(root, "solaria.config.json");
  const cfg = loadConfig(configFile);
  if (cfg.kind === "missing") return { mode: "demo", log: ["No solaria.config.json found: running the demo Universe."] };
  const { env } = loadEnv(path.join(root, ".env"), shell);
  const tokens = cfg.repos.map((r) => chooseToken(r, env));
  return { mode: "live", repos: cfg.repos, tokens, log: tokens.map(tokenLogLine), warnings: cfg.warnings };
}

/** The snapshot before any GitHub read: demo, `bad_token` when no repo has a token, else loading. */
export function initialSnapshot(s: Startup): ServerSnapshot {
  if (s.mode === "demo") return { mode: "demo" };
  const repos: RepoStatus[] = s.tokens.map((t) =>
    t.kind === "token" ? { repo: t.repo, ok: true, stale: false } : { repo: t.repo, ok: false, stale: false, code: "bad_token", hint: t.hint },
  );
  const anyToken = s.tokens.some((t) => t.kind === "token");
  const status: LiveSnapshot["status"] =
    s.repos.length && !anyToken ? { state: "error", code: "bad_token", hint: MAIN_TOKEN } : { state: s.repos.length ? "loading" : "ok" };
  return {
    mode: "live",
    status,
    repos,
    checkedAt: 0,
    universe: { at: 0, repos: s.repos.slice(), maps: {}, issues: {}, prs: {}, closedPrs: {} },
  };
}
