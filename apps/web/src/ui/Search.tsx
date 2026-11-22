import { useEffect, useRef, useState } from "react";
import type { Searchable } from "../scene/Scene.ts";
import { S } from "./strings.ts";

const fold = (t: string) => t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/** Finds issues and Maps by `#N`, `repo#N`, `owner/repo#N` or part of the title. `#N` matches every repo. */
export function findHits(all: Searchable[], q: string): Searchable[] {
  q = q.trim();
  if (!q) return [];
  const m = /^(?:([a-z0-9_.\-/]+))?#(\d+)$/i.exec(q) ?? (/^\d+$/.test(q) ? [q, "", q] : null);
  if (m) {
    const n = Number(m[2]);
    const repo = (m[1] ?? "").toLowerCase();
    return all.filter((x) => x.number === n && (!repo || x.repo.toLowerCase().endsWith(repo))).sort((a, b) => Number(a.kind === "map") - Number(b.kind === "map")).slice(0, 6);
  }
  const f = fold(q);
  return all
    .filter((x) => fold(x.title).includes(f) || fold(`${x.repo}#${x.number}`).includes(f))
    .sort((a, b) => fold(a.title).indexOf(f) - fold(b.title).indexOf(f) || Number(b.kind === "map") - Number(a.kind === "map"))
    .slice(0, 6);
}

interface Props {
  searchables: () => Searchable[];
  onChoose: (h: Searchable) => void;
  onClose: (back: boolean) => void;
}

export function Search({ searchables, onChoose, onClose }: Props) {
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => input.current?.focus(), []);
  const hits = findHits(searchables(), q);
  const choose = (h: Searchable | undefined) => { if (h) onChoose(h); };
  return (
    <div className="search in" id="search" ref={box} role="dialog" aria-label={S.search.dialogAria} data-chrome>
      <div className="search-row">
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4.5 4.5" /></svg>
        <input
          ref={input}
          type="text"
          value={q}
          placeholder={S.search.placeholder}
          autoComplete="off"
          spellCheck={false}
          role="combobox"
          aria-expanded={!!q.trim()}
          aria-controls="qList"
          aria-autocomplete="list"
          aria-label={S.search.inputAria}
          aria-activedescendant={hits.length ? `qh${active}` : undefined}
          onChange={(e) => { setQ(e.target.value); setActive(0); }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") { if (hits.length) setActive((active + 1) % hits.length); e.preventDefault(); }
            else if (e.key === "ArrowUp") { if (hits.length) setActive((active + hits.length - 1) % hits.length); e.preventDefault(); }
            else if (e.key === "Enter") { choose(hits[active]); e.preventDefault(); }
            else if (e.key === "Escape") { onClose(true); e.preventDefault(); e.stopPropagation(); }
          }}
          onBlur={() => setTimeout(() => { if (!box.current?.contains(document.activeElement)) onClose(false); }, 150)}
        />
      </div>
      <ul id="qList" role="listbox" aria-label={S.search.resultsAria}>
        {q.trim() && !hits.length && <li className="none" role="option" aria-selected={false} aria-disabled="true">{S.search.noResults(q.trim())}</li>}
        {hits.map((h, i) => (
          <li key={h.key} role="option" id={`qh${i}`} aria-selected={i === active} onPointerDown={(e) => { e.preventDefault(); choose(h); }}>
            <span className={`g ${h.kind === "map" ? "g-sun" : `g-${h.state === "done" ? "todo" : h.state}`}`} aria-hidden="true" />
            <span className="ref">{h.repo} #{h.number}</span>
            <span className="t">{h.title}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
