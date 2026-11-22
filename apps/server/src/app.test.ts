import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { ServerSnapshot } from "@solaria/contract";
import type { LiveSnapshot } from "@solaria/contract";
import { createApp } from "./app.ts";
import type { LiveFeed } from "./app.ts";

const live = (n: number): LiveSnapshot => ({
  mode: "live", status: { state: "ok" }, repos: [{ repo: "acme/web", ok: true, stale: false }], checkedAt: n,
  universe: { at: n, repos: ["acme/web"], maps: {}, issues: {}, prs: {}, closedPrs: {} },
});

let server: Server;
let base = "";
let current = live(1);
const listeners = new Set<Parameters<LiveFeed["subscribe"]>[0]>();
let watchers = 0;
const feed: LiveFeed = {
  subscribe: (fn) => { listeners.add(fn); return () => listeners.delete(fn); },
  addWatcher: () => { watchers++; return () => { watchers--; }; },
};

beforeAll(async () => {
  server = createApp({ snapshot: () => current, feed }).listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((r) => { server.closeAllConnections(); server.close(() => r()); }));

describe("GET /api/snapshot", () => {
  it("returns the snapshot in the contract's shape", async () => {
    const res = await fetch(`${base}/api/snapshot`);
    expect(ServerSnapshot.parse(await res.json())).toEqual(live(1));
  });
});

describe("GET /api/events", () => {
  it("sends the snapshot on connect, then changes and fresh notes, and counts the watcher", async () => {
    const ctrl = new AbortController();
    const res = await fetch(`${base}/api/events`, { signal: ctrl.signal });
    expect(res.headers.get("content-type")).toBe("text/event-stream");
    const reader = res.body!.getReader();
    const dec = new TextDecoder();
    let text = "";
    const until = async (needle: string) => {
      while (!text.includes(needle)) text += dec.decode((await reader.read()).value);
    };
    await until("\n\n");
    expect(text).toContain("event: snapshot");
    expect(watchers).toBe(1);
    current = live(2);
    for (const fn of listeners) fn({ kind: "snapshot", snapshot: current });
    for (const fn of listeners) fn({ kind: "fresh", checkedAt: 3 });
    await until('{"checkedAt":3}');
    expect(text).toContain('"checkedAt":2');
    expect(text).toContain("event: fresh");
    ctrl.abort();
    await new Promise((r) => setTimeout(r, 50));
    expect(watchers).toBe(0);
  });
});
