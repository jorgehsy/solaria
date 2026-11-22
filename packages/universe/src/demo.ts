import { cloneUniverse, issueKey, prKey, stripMapPrefix } from "./model.ts";
import type { Issue, IssueKey, Universe } from "./model.ts";
import { issueStates } from "./state.ts";
import { pick, seeded } from "./rng.ts";
import type { Rng } from "./rng.ts";

/** The fictional `acme` team (copy deck section 8). Titles are data, so they live here, not in the UI strings. */
export const DEMO_OWNER = "acme";
export const DEMO_REPOS = ["acme/web", "acme/api", "acme/mobile"] as const;
export const DEMO_SEED = 17;

const MAPS: { repo: string; n: number; title: string; kids: [number, string][] }[] = [
  {
    repo: "acme/web", n: 10, title: "Map: Dark mode",
    kids: [[11, "Add a dark mode toggle"], [12, "Dark palette for charts"], [13, "Remember the theme choice"], [14, "Follow the system theme"], [15, "Fix button contrast in dark mode"], [16, "Dark logo variant"], [17, "Dark theme for code blocks"], [18, "Document the theme tokens"]],
  },
  {
    repo: "acme/api", n: 40, title: "Map: Usage dashboard",
    kids: [[41, "Track API calls per key"], [42, "Monthly usage chart"], [43, "Budget alert"], [44, "Export usage to CSV"]],
  },
  {
    repo: "acme/api", n: 30, title: "Map: Email alerts",
    kids: [[31, "Email template for alerts"], [32, "Group repeated alerts"], [33, "Mute an alert rule"], [34, "Link to the issue in the email"], [35, "Daily summary email"], [36, "Clean up old alerts"], [37, "Log response times"], [38, "Document the alert format"]],
  },
  {
    repo: "acme/mobile", n: 50, title: "Map: Offline mode",
    kids: [[51, "Cache the home screen"], [52, "Queue edits while offline"], [53, "Show an offline banner"], [54, "Sync when back online"], [55, "Resolve edit conflicts"], [56, "Test on slow networks"]],
  },
];
const GAS: [number, string][] = [[20, "Sort the sidebar"], [21, "New icon for Drafts"], [22, "Empty-state text"], [23, "Check contrast on the login page"]];
const ASSIGNEES: Record<IssueKey, string[]> = {
  "acme/web#11": ["alice"],
  "acme/api#34": ["alice"],
  "acme/web#12": ["alice", "bob", "carol"],
  "acme/api#41": ["bob"],
  "acme/mobile#52": ["carol"],
};

export const DEMO_RANDOM_MAPS = ["Map: Weekly reports", "Map: Customer dashboard", "Map: Shared calendar", "Map: Single sign-on"] as const;
export const DEMO_RANDOM_ISSUES = [
  "Move the language selector", "New welcome email", "Measure load time", "Sort the filters", "Session-expired notice",
  "Labels on Drafts", "Test on tablets", "Review the error messages", "Shortcut to search", "Save the chosen view",
] as const;
export const DEMO_TEST_PR_TITLE = "Test PR";

const MIN = 60_000;
const issueUrl = (repo: string, n: number) => `https://github.com/${repo}/issues/${n}`;
const prUrl = (repo: string, n: number) => `https://github.com/${repo}/pull/${n}`;

/**
 * The demo Universe: 3 Galaxies, 4 Maps, 26 Planets, 4 Gas issues. The seeded random only picks
 * ages, which Planets are already done and which are blocked, so every run draws the same picture.
 */
export function makeDemoUniverse(now: number, seed = DEMO_SEED): Universe {
  const rng = seeded(seed);
  const u: Universe = { at: now, repos: [...DEMO_REPOS], maps: {}, issues: {}, prs: {}, closedPrs: {} };
  const ago = (lo: number, hi: number) => now - Math.round((lo + rng() * (hi - lo)) * MIN);
  const busy = new Set(["acme/web#11", "acme/api#34", "acme/mobile#52", ...Object.keys(ASSIGNEES)]);

  for (const m of MAPS) {
    const mk = issueKey(m.repo, m.n);
    u.maps[mk] = { key: mk, repo: m.repo, number: m.n, title: stripMapPrefix(m.title), url: issueUrl(m.repo, m.n), assignees: [], created: ago(3000, 9000) };
    let prevOpen: IssueKey | null = null;
    for (const [n, title] of m.kids) {
      const k = issueKey(m.repo, n);
      const free = !busy.has(k);
      const closed = free && rng() < 0.25;
      const blocked = free && !closed && prevOpen !== null && rng() < 0.3;
      u.issues[k] = {
        key: k, repo: m.repo, number: n, title, url: issueUrl(m.repo, n), map: mk,
        blockers: blocked && prevOpen ? [prevOpen] : [], assignees: ASSIGNEES[k]?.slice() ?? [],
        closed, created: ago(600, 3000), closedAt: closed ? ago(30, 600) : 0,
      };
      if (!closed) prevOpen = k;
    }
  }
  for (const [n, title] of GAS) {
    const k = issueKey("acme/web", n);
    u.issues[k] = { key: k, repo: "acme/web", number: n, title, url: issueUrl("acme/web", n), map: null, blockers: [], assignees: [], closed: false, created: ago(60, 4000), closedAt: 0 };
  }
  const pr = (repo: string, n: number, title: string, draft: boolean, closes: IssueKey[]) => {
    u.prs[prKey(repo, n)] = { key: prKey(repo, n), repo, number: n, title, url: prUrl(repo, n), draft, closes, created: ago(20, 400) };
  };
  pr("acme/web", 60, "Add a dark mode toggle", false, ["acme/web#11"]);
  pr("acme/api", 45, "Link to the issue in the email", true, ["acme/api#34"]);
  pr("acme/api", 46, "Tidy alert logging", false, []);
  u.closedPrs[prKey("acme/mobile", 57)] = {
    key: prKey("acme/mobile", 57), repo: "acme/mobile", number: 57, title: "Queue edits while offline", url: prUrl("acme/mobile", 57),
    merged: false, at: ago(30, 120), closes: ["acme/mobile#52"],
  };
  return u;
}

