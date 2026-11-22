import type { DemoEventKind } from "@solaria/universe";
import { S } from "./strings.ts";

const BUTTONS: { id: DemoEventKind; color: string }[] = [
  { id: "bigbang", color: "--sky" },
  { id: "rift", color: "--ice" },
  { id: "flare", color: "--sky" },
  { id: "adopt", color: "--blue-text" },
  { id: "comet", color: "--blue-text" },
  { id: "supernova", color: "--sky" },
  { id: "fade", color: "--ink-faint" },
];

/** Key D. One button per event (no Close button). Shown even when live data works. */
export function DemoPanel({ live, onEvent }: { live: boolean; onEvent: (k: DemoEventKind) => void }) {
  return (
    <section className="demo in" id="demo" aria-labelledby="demoTitle" data-chrome>
      <div className="demo-head">
        <h2 id="demoTitle">{S.demo.title}</h2>
        <span className="kbd" aria-hidden="true">{S.demo.kbd}</span>
      </div>
      <p>{live ? S.demo.noteLive : S.demo.noteDemo}</p>
      <div className="demo-grid">
        {BUTTONS.map((b) => (
          <button key={b.id} type="button" data-ev={b.id} title={S.demo[b.id].hint} onClick={() => onEvent(b.id)}>
            <span className="pip" style={{ color: `var(${b.color})` }} aria-hidden="true" />
            <span>{S.demo[b.id].label}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
