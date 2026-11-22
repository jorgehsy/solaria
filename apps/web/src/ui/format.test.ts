import { describe, expect, it } from "vitest";
import type { UniverseEvent } from "@solaria/universe";
import { eventText } from "./format.ts";

const base = { repo: "acme/web", at: 1, url: "u" };

describe("eventText: closing refs outside the Universe (spec section 5)", () => {
  it("adds them to a Comet as plain text, after the ones inside", () => {
    expect(eventText({ ...base, type: "comet", pr: "acme/web!12", closes: [], outside: ["other/lib#4"] }).text).toBe("PR #12 opened, closes other/lib#4");
    expect(eventText({ ...base, type: "comet", pr: "acme/web!12", closes: ["acme/web#3"], outside: ["acme/lib#4"] }).text).toBe("PR #12 opened, closes #3, lib#4");
  });

  it("adds them to a Supernova and to a merged PR that closed nothing inside", () => {
    expect(eventText({ ...base, type: "supernova", pr: "acme/web!12", issues: ["acme/web#3"], outside: ["other/lib#4"] }).text).toBe("PR #12 merged, closes #3, other/lib#4");
    expect(eventText({ ...base, type: "prgone", pr: "acme/web!12", merged: true, outside: ["other/lib#4"] })).toEqual({ tag: "Supernova", text: "PR #12 merged, closes other/lib#4" });
  });

  it("leaves the text alone when there are none, and a Fade never lists refs", () => {
    expect(eventText({ ...base, type: "comet", pr: "acme/web!12", closes: [] }).text).toBe("PR #12 opened");
    expect(eventText({ ...base, type: "prgone", pr: "acme/web!12", merged: true }).text).toBe("PR #12 merged");
    const fade: UniverseEvent = { ...base, type: "prgone", pr: "acme/web!12", merged: false, outside: ["other/lib#4"] };
    expect(eventText(fade)).toEqual({ tag: "Fade", text: "PR #12 closed without merging" });
  });
});
