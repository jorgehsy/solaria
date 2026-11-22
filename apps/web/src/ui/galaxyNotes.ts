import type { RepoStatus, UniverseStatus } from "@solaria/contract";
import type { Mode } from "../live/controller.ts";
import { S } from "./strings.ts";
import { statusAgo } from "./format.ts";

/** How one Galaxy shows its repo's health in space (spec section 9). */
export interface GalaxyNote {
  /** ghost: failed with nothing to show; dim: last good data, kept drawn. */
  look: "normal" | "dim" | "ghost";
  /** Small card at the Galaxy: code title + hint, an optional snippet, and how old the data is. */
  card?: { title: string; text?: string; snippet?: string; age?: string };
  /** Faint italic line under an empty Galaxy. */
  quiet?: string;
}

export interface NotesInput {
  mode: Mode;
  status: UniverseStatus;
  repos: RepoStatus[];
  /** Per repo: open issues and Maps drawn. */
  counts: Record<string, { open: number; maps: number }>;
  now: number;
}

/** `acme-corp` → `ACME_CORP`, as in `GITHUB_TOKEN_ACME_CORP` (same rule as the server). */
const envOwner = (repo: string) => (repo.split("/")[0] ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "_");
const ageOf = (r: RepoStatus, now: number) => (r.okAt ? { age: S.repo.staleAge(statusAgo(r.okAt, now)) } : {});

/** Rate limited across the Universe: polling is paused until `resumeAt`. */
export const rateLimitedUntil = (s: UniverseStatus, now: number) => (s.resumeAt && s.resumeAt > now ? s.resumeAt : 0);

/** One note per repo that needs one. Pure: statuses in, notes out. */
export function galaxyNotes(i: NotesInput): Map<string, GalaxyNote> {
  const notes = new Map<string, GalaxyNote>();
  if (i.mode !== "live") return notes;
  // A rejected token draws no Galaxies: the centred card says it all.
  if (i.status.state === "error" && i.status.code === "bad_token") return notes;
  const limited = rateLimitedUntil(i.status, i.now) > 0;
  for (const r of i.repos) {
    const n = note(r, i, limited);
    if (n) notes.set(r.repo, n);
  }
  return notes;
}

function note(r: RepoStatus, i: NotesInput, limited: boolean): GalaxyNote | null {
  const C = S.code, R = S.repo;
  if (limited && (r.stale || r.code === "rate_limited")) return { look: "dim", card: { title: C.rate_limited, text: R.rateLimited.hint, ...ageOf(r, i.now) } };
  if (!r.ok) {
    switch (r.code) {
      case "bad_token":
        return { look: "ghost", card: { title: C.bad_token, snippet: R.noAccess.snippet(envOwner(r.repo)) } };
      case "no_access":
        return { look: "ghost", card: { title: C.no_access, text: R.noAccess.hint(r.repo.split("/")[0] ?? ""), snippet: R.noAccess.snippet(envOwner(r.repo)) } };
      case "not_found":
        return { look: "ghost", card: r.hint
          ? { title: C.not_found, text: R.notFound.hint(r.repo, r.hint), snippet: R.notFound.snippet(r.hint) }
          : { title: C.not_found, text: R.notFound.hintPlain(r.repo) } };
      case "rate_limited":
        return { look: r.stale ? "dim" : "ghost", card: { title: C.rate_limited, text: R.rateLimited.hint, ...ageOf(r, i.now) } };
      default:
        return r.stale
          ? { look: "dim", card: { title: C.network, text: R.network.hint, ...ageOf(r, i.now) } }
          : { look: "ghost", card: { title: C.network, text: R.network.hint } };
    }
  }
  const c = i.counts[r.repo];
  if (!c) return null;
  if (c.open === 0) return { look: "normal", quiet: R.noOpenIssues(r.repo) };
  if (c.maps === 0) return { look: "normal", card: { title: R.noMaps.title, text: R.noMaps.hint } };
  return null;
}

export interface UniverseCardInfo {
  title: string;
  hint: string;
  snippet?: string;
  /** centre: a universe-wide problem; top: rate limit, parked so the dimmed data stays visible. */
  place: "centre" | "top";
}

/**
 * The one universe-wide card, if any (spec section 9): demo with no token, a rejected token, no repos,
 * GitHub not answering for any repo, or the rate limit. no_access / not_found stay on each repo's ghost,
 * where the hint names the fix.
 */
export function universeCard(i: Omit<NotesInput, "counts">): UniverseCardInfo | null {
  const U = S.universe;
  if (i.mode === "demo") return { title: U.demoNoToken.title, hint: U.demoNoToken.hint, snippet: U.demoNoToken.snippet, place: "centre" };
  if (i.mode !== "live") return null;
  const s = i.status;
  if (s.state === "error" && s.code === "bad_token") return { title: U.badToken.title, hint: U.badToken.hint, snippet: U.badToken.snippet, place: "centre" };
  const until = rateLimitedUntil(s, i.now);
  if (until) {
    const time = new Date(until).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const countdown = S.time.inMin(Math.max(1, Math.ceil((until - i.now) / 60_000)));
    return { title: U.rateLimited.title, hint: U.rateLimited.hint(time, countdown), place: "top" };
  }
  if (s.state === "error" && s.code === "network") return { title: S.err.allFailed.title, hint: S.err.allFailed.text, place: "centre" };
  if (s.state === "ok" && !i.repos.length) return { title: U.noRepos.title, hint: U.noRepos.hint, snippet: U.noRepos.snippet, place: "centre" };
  return null;
}
