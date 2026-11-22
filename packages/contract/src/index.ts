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

/**
 * What the server tells the browser. Slice 1 only knows demo mode: no config, no GitHub data,
 * and the browser builds the demo Universe itself. The live snapshot joins this union in slice 3.
 */
export const DemoMessage = z.strictObject({
  mode: z.literal("demo"),
});
export const ServerSnapshot = z.discriminatedUnion("mode", [DemoMessage]);
export type ServerSnapshot = z.infer<typeof ServerSnapshot>;
