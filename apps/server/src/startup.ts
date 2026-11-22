import path from "node:path";
import type { ServerSnapshot } from "@solaria/contract";
import { loadConfig } from "./config/config.ts";
import { loadEnv } from "./config/env.ts";
import type { Env } from "./config/env.ts";
import { chooseToken, tokenLogLine } from "./config/tokens.ts";
import { Poller } from "./live/poller.ts";
import type { TokenChoice } from "./config/tokens.ts";

export type Startup =
  | { mode: "demo"; log: string[] }
  | { mode: "live"; repos: string[]; tokens: TokenChoice[]; log: string[]; warnings: string[]; env: Env };

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
  return { mode: "live", repos: cfg.repos, tokens, log: tokens.map(tokenLogLine), warnings: cfg.warnings, env };
}

/** The snapshot before any GitHub read: demo, `bad_token` when no repo has a token, else loading. */
export function initialSnapshot(s: Startup): ServerSnapshot {
  if (s.mode === "demo") return { mode: "demo" };
  return new Poller({ tokens: s.tokens, fetchRepo: () => Promise.reject(new Error("not polling")) }).snapshot();
}
