import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { ServerSnapshot } from "@solaria/contract";
import { createApp } from "./app.ts";

let server: Server;
let base = "";
beforeAll(async () => {
  server = createApp().listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((r) => server.close(() => r())));

describe("GET /api/snapshot", () => {
  it("reports demo mode in the contract's shape", async () => {
    const res = await fetch(`${base}/api/snapshot`);
    expect(res.status).toBe(200);
    expect(ServerSnapshot.parse(await res.json())).toEqual({ mode: "demo" });
  });
});
