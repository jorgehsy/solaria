import { describe, expect, it } from "vitest";
import { diff } from "./diff.ts";
import { cloneUniverse } from "./model.ts";
import { addClosedPr, addIssue, addMap, addPr, universe } from "./fixtures.ts";

const R = "acme/web";

describe("diff", () => {
  it("returns nothing for identical snapshots", () => {
    const a = universe();
    addMap(a, R, 1, "Dark mode");
    addIssue(a, R, 2, { map: "acme/web#1" });
    expect(diff(a, cloneUniverse(a))).toEqual([]);
  });

  it("emits a Big Bang for a new Map, with its kids and without separate Flares", () => {
    const a = universe();
    addIssue(a, R, 5);
    const b = cloneUniverse(a);
    addMap(b, R, 1, "Dark mode", { created: 50 });
    addIssue(b, R, 3, { map: "acme/web#1" });
    addIssue(b, R, 2, { map: "acme/web#1" });
    b.issues["acme/web#5"]!.map = "acme/web#1";
    const evs = diff(a, b);
    expect(evs).toEqual([
      { type: "bigbang", repo: R, at: 50, url: "https://github.com/acme/web/issues/1", map: "acme/web#1", mapTitle: "Dark mode", kids: ["acme/web#2", "acme/web#3", "acme/web#5"] },
    ]);
  });

  it("emits a Rift for a new issue with no Map", () => {
    const a = universe();
    const b = cloneUniverse(a);
    addIssue(b, R, 7, { created: 33 });
    expect(diff(a, b)).toMatchObject([{ type: "rift", issue: "acme/web#7", at: 33, repo: R }]);
  });

  it("emits a Flare for a new issue born inside an existing Map", () => {
    const a = universe();
    addMap(a, R, 1, "Dark mode");
    const b = cloneUniverse(a);
    addIssue(b, R, 8, { map: "acme/web#1" });
    expect(diff(a, b)).toMatchObject([{ type: "flare", issue: "acme/web#8", map: "acme/web#1", mapTitle: "Dark mode" }]);
  });

  it("does not emit anything for a new issue that is already closed", () => {
    const a = universe();
    addMap(a, R, 1, "Dark mode");
    const b = cloneUniverse(a);
    addIssue(b, R, 8, { map: "acme/web#1", closed: true });
    expect(diff(a, b)).toEqual([]);
  });

  it("emits an Adopt when an existing issue joins an existing Map", () => {
    const a = universe();
    addMap(a, R, 1, "Dark mode");
    addIssue(a, R, 9);
    const b = cloneUniverse(a);
    b.issues["acme/web#9"]!.map = "acme/web#1";
    expect(diff(a, b, 99)).toMatchObject([{ type: "adopt", issue: "acme/web#9", map: "acme/web#1", from: null, at: 99 }]);
  });

  it("emits a Comet for a new PR with its closing refs", () => {
    const a = universe();
    addIssue(a, R, 2);
    const b = cloneUniverse(a);
    addPr(b, R, 60, { closes: ["acme/web#2"], created: 70 });
    expect(diff(a, b)).toMatchObject([{ type: "comet", pr: "acme/web!60", closes: ["acme/web#2"], at: 70 }]);
  });

  it("emits a Close when an issue closes", () => {
    const a = universe();
    addMap(a, R, 1, "Dark mode");
    addIssue(a, R, 2, { map: "acme/web#1" });
    const b = cloneUniverse(a);
    b.issues["acme/web#2"]!.closed = true;
    expect(diff(a, b, 5)).toMatchObject([{ type: "close", issue: "acme/web#2", at: 5 }]);
  });

  it("emits a Close when an open issue vanishes", () => {
    const a = universe();
    addIssue(a, R, 4);
    const b = cloneUniverse(a);
    delete b.issues["acme/web#4"];
    expect(diff(a, b)).toMatchObject([{ type: "close", issue: "acme/web#4" }]);
  });

  it("emits a Supernova for a merged PR and folds its issues' Close into it", () => {
    const a = universe();
    addIssue(a, R, 2);
    addPr(a, R, 60, { closes: ["acme/web#2"] });
    const b = cloneUniverse(a);
    delete b.prs["acme/web!60"];
    delete b.issues["acme/web#2"];
    addClosedPr(b, R, 60, { merged: true, at: 77, closes: ["acme/web#2"] });
    expect(diff(a, b)).toEqual([{ type: "supernova", repo: R, at: 77, url: "https://github.com/acme/web/pull/60", pr: "acme/web!60", issues: ["acme/web#2"] }]);
  });

  it("emits prgone (merged) for a merged PR with no closing refs", () => {
    const a = universe();
    addPr(a, R, 61);
    const b = cloneUniverse(a);
    delete b.prs["acme/web!61"];
    addClosedPr(b, R, 61, { merged: true });
    expect(diff(a, b)).toMatchObject([{ type: "prgone", pr: "acme/web!61", merged: true }]);
  });

  it("emits a Fade (prgone, not merged) for a PR closed without merging, and still a Close for its issue", () => {
    const a = universe();
    addIssue(a, R, 2);
    addPr(a, R, 62, { closes: ["acme/web#2"] });
    const b = cloneUniverse(a);
    delete b.prs["acme/web!62"];
    delete b.issues["acme/web#2"];
    addClosedPr(b, R, 62, { merged: false, closes: ["acme/web#2"] });
    expect(diff(a, b).map((e) => e.type)).toEqual(["close", "prgone"]);
    expect(diff(a, b)[1]).toMatchObject({ merged: false });
  });

  it("treats a PR that left without a closed-PR record as not merged", () => {
    const a = universe();
    addPr(a, R, 63);
    const b = cloneUniverse(a);
    delete b.prs["acme/web!63"];
    expect(diff(a, b)).toMatchObject([{ type: "prgone", merged: false }]);
  });

  it("orders events: Big Bang, Flare/Rift/Adopt, Comet, Close, Supernova/Fade", () => {
    const a = universe();
    addMap(a, R, 1, "Old");
    addIssue(a, R, 2);
    addIssue(a, R, 3);
    addPr(a, R, 50);
    const b = cloneUniverse(a);
    delete b.prs["acme/web!50"];
    b.issues["acme/web#3"]!.closed = true;
    addPr(b, R, 51);
    b.issues["acme/web#2"]!.map = "acme/web#1";
    addMap(b, R, 10, "New");
    addIssue(b, R, 11);
    expect(diff(a, b).map((e) => e.type)).toEqual(["bigbang", "adopt", "rift", "comet", "close", "prgone"]);
  });
});
