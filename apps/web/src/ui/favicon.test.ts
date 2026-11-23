import { describe, expect, it } from "vitest";
import { needsJsAnimation } from "./favicon.ts";

const CHROME = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36";
const SAFARI = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/19.0 Safari/605.1.15";
const FIREFOX = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:145.0) Gecko/20100101 Firefox/145.0";

describe("needsJsAnimation", () => {
  it("swaps frames in Chrome and Safari, which freeze SVG favicons", () => {
    expect(needsJsAnimation(CHROME, false)).toBe(true);
    expect(needsJsAnimation(SAFARI, false)).toBe(true);
  });
  it("leaves Firefox to animate the SVG itself", () => {
    expect(needsJsAnimation(FIREFOX, false)).toBe(false);
  });
  it("keeps the static mark under reduced motion", () => {
    expect(needsJsAnimation(CHROME, true)).toBe(false);
  });
});
