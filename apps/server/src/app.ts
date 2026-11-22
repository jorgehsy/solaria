import { existsSync } from "node:fs";
import path from "node:path";
import express from "express";
import type { ServerSnapshot } from "@solaria/contract";

export interface AppOptions {
  /** The built web app to serve, if any (`pnpm start`). In `pnpm dev` Vite serves it instead. */
  webDist?: string;
}

/**
 * Slice 1: there is no config loading yet, so the server always reports demo mode and the browser
 * builds the demo Universe itself. Config, tokens and the live snapshot arrive in slices 2 and 3.
 */
export function createApp(opts: AppOptions = {}): express.Express {
  const app = express();
  app.disable("x-powered-by");
  app.get("/api/snapshot", (_req, res) => {
    const body: ServerSnapshot = { mode: "demo" };
    res.json(body);
  });
  const dist = opts.webDist;
  if (dist && existsSync(path.join(dist, "index.html"))) {
    app.use(express.static(dist));
    app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(path.join(dist, "index.html")));
  }
  return app;
}
