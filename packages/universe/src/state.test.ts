import { describe, expect, it } from "vitest";
import { issueStates, satelliteLabel } from "./state.ts";
import { addIssue, addPr, universe } from "./fixtures.ts";

const R = "acme/web";

describe("issueStates", () => {
  it("follows the order Done, In review, Blocked, Draft PR open, To do", () => {
    const u = universe();
    addIssue(u, R, 1, { closed: true });
    addIssue(u, R, 2, { blockers: ["acme/web#9"] });
    addIssue(u, R, 3, { blockers: ["acme/web#9"] });
    addIssue(u, R, 4);
    addIssue(u, R, 5, { assignees: ["alice"] });
    addIssue(u, R, 9);
    addPr(u, R, 50, { closes: ["acme/web#1", "acme/web#2"] });
    addPr(u, R, 51, { draft: true, closes: ["acme/web#3", "acme/web#4"] });
    const s = issueStates(u);
    expect(s.get("acme/web#1")).toBe("done");
    expect(s.get("acme/web#2")).toBe("review");
    expect(s.get("acme/web#3")).toBe("blocked");
    expect(s.get("acme/web#4")).toBe("doing");
    expect(s.get("acme/web#5")).toBe("todo");
  });

  it("is not blocked when every blocker is closed or outside the Universe", () => {
    const u = universe();
    addIssue(u, R, 1, { closed: true });
    addIssue(u, R, 2, { blockers: ["acme/web#1", "acme/web#404"] });
    expect(issueStates(u).get("acme/web#2")).toBe("todo");
  });
});

describe("satelliteLabel", () => {
  it("names the first assignee and counts the rest", () => {
    expect(satelliteLabel(["alice", "bob", "carol"])).toEqual({ first: "alice", rest: 2 });
    expect(satelliteLabel(["bob"])).toEqual({ first: "bob", rest: 0 });
    expect(satelliteLabel([])).toBeNull();
  });
});
