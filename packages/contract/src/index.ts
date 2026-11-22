import { z } from "zod";

/**
 * The only error codes a repo or the whole Universe can report (spec section 6).
 * Org approval and SSO problems are `no_access` with a hint, never a new code.
 */
export const ErrorCode = z.enum(["bad_token", "no_access", "not_found", "rate_limited", "network"]);
export type ErrorCode = z.infer<typeof ErrorCode>;

/** `owner/repo`, GitHub's allowed characters only. */
export const RepoName = z.string().regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/, "expected owner/repo");

/** `solaria.config.json`: exactly `{ "repos": [...] }`. Unknown keys are a broken config. */
export const Config = z.strictObject({
  repos: z.array(RepoName),
});
export type Config = z.infer<typeof Config>;

/** One configured repo's health. A failing repo keeps its last good data, marked `stale`. */
export const RepoStatus = z.strictObject({
  repo: RepoName,
  ok: z.boolean(),
  stale: z.boolean(),
  code: ErrorCode.optional(),
  /** Extra words for the card: the variable to add (`GITHUB_TOKEN_ACME`), or the did-you-mean repo for `not_found`. */
  hint: z.string().optional(),
  /** When this repo was last read fine (epoch ms): the age on a stale card. */
  okAt: z.number().optional(),
});
export type RepoStatus = z.infer<typeof RepoStatus>;

/** The whole Universe's health: one centred card only for a rejected token or every repo failing. */
export const UniverseStatus = z.strictObject({
  state: z.enum(["ok", "loading", "error"]),
  code: ErrorCode.optional(),
  hint: z.string().optional(),
  /** `rate_limited`: when polling resumes (epoch ms). */
  resumeAt: z.number().optional(),
});
export type UniverseStatus = z.infer<typeof UniverseStatus>;

const Key = z.string();
export const MapIssue = z.strictObject({
  key: Key, repo: RepoName, number: z.number().int(), title: z.string(), url: z.string(),
  assignees: z.array(z.string()), created: z.number(),
});
export const Issue = z.strictObject({
  key: Key, repo: RepoName, number: z.number().int(), title: z.string(), url: z.string(),
  map: Key.nullable(), blockers: z.array(Key), assignees: z.array(z.string()),
  closed: z.boolean(), created: z.number(), closedAt: z.number(),
});
export const PullRequest = z.strictObject({
  key: Key, repo: RepoName, number: z.number().int(), title: z.string(), url: z.string(),
  draft: z.boolean(), closes: z.array(Key), created: z.number(),
});
export const ClosedPullRequest = z.strictObject({
  key: Key, repo: RepoName, number: z.number().int(), title: z.string(), url: z.string(),
  merged: z.boolean(), at: z.number(), closes: z.array(Key),
});
/** The Universe data, same shape as `@solaria/universe`'s `Universe`. */
export const UniverseData = z.strictObject({
  at: z.number(),
  repos: z.array(RepoName),
  maps: z.record(Key, MapIssue),
  issues: z.record(Key, Issue),
  prs: z.record(Key, PullRequest),
  closedPrs: z.record(Key, ClosedPullRequest),
});
export type UniverseData = z.infer<typeof UniverseData>;

/** No `solaria.config.json`: no GitHub data; the browser builds the demo Universe itself. */
export const DemoSnapshot = z.strictObject({
  mode: z.literal("demo"),
});

/** The full live picture, pushed whole whenever it changes (ADR 0003). */
export const LiveSnapshot = z.strictObject({
  mode: z.literal("live"),
  status: UniverseStatus,
  repos: z.array(RepoStatus),
  /** When GitHub was last checked (epoch ms), for "updated N ago". 0 before the first poll. */
  checkedAt: z.number(),
  universe: UniverseData,
});
export type LiveSnapshot = z.infer<typeof LiveSnapshot>;

/** What `GET /api/snapshot` returns and what the SSE stream pushes as a snapshot. */
export const ServerSnapshot = z.discriminatedUnion("mode", [DemoSnapshot, LiveSnapshot]);
export type ServerSnapshot = z.infer<typeof ServerSnapshot>;

/** SSE: nothing changed on the last poll; the data is fresh as of `checkedAt`. */
export const FreshNote = z.strictObject({ checkedAt: z.number() });
export type FreshNote = z.infer<typeof FreshNote>;

/** SSE event names on `GET /api/events`. */
export const SSE_SNAPSHOT = "snapshot";
export const SSE_FRESH = "fresh";
