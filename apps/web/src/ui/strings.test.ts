import { describe, expect, it } from "vitest";
import deck from "../../../../docs/copy/ui-strings.md?raw";
import indexHtml from "../../index.html?raw";
import { S } from "./strings.ts";

/**
 * The copy deck (docs/copy/ui-strings.md) is the source of truth for every user-facing string.
 * Sections 1 to 7 and 9 are product copy; section 8 is demo data, which lives in @solaria/universe.
 */
function deckRows(): { key: string; english: string }[] {
  const rows: { key: string; english: string }[] = [];
  let section = 0;
  for (const line of deck.split("\n")) {
    const h = /^## (\d+)\./.exec(line);
    if (h) { section = Number(h[1]); continue; }
    if (/^## /.test(line)) { section = 0; continue; }
    if (section === 0 || section === 8) continue;
    const m = /^\| `([^`]+)` \| (.*?) \|[^|]*\|\s*$/.exec(line);
    if (m?.[1] && m[2] !== undefined) rows.push({ key: m[1], english: m[2].replaceAll("<br>", "\n") });
  }
  return rows;
}

function lookup(path: string): unknown {
  let cur: unknown = S;
  for (const part of path.split(".")) {
    if (cur === null || typeof cur !== "object" || !(part in cur)) return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

describe("copy deck", () => {
  const rows = deckRows();

  it("is read", () => {
    expect(rows.length).toBeGreaterThan(100);
  });

  it.each(rows)("has $key", ({ key, english }) => {
    const value = lookup(key);
    expect(value, `missing S.${key}`).toBeDefined();
    if (typeof value === "string") {
      expect(value).toBe(english);
      return;
    }
    expect(typeof value, `S.${key} is neither a string nor a template`).toBe("function");
    // A template: call it with one marker per `${x}` (in order of first use) and compare with the deck.
    const names = [...new Set([...english.matchAll(/\$\{(\w+)\}/g)].map((m) => m[1] ?? ""))];
    const fn = value as (...args: string[]) => string;
    expect(fn.length, `S.${key} takes ${names.join(", ")}`).toBe(names.length);
    const expected = english.replace(/\$\{(\w+)\}/g, (_, n: string) => `<${n}>`);
    expect(fn(...names.map((n) => `<${n}>`))).toBe(expected);
  });

  it("names the page", () => {
    expect(indexHtml).toContain(`<title>${S.brand.pageTitle}</title>`);
  });
});
