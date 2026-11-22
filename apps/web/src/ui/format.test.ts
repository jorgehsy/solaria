import { describe, expect, it } from "vitest";
import { cadenceText, oldAfter } from "./format.ts";
import { S } from "./strings.ts";

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

describe("cadenceText", () => {
  it("says minute at 60 s (and below, when tests shorten the interval)", () => {
    expect(cadenceText(60_000)).toBe("minute");
    expect(cadenceText(1_000)).toBe("minute");
  });

  it("uses seconds under 2 min and rounded minutes after", () => {
    expect(cadenceText(96_000)).toBe("96 s");
    expect(cadenceText(183_000)).toBe("3 min");
    expect(cadenceText(300_000)).toBe("5 min");
  });

  it("fills the healthy tooltip", () => {
    expect(S.statusTip.ok(cadenceText(96_000))).toBe("All good. Checking GitHub every 96 s.");
  });
});
