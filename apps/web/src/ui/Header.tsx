import { useEffect, useState } from "react";
import type { Mode } from "../live/controller.ts";
import { S } from "./strings.ts";
import { cadenceText, oldAfter, statusAgo } from "./format.ts";

interface Props {
  mode: Mode;
  checkedAt: number;
  /** How often the server checks GitHub (ms); 0 when unknown. */
  pollMs: number;
  error: boolean;
  /** Repos showing their last good data. */
  stale: string[];
}

/** Wordmark (orbit badge), the Universe title and the status line. */
export function Header({ mode, checkedAt, pollMs, error, stale }: Props) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 10_000);
    return () => clearInterval(t);
  }, []);
  const loading = mode === "loading" || (mode === "live" && !checkedAt && !error);
  const live = mode === "live" && checkedAt > 0;
  const ago = statusAgo(checkedAt, Math.max(now, checkedAt));
  const old = live && now - checkedAt > oldAfter(pollMs);
  const why = stale.length ? S.statusTip.stale(stale.join(", "), ago) : old ? S.statusTip.old(ago) : S.statusTip.ok(cadenceText(pollMs || 60_000));
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
        {loading && <span className="fresh"><i className="dot" aria-hidden="true" />{S.status.loading}</span>}
        {live && (
          <span className={`fresh ${stale.length || old ? "stale" : "ok"}`} title={why} aria-label={S.status.updatedAria(ago, why)}>
            <i className="dot" aria-hidden="true" />{S.status.updated(ago)}
          </span>
        )}
      </p>
    </header>
  );
}
