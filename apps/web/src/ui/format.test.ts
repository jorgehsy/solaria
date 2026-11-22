import { describe, expect, it } from "vitest";
import { oldAfter } from "./format.ts";

describe("oldAfter", () => {
  it("is 3 min at the usual 60 s cadence", () => {
    expect(oldAfter(60_000)).toBe(180_000);
    expect(oldAfter(0)).toBe(180_000);
  });

  it("is the cadence plus 2 min once polling is stretched", () => {
    expect(oldAfter(96_000)).toBe(216_000);
    expect(oldAfter(300_000)).toBe(420_000);
  });
});
