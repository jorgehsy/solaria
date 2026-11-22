import type { ErrorCode, LiveSnapshot, RepoStatus, UniverseStatus } from "@solaria/contract";
import type { FetchResult, RateInfo } from "../github/client.ts";
import type { RepoReply } from "../github/query.ts";
import type { TokenChoice } from "../config/tokens.ts";
import { buildUniverse } from "../snapshot/build.ts";

export const FAST_MS = 60_000;
export const SLOW_MS = 5 * 60_000;
const BACKOFF_MAX_MS = 30 * 60_000;
const HOUR = 60 * 60_000;
/** GraphQL points Solaria may spend per hour, leaving room for other tools on the same account (spec section 4). */
export const POINTS_PER_HOUR = 1_500;

export interface PollerOptions {
  tokens: TokenChoice[];
  fetchRepo: (repo: string, token: string) => Promise<FetchResult>;
  /** Did-you-mean for a `not_found` repo (`owner/name` or null). Asked once per repo. */
  suggest?: (repo: string, token: string) => Promise<string | null>;
  now?: () => number;
  log?: (line: string) => void;
  /** Interval while at least one browser is connected (60 s; tests may shorten it). */
  fastMs?: number;
  slowMs?: number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (t: unknown) => void;
}

export type PollerEvent = { kind: "snapshot"; snapshot: LiveSnapshot } | { kind: "fresh"; checkedAt: number; pollMs: number };

interface RepoState {
  repo: string;
  token: string | null;
  reply: RepoReply | null;
  status: RepoStatus;
  okAt?: number;
  /** undefined: not asked yet; null: asked, no close match. */
  suggestion?: string | null;
}

/**
 * The one shared poller (spec section 4): reads every repo in turn, keeps each repo's last good data
 * when a read fails (marked stale), and tells listeners whether the picture changed.
 * 60 s while a browser is connected, 5 min when none is; slower when the rate budget runs low
 * or when a round costs more than the hourly points budget allows.
 */
export class Poller {
  private repos: RepoState[];
  private listeners = new Set<(e: PollerEvent) => void>();
  private watchers = 0;
  private checkedAt = 0;
  private timer: unknown = null;
  private running = false;
  private polling: Promise<void> | null = null;
  private lastKey = "";
  private current: LiveSnapshot;
  private pausedUntil = 0;
  private failures = 0;
  private rate: RateInfo | null = null;
  private points = 0;
  /** Points the last full round cost. */
  private roundPoints = 0;
  private hourStart: number;
  private readonly o: Required<Omit<PollerOptions, "tokens" | "fetchRepo" | "suggest">> & Pick<PollerOptions, "fetchRepo" | "suggest">;

  constructor(opts: PollerOptions) {
    this.o = {
      fetchRepo: opts.fetchRepo,
      suggest: opts.suggest,
      now: opts.now ?? Date.now,
      log: opts.log ?? ((l) => console.log(l)),
      fastMs: opts.fastMs ?? FAST_MS,
      slowMs: opts.slowMs ?? SLOW_MS,
      setTimer: opts.setTimer ?? ((fn, ms) => setTimeout(fn, ms)),
      clearTimer: opts.clearTimer ?? ((t) => clearTimeout(t as ReturnType<typeof setTimeout>)),
    };
    this.repos = opts.tokens.map((t) => ({
      repo: t.repo,
      token: t.kind === "token" ? t.token : null,
      reply: null,
      status: t.kind === "token" ? { repo: t.repo, ok: true, stale: false } : { repo: t.repo, ok: false, stale: false, code: "bad_token", hint: t.hint },
    }));
    this.hourStart = this.o.now();
    this.current = this.build();
    this.lastKey = keyOf(this.current);
  }

  snapshot(): LiveSnapshot {
    return this.current;
  }

