import { describe, expect, it } from "vitest";
import { closest, suggestRepo } from "./suggest.ts";
import type { FetchLike } from "./client.ts";

const answer = (status: number, body: unknown): FetchLike => async () => ({ status, headers: { get: () => null }, json: async () => body });
const names = (...n: string[]) => ({ data: { repositoryOwner: { repositories: { nodes: n.map((name) => ({ name })) } } } });

describe("closest", () => {
  it("finds a one- or two-letter typo", () => {
    expect(closest("dcos", ["web", "docs", "api"])).toBe("docs");
    expect(closest("wbe", ["web", "website"])).toBe("web");
  });
  it("ignores case and returns null when nothing is close", () => {
    expect(closest("Docs", ["docs"])).toBe("docs");
    expect(closest("billing", ["web", "docs"])).toBeNull();
  });
});

describe("suggestRepo", () => {
  it("asks GitHub for the owner's repos and returns owner/closest", async () => {
    expect(await suggestRepo("acme/dcos", "t", { fetch: answer(200, names("web", "docs")) })).toBe("acme/docs");
  });
  it("returns null on any failure or an unknown owner", async () => {
    expect(await suggestRepo("acme/dcos", "t", { fetch: answer(401, {}) })).toBeNull();
    expect(await suggestRepo("nobody/x", "t", { fetch: answer(200, { data: { repositoryOwner: null } }) })).toBeNull();
    expect(await suggestRepo("acme/x", "t", { fetch: async () => { throw new Error("down"); } })).toBeNull();
  });
});
