import path from "node:path";
import { fileURLToPath } from "node:url";
import { createApp } from "./app.ts";

const HOST = "127.0.0.1";
const port = Number(process.env.PORT ?? 4747);
if (!Number.isInteger(port) || port <= 0 || port > 65535) {
  console.error(`PORT must be a number between 1 and 65535, got "${process.env.PORT}".`);
  process.exit(1);
}

const here = path.dirname(fileURLToPath(import.meta.url));
const app = createApp({ webDist: path.resolve(here, "../../web/dist") });

// Only on 127.0.0.1: the server will hold a GitHub token (ADR 0004). It never opens the browser.
const server = app.listen(port, HOST, () => {
  console.log(`Solaria is running at http://${HOST}:${port}`);
});
server.on("error", (err: NodeJS.ErrnoException) => {
  if (err.code === "EADDRINUSE") console.error(`Port ${port} is already in use. Stop the other program or set PORT to another number.`);
  else console.error(err.message);
  process.exit(1);
});