/** The demo panel's buttons. There is no Close button. */
export type DemoEventKind = "bigbang" | "rift" | "flare" | "adopt" | "comet" | "supernova" | "fade";
export const DEMO_EVENT_KINDS: readonly DemoEventKind[] = ["bigbang", "rift", "flare", "adopt", "comet", "supernova", "fade"];

export interface DemoOptions {
  rng: Rng;
  now: number;
  /**
   * Live data: pretend numbers are picked far from real ones (90000+), since they vanish on the next refresh.
   * Demo data: the next free number in the repo.
   */
  live: boolean;
}

export type DemoResult =
  | { kind: "ok"; next: Universe }
  /** Nothing to act on (for example no open PR to merge): play this event first, then try again. */
  | { kind: "needs"; first: DemoEventKind };

/** Apply one demo-panel event to a Universe. Pure: returns a new Universe. */
export function demoEvent(u: Universe, kind: DemoEventKind, o: DemoOptions): DemoResult {
  const { rng, now } = o;
  const next = cloneUniverse(u);
  next.at = now;
  const used = new Set(Object.keys(u.issues).concat(Object.keys(u.maps), Object.keys(u.prs), Object.keys(u.closedPrs)));
  const num = (repo: string): number => {
    if (o.live) {
      for (;;) {
        const n = 90000 + Math.floor(rng() * 9000);
        if (!used.has(issueKey(repo, n)) && !used.has(prKey(repo, n))) { used.add(issueKey(repo, n)); return n; }
      }
    }
    let n = 0;
    for (const k of used) if (k.startsWith(repo + "#") || k.startsWith(repo + "!")) n = Math.max(n, Number(k.slice(repo.length + 1)));
    used.add(issueKey(repo, n + 1));
    return n + 1;
  };
  const newIssue = (repo: string, map: IssueKey | null, blockers: IssueKey[] = []): Issue => {
    const n = num(repo);
    const i: Issue = { key: issueKey(repo, n), repo, number: n, title: pick(rng, DEMO_RANDOM_ISSUES), url: issueUrl(repo, n), map, blockers, assignees: [], closed: false, created: now, closedAt: 0 };
    next.issues[i.key] = i;
    return i;
  };
  const states = issueStates(u);
  const open = Object.values(u.issues).filter((i) => !i.closed);
  const maps = Object.values(u.maps);

  switch (kind) {
    case "rift": {
      newIssue(pick(rng, u.repos), null);
      return { kind: "ok", next };
    }
    case "bigbang": {
      const repo = pick(rng, u.repos);
      const n = num(repo);
      const mk = issueKey(repo, n);
      next.maps[mk] = { key: mk, repo, number: n, title: stripMapPrefix(pick(rng, DEMO_RANDOM_MAPS)), url: issueUrl(repo, n), assignees: [], created: now };
      const count = 3 + Math.floor(rng() * 3);
      let prev: IssueKey | null = null;
      for (let i = 0; i < count; i++) prev = newIssue(repo, mk, prev && i % 2 ? [prev] : []).key;
      return { kind: "ok", next };
    }
    case "flare": {
      if (!maps.length) return { kind: "needs", first: "bigbang" };
      const m = pick(rng, maps);
      newIssue(m.repo, m.key);
      return { kind: "ok", next };
    }
    case "adopt": {
      const gas = open.filter((i) => !i.map);
      if (!maps.length) return { kind: "needs", first: "bigbang" };
      if (!gas.length) return { kind: "needs", first: "rift" };
      const i = pick(rng, gas);
      const same = maps.filter((m) => m.repo === i.repo);
      const target = next.issues[i.key];
      if (target) target.map = pick(rng, same.length ? same : maps).key;
      return { kind: "ok", next };
    }
    case "comet": {
      const cands = open.filter((i) => states.get(i.key) !== "review" && states.get(i.key) !== "doing");
      const i = cands.length ? pick(rng, cands) : null;
      const repo = i ? i.repo : pick(rng, u.repos);
      const n = num(repo);
      next.prs[prKey(repo, n)] = { key: prKey(repo, n), repo, number: n, title: DEMO_TEST_PR_TITLE, url: prUrl(repo, n), draft: rng() < 0.4, closes: i ? [i.key] : [], created: now };
      return { kind: "ok", next };
    }
    case "supernova":
    case "fade": {
      const merge = kind === "supernova";
      const prs = Object.values(u.prs).filter((p) => !merge || p.closes.some((k) => u.issues[k] && !u.issues[k].closed));
      if (!prs.length) return { kind: "needs", first: "comet" };
      const p = pick(rng, prs);
      delete next.prs[p.key];
      next.closedPrs[p.key] = { key: p.key, repo: p.repo, number: p.number, title: p.title, url: p.url, merged: merge, at: now, closes: p.closes.slice() };
      if (merge) {
        for (const k of p.closes) {
          const i = next.issues[k];
          if (!i) continue;
          // A Planet stays as done; a Gas issue is no longer read once closed.
          if (i.map) { i.closed = true; i.closedAt = now; } else delete next.issues[k];
        }
      }
      return { kind: "ok", next };
    }
  }
}

export { seeded };
