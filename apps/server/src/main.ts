import path from "node:path";
import { fileURLToPath } from "node:url";
import { createApp } from "./app.ts";
import { ConfigError } from "./config/config.ts";
import { DEFAULT_API_URL, fetchRepo } from "./github/client.ts";
import { Poller } from "./live/poller.ts";
import { startup } from "./startup.ts";
import type { Startup } from "./startup.ts";

const HOST = "127.0.0.1";
const here = path.dirname(fileURLToPath(import.meta.url));
/**
 * `.env` and `solaria.config.json` live at the repo root. `SOLARIA_DIR` points elsewhere
 * (the end-to-end tests use it to run against fixtures).
 */
const root = process.env.SOLARIA_DIR ? path.resolve(process.env.SOLARIA_DIR) : path.resolve(here, "../../..");

const port = Number(process.env.PORT ?? 4747);
if (!Number.isInteger(port) || port <= 0 || port > 65535) {
  console.error(`PORT must be a number between 1 and 65535, got "${process.env.PORT}".`);
  process.exit(1);
}

let setup: Startup;
try {
  setup = startup(root);
} catch (e) {
  if (e instanceof ConfigError) {
    console.error(`Solaria can't start: ${e.message}`);
    process.exit(1);
  }
  throw e;
}
for (const w of setup.mode === "live" ? setup.warnings : []) console.warn(`Warning: ${w}`);
for (const line of setup.log) console.log(line);

const webDist = path.resolve(here, "../../web/dist");
let app;
if (setup.mode === "live") {
  const apiUrl = setup.env.GITHUB_API_URL || DEFAULT_API_URL;
  if (apiUrl !== DEFAULT_API_URL) console.log(`Reading GitHub at ${apiUrl}`);
  // SOLARIA_POLL_MS shortens the 60 s interval; only the end-to-end tests use it.
  const fastMs = Number(setup.env.SOLARIA_POLL_MS) || undefined;
  const poller = new Poller({ tokens: setup.tokens, fetchRepo: (repo, token) => fetchRepo(repo, token, { apiUrl }), fastMs });
  poller.start();
  app = createApp({ snapshot: () => poller.snapshot(), feed: poller, webDist });
} else {
  app = createApp({ snapshot: () => ({ mode: "demo" }), webDist });
}

// Only on 127.0.0.1: the server holds the GitHub token (ADR 0004). It never opens the browser.
const server = app.listen(port, HOST, () => {
  console.log(`Solaria is running at http://${HOST}:${port}`);
});
server.on("error", (err: NodeJS.ErrnoException) => {
  if (err.code === "EADDRINUSE") console.error(`Port ${port} is already in use. Stop the other program or set PORT to another number.`);
  else console.error(err.message);
  process.exit(1);
});
