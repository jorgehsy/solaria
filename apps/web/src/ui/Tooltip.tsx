import { forwardRef } from "react";
import type { TipInfo } from "../scene/Scene.ts";
import { S } from "./strings.ts";

/** The hover card. The Scene positions it each frame; this only renders its content. */
export const Tooltip = forwardRef<HTMLDivElement, { tip: TipInfo | null }>(function Tooltip({ tip }, ref) {
  const cls = `tip${tip ? " on" : ""}${tip?.touch ? " touch" : ""}`;
  return (
    <div className={cls} ref={ref} role="tooltip">
      {tip && (
        <>
          <span className="tip-ref">
            {tip.repo} <b>#{tip.number}</b>
            {tip.kind === "issue" && tip.mapTitle ? ` · ${tip.mapTitle}` : ""}
          </span>
          <span className="tip-title">{tip.title}</span>
          {tip.kind === "issue" && tip.outsideBlockers.map((r) => <span key={r} className="tip-outside">{S.tip.outsideBlocker(r)}</span>)}
          <span className="tip-foot">
            {tip.kind === "sun" ? (
              <span className="chip"><span className="g g-sun" aria-hidden="true" />{S.tip.sunChip(tip.done, tip.total)}</span>
            ) : (
              <span className="chip">
                <span className={`g g-${tip.state === "done" ? "todo" : tip.state}`} aria-hidden="true" />
                {S.state[tip.state]}
                {tip.assignees.length ? S.tip.planetAssigned(tip.assignees.join(", ")) : ""}
                {tip.external && <span className="tip-tag">{S.tip.external}</span>}
              </span>
            )}
            {tip.touch && <a href={tip.url} target="_blank" rel="noopener">{S.tip.openOnGithub}</a>}
          </span>
        </>
      )}
    </div>
  );
});
