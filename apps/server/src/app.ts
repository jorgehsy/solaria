import { existsSync } from "node:fs";
import path from "node:path";
import express from "express";
import type { ServerSnapshot } from "@solaria/contract";

export interface AppOptions {
  /** The latest snapshot (demo, or the live picture). */
  snapshot: () => ServerSnapshot;
  /** The built web app to serve, if any (`pnpm start`). In `pnpm dev` Vite serves it instead. */
  webDist?: string;
}

export function createApp(opts: AppOptions): express.Express {
  const app = express();
  app.disable("x-powered-by");
  app.get("/api/snapshot", (_req, res) => {
    res.json(opts.snapshot());
  });
  const dist = opts.webDist;
  if (dist && existsSync(path.join(dist, "index.html"))) {
    app.use(express.static(dist));
    app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(path.join(dist, "index.html")));
  }
  return app;
}
