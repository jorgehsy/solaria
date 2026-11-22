import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";

export type Env = Readonly<Record<string, string | undefined>>;

/** Read `.env` if it exists. Variables already set in the shell win over the file. */
export function loadEnv(file: string, shell: Env = process.env): { env: Env; found: boolean } {
  let text: string;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    return { env: { ...shell }, found: false };
  }
  return { env: { ...parseEnv(text), ...shell }, found: true };
}
