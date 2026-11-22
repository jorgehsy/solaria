import { readFileSync } from "node:fs";
import { Config } from "@solaria/contract";

export type ConfigResult =
  | { kind: "missing" }
  | { kind: "ok"; repos: string[]; warnings: string[] };

/** A config the server refuses to start with. The message names the exact problem. */
export class ConfigError extends Error {}

/**
 * Read `solaria.config.json`. Missing means demo mode. Bad JSON, a wrong shape or unknown keys
 * throw a ConfigError. Duplicates (case-insensitive) collapse to the first spelling, with a warning.
 */
export function loadConfig(file: string, read: (f: string) => string = (f) => readFileSync(f, "utf8")): ConfigResult {
  let text: string;
  try {
    text = read(file);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return { kind: "missing" };
    throw new ConfigError(`Can't read ${file}: ${(e as Error).message}`);
  }
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (e) {
    throw new ConfigError(`${file} is not valid JSON: ${(e as Error).message}`);
  }
  const parsed = Config.safeParse(json);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => {
      const where = i.path.length ? i.path.join(".") : "(top level)";
      return `  ${where}: ${i.message}`;
    });
    throw new ConfigError(`${file} has the wrong shape. It must be exactly { "repos": ["owner/repo", ...] }.\n${lines.join("\n")}`);
  }
  const seen = new Map<string, string>();
  const warnings: string[] = [];
  for (const r of parsed.data.repos) {
    const k = r.toLowerCase();
    const first = seen.get(k);
    if (first) warnings.push(`${file} lists ${r} more than once${first !== r ? ` (as ${first})` : ""}; showing it once.`);
    else seen.set(k, r);
  }
  return { kind: "ok", repos: [...seen.values()], warnings };
}
