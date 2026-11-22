import { numberOf, repoOf } from "@solaria/universe";
import type { UniverseEvent } from "@solaria/universe";
import { S } from "./strings.ts";

/** Log "ago": now, 5 min, 2 h, 3 d. */
export function logAgo(at: number, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - at) / 1000));
  if (s < 60) return S.time.logNow;
  const m = Math.round(s / 60);
  if (m < 60) return S.time.logMin(m);
  const h = Math.round(m / 60);
  return h < 24 ? S.time.logHour(h) : S.time.logDay(Math.round(h / 24));
}

/** Status line "ago": just now, 40 s ago, 3 min ago, 2 h ago. */
export function statusAgo(at: number, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - at) / 1000));
  if (s < 10) return S.time.justNow;
  if (s < 60) return S.time.secAgo(Math.floor(s / 10) * 10);
  const m = Math.floor(s / 60);
  if (m < 60) return S.time.minAgo(m);
  return S.time.hourAgo(Math.floor(m / 60));
}

/** `#12` in the same repo, `api#12` in another repo of the same owner, `owner/repo#12` otherwise. */
export function refText(key: string, fromRepo: string): string {
  const repo = repoOf(key);
  const n = numberOf(key);
  if (repo === fromRepo) return `#${n}`;
  const [o1, r1] = repo.split("/");
  const [o2] = fromRepo.split("/");
  return o1 === o2 ? `${r1}#${n}` : `${repo}#${n}`;
}

/** The log row's tag and sentence for an event (copy deck section 5). */
export function eventText(ev: UniverseEvent): { tag: string; text: string } {
  const L = S.log;
  switch (ev.type) {
    case "bigbang":
      return { tag: L.bigbang.tag, text: L.bigbang.text(ev.mapTitle) };
    case "rift":
      return { tag: L.rift.tag, text: L.rift.text(numberOf(ev.issue)) };
    case "flare":
      return { tag: L.flare.tag, text: L.flare.text(numberOf(ev.issue), ev.mapTitle) };
    case "adopt":
      return { tag: L.adopt.tag, text: L.adopt.text(numberOf(ev.issue), ev.mapTitle) };
    case "comet": {
      const pr = numberOf(ev.pr);
      const refs = ev.closes.map((k) => refText(k, ev.repo)).join(", ");
      return { tag: L.comet.tag, text: refs ? L.comet.textRefs(pr, refs) : L.comet.text(pr) };
    }
    case "close":
      return { tag: L.close.tag, text: L.close.text(numberOf(ev.issue)) };
    case "supernova":
      return { tag: L.supernova.tag, text: L.supernova.textRefs(numberOf(ev.pr), ev.issues.map((k) => refText(k, ev.repo)).join(", ")) };
    case "prgone":
      // A merged PR with no closing refs is still a Supernova to the user.
      return ev.merged
        ? { tag: L.supernova.tag, text: L.supernova.text(numberOf(ev.pr)) }
        : { tag: L.fade.tag, text: L.fade.text(numberOf(ev.pr)) };
  }
}

/** The log pip colour token for an event. */
export function eventColor(ev: UniverseEvent): string {
  switch (ev.type) {
    case "rift": return "--ice";
    case "bigbang": case "flare": case "supernova": return "--sky";
    case "adopt": case "comet": return "--blue-text";
    case "prgone": return ev.merged ? "--sky" : "--ink-faint";
    case "close": return "--ink-faint";
  }
}