  subscribe(fn: (e: PollerEvent) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** A browser connected. In slow mode, poll GitHub at once. Returns the disconnect function. */
  addWatcher(): () => void {
    this.watchers++;
    if (this.watchers === 1 && this.running && !this.polling && this.o.now() >= this.pausedUntil) {
      this.schedule(0);
    }
    let gone = false;
    return () => {
      if (gone) return;
      gone = true;
      this.watchers = Math.max(0, this.watchers - 1);
    };
  }

  watching(): number {
    return this.watchers;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.schedule(0);
  }

  stop(): void {
    this.running = false;
    if (this.timer !== null) this.o.clearTimer(this.timer);
    this.timer = null;
  }

  /** One full round over every repo, one request at a time. */
  async pollOnce(): Promise<void> {
    if (this.polling) return this.polling;
    this.polling = this.round().finally(() => { this.polling = null; });
    return this.polling;
  }

  /** The delay before the next round, from the watchers, the rate budget and any back-off. */
  nextDelay(): number {
    const now = this.o.now();
    if (this.pausedUntil > now) return this.pausedUntil - now;
    let ms = this.cadence(this.watchers > 0);
    // Back-off doubles from the fast interval (60 s in real use; the end-to-end tests shorten it).
    if (this.failures > 0) ms = Math.max(ms, Math.min(BACKOFF_MAX_MS, this.o.fastMs * 2 ** (this.failures - 1)));
    return ms;
  }

  /**
   * The regular interval between rounds, before any pause or back-off: what the status tooltip
   * shows. `watched` is true while a browser is connected.
   */
  cadence(watched = true): number {
    let ms = watched ? this.o.fastMs : this.o.slowMs;
    if (this.rate && this.rate.limit > 0 && this.rate.remaining < this.rate.limit * 0.2) ms = Math.max(ms, this.o.slowMs);
    // Many repos: space rounds out so the hour stays within budget (scaled like the back-off when
    // the end-to-end tests shorten the fast interval).
    if (this.roundPoints > 0) ms = Math.max(ms, Math.ceil(((this.roundPoints * HOUR) / POINTS_PER_HOUR) * (this.o.fastMs / FAST_MS)));
    return ms;
  }

  private schedule(ms: number) {
    if (!this.running) return;
    if (this.timer !== null) this.o.clearTimer(this.timer);
    this.timer = this.o.setTimer(() => {
      this.timer = null;
      void this.pollOnce().then(() => this.schedule(this.nextDelay()));
    }, ms);
  }

  private async round(): Promise<void> {
    let limited = false;
    let anyFail = false;
    let spent = 0;
    for (const r of this.repos) {
      if (!r.token) continue;
      if (this.o.now() < this.pausedUntil) { limited = true; break; }
      const res = await this.o.fetchRepo(r.repo, r.token);
      if (res.rate) {
        this.rate = res.rate;
        this.points += res.rate.cost;
        spent += res.rate.cost;
      }
      if (res.ok) {
        r.reply = res.reply;
        r.okAt = this.o.now();
        r.status = { repo: r.repo, ok: true, stale: false, okAt: r.okAt };
        continue;
      }
      anyFail = true;
      if (res.code === "not_found" && r.suggestion === undefined && this.o.suggest) r.suggestion = await this.o.suggest(r.repo, r.token);
      const hint = res.code === "not_found" && r.suggestion ? r.suggestion : undefined;
      r.status = { repo: r.repo, ok: false, stale: !!r.reply, code: res.code, ...(hint ? { hint } : {}), ...(r.okAt ? { okAt: r.okAt } : {}) };
      if (res.code === "rate_limited") {
        // One person's tokens share one budget: stop the whole round until it resets.
        this.pausedUntil = this.o.now() + (res.retryAfterMs ?? 60_000);
        limited = true;
        for (const other of this.repos) if (other.token && other !== r && other.status.ok) other.status = { ...other.status, stale: !!other.reply };
        break;
      }
    }
    if (!limited) this.roundPoints = spent;
    if (this.rate && this.rate.remaining === 0 && this.rate.resetAt > this.o.now()) this.pausedUntil = Math.max(this.pausedUntil, this.rate.resetAt);
    this.failures = limited ? this.failures + 1 : anyFail && this.repos.every((r) => !r.status.ok) ? this.failures + 1 : 0;
    this.checkedAt = this.o.now();
    this.logPoints();
    const next = this.build();
    const key = keyOf(next);
    this.current = next;
    if (key !== this.lastKey) {
      this.lastKey = key;
      this.emit({ kind: "snapshot", snapshot: next });
    } else this.emit({ kind: "fresh", checkedAt: this.checkedAt, pollMs: next.pollMs });
  }

  private build(): LiveSnapshot {
    const replies = new Map<string, RepoReply>();
    for (const r of this.repos) if (r.reply) replies.set(r.repo, r.reply);
    const repos = this.repos.map((r) => r.status);
    return {
      mode: "live",
      status: universeStatus(repos, this.checkedAt === 0 && this.repos.some((r) => r.token), this.pausedUntil > this.o.now() ? this.pausedUntil : 0),
      repos,
      checkedAt: this.checkedAt,
      pollMs: this.cadence(),
      universe: buildUniverse(this.repos.map((r) => r.repo), replies, this.checkedAt),
    };
  }

  private emit(e: PollerEvent) {
    for (const fn of this.listeners) fn(e);
  }

  private logPoints() {
    const now = this.o.now();
    if (now - this.hourStart < HOUR) return;
    this.o.log(`GitHub points used in the last hour: ${this.points}${this.rate ? ` (${this.rate.remaining} of ${this.rate.limit} left)` : ""}`);
    this.points = 0;
    this.hourStart = now;
  }
}

/**
 * The whole Universe's status. A universe-wide card only when every repo fails
 * (a rejected token wins the code); otherwise each failing repo shows on its own Galaxy.
 */
export function universeStatus(repos: RepoStatus[], loading: boolean, resumeAt: number): UniverseStatus {
  const failing = repos.filter((r) => !r.ok);
  if (repos.length && failing.length === repos.length) {
    const codes = failing.map((r) => r.code).filter((c): c is ErrorCode => !!c);
    const code: ErrorCode = codes.includes("bad_token") ? "bad_token" : codes.includes("rate_limited") ? "rate_limited" : (codes[0] ?? "network");
    if (!loading || code === "bad_token") return code === "rate_limited" && resumeAt ? { state: "error", code, resumeAt } : { state: "error", code };
  }
  if (loading) return { state: "loading" };
  return resumeAt ? { state: "ok", resumeAt } : { state: "ok" };
}

/**
 * Whether two snapshots differ, ignoring when they were checked. A healthy repo's okAt moves on every
 * poll; it only matters once the repo fails, and that failure changes the key anyway.
 */
function keyOf(s: LiveSnapshot): string {
  const repos = s.repos.map((r) => (r.ok ? { ...r, okAt: 0 } : r));
  return JSON.stringify({ status: s.status, repos, universe: { ...s.universe, at: 0 } });
}
