import type { Mode } from "../live/controller.ts";
import { S } from "./strings.ts";
import { statusAgo } from "./format.ts";

/** Wordmark (orbit badge), the Universe title and the status line. */
export function Header({ mode, checkedAt, error }: { mode: Mode; checkedAt: number; error: boolean }) {
  return (
    <header className="brand" data-chrome>
      <div className="wordmark">
        <span className="orbit" aria-hidden="true"><i className="orbit-sun" /><i className="orbit-planet" /></span>
        <span className="wordmark-text">{S.brand.badge}</span>
      </div>
      <h1>{S.brand.title}</h1>
      <p className="status" aria-live="polite">
        {mode === "demo" && (
          <>
            <span className="badge" title={S.statusTip.demo}>{S.status.badgeDemo}</span>
            <span className="fresh" title={S.statusTip.demo} aria-label={S.statusTip.demo}><i className="dot" aria-hidden="true" />{S.status.demoText}</span>
          </>
        )}
        {(mode === "loading" || (mode === "live" && !checkedAt && !error)) && <span className="fresh"><i className="dot" aria-hidden="true" />{S.status.loading}</span>}
        {mode === "live" && checkedAt > 0 && (
          <span className="fresh ok" title={S.statusTip.ok} aria-label={S.status.updatedAria(statusAgo(checkedAt), S.statusTip.ok)}>
            <i className="dot" aria-hidden="true" />{S.status.updated(statusAgo(checkedAt))}
          </span>
        )}
      </p>
    </header>
  );
}
