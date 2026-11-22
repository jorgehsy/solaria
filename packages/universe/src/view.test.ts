import { describe, expect, it } from "vitest";
import { diff } from "./diff.ts";
import { cloneUniverse } from "./model.ts";
import { emptyMasks, holdFor, release, settle, viewOf } from "./view.ts";
import { addClosedPr, addIssue, addMap, addPr, universe } from "./fixtures.ts";

const R = "acme/web";

function step(a: ReturnType<typeof universe>, b: ReturnType<typeof universe>) {
  const masks = emptyMasks();
  const evs = diff(a, b);
  holdFor(a, b, evs, masks);
  return { masks, evs };
}

describe("view masks", () => {
  it("hides a new Map and its kids until the Big Bang plays", () => {
    const a = universe();
    const b = cloneUniverse(a);
    addMap(b, R, 1, "Dark mode");
    addIssue(b, R, 2, { map: "acme/web#1" });
    const { masks, evs } = step(a, b);
    expect(viewOf(b, masks).maps.size).toBe(0);
    expect(viewOf(b, masks).issues.size).toBe(0);
    release(evs[0]!, masks);
    expect(viewOf(b, masks).maps.size).toBe(1);
    expect(viewOf(b, masks).issues.get("acme/web#2")?.map).toBe("acme/web#1");
  });

  it("keeps an adopted issue in the Gas until its Adopt plays", () => {
    const a = universe();
    addMap(a, R, 1, "Dark mode");
    addIssue(a, R, 2);
    const b = cloneUniverse(a);
    b.issues["acme/web#2"]!.map = "acme/web#1";
    const { masks, evs } = step(a, b);
    expect(viewOf(b, masks).issues.get("acme/web#2")?.map).toBeNull();
    release(evs[0]!, masks);
    expect(viewOf(b, masks).issues.get("acme/web#2")?.map).toBe("acme/web#1");
  });

  it("holds an issue's old state until its Comet lands", () => {
    const a = universe();
    addIssue(a, R, 2);
    const b = cloneUniverse(a);
    addPr(b, R, 60, { closes: ["acme/web#2"] });
    const { masks, evs } = step(a, b);
    expect(viewOf(b, masks).prs.size).toBe(0);
    release(evs[0]!, masks);
    expect(viewOf(b, masks).issues.get("acme/web#2")?.state).toBe("todo");
    settle(evs[0]!, masks);
    expect(viewOf(b, masks).issues.get("acme/web#2")?.state).toBe("review");
  });

  it("keeps a vanished issue and its merged PR as ghosts until the Supernova settles", () => {
    const a = universe();
    addIssue(a, R, 2);
    addPr(a, R, 60, { closes: ["acme/web#2"] });
    const b = cloneUniverse(a);
    delete b.prs["acme/web!60"];
    delete b.issues["acme/web#2"];
    addClosedPr(b, R, 60, { merged: true, closes: ["acme/web#2"] });
    const { masks, evs } = step(a, b);
    const v = viewOf(b, masks);
    expect(v.issues.get("acme/web#2")).toMatchObject({ ghost: true, state: "review" });
    expect(v.prs.has("acme/web!60")).toBe(true);
    settle(evs[0]!, masks);
    expect(viewOf(b, masks).issues.size).toBe(0);
    expect(viewOf(b, masks).prs.size).toBe(0);
  });
});
