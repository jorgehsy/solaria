import { existsSync } from "node:fs";
import path from "node:path";
import express from "express";
import { SSE_FRESH, SSE_SNAPSHOT } from "@solaria/contract";
import type { ServerSnapshot } from "@solaria/contract";

/** What the live stream needs from the poller. */
export interface LiveFeed {
  subscribe(fn: (e: { kind: "snapshot"; snapshot: ServerSnapshot } | { kind: "fresh"; checkedAt: number }) => void): () => void;
  /** A browser connected; returns the function to call when it leaves. */
  addWatcher(): () => void;
}

export interface AppOptions {
  /** The latest snapshot (demo, or the live picture). */
  snapshot: () => ServerSnapshot;
  /** Live mode: the poller behind the SSE stream. Demo mode has none. */
  feed?: LiveFeed;
  /** The built web app to serve, if any (`pnpm start`). In `pnpm dev` Vite serves it instead. */
  webDist?: string;
  /** SSE keep-alive comment interval. */
  heartbeatMs?: number;
}

export function createApp(opts: AppOptions): express.Express {
  const app = express();
  app.disable("x-powered-by");
  app.get("/api/snapshot", (_req, res) => {
    res.json(opts.snapshot());
  });

  // One stream carries the live picture (ADR 0003): the full snapshot on connect and on every
  // change, a small "still fresh" note otherwise. Open connections tell the poller someone watches.
  app.get("/api/events", (req, res) => {
    res.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    });
    const send = (event: string, data: unknown) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    send(SSE_SNAPSHOT, opts.snapshot());
    const unsubscribe = opts.feed?.subscribe((e) => {
      if (e.kind === "snapshot") send(SSE_SNAPSHOT, e.snapshot);
      else send(SSE_FRESH, { checkedAt: e.checkedAt });
    });
    const leave = opts.feed?.addWatcher();
    const beat = setInterval(() => res.write(": keep-alive\n\n"), opts.heartbeatMs ?? 25_000);
    req.on("close", () => {
      clearInterval(beat);
      unsubscribe?.();
      leave?.();
    });
  });

  const dist = opts.webDist;
  if (dist && existsSync(path.join(dist, "index.html"))) {
    app.use(express.static(dist));
    app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(path.join(dist, "index.html")));
  }
  return app;
}
