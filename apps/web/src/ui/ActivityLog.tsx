import { useEffect, useState } from "react";
import type { LogEntry, Targets } from "../live/controller.ts";
import { LOG_WINDOW } from "../live/controller.ts";
import { S } from "./strings.ts";
import { eventColor, eventText, logAgo } from "./format.ts";
import { IconExternal } from "./icons.tsx";

interface Props {
  log: LogEntry[];
  reducedMotion: boolean;
  onHover: (t: Targets | null) => void;
  onGo: (t: Targets) => void;
  onSeen: (id: string) => void;
}

/** The Activity log, bottom left: tag + sentence · repo · ago. Older rows fade. */
export function ActivityLog({ log, reducedMotion, onHover, onGo, onSeen }: Props) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 20_000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    for (const e of log) if (e.fresh) onSeen(e.id);
  }, [log, onSeen]);
  return (
    <ol className="log" aria-label={S.log.aria} aria-live="polite" data-chrome>
      {log.map((e, i) => {
        const { tag, text } = eventText(e.ev);
        const age = now - e.at;
        const fade = age < 90_000 ? 1 : Math.max(0.32, Math.min(0.82, 0.82 - 0.5 * (age / LOG_WINDOW)));
        const color = `var(${eventColor(e.ev)})`;
        const sentence = `${tag}: ${text}`;
        return (
          <li key={e.id} className={e.fresh && !reducedMotion ? "in" : ""} style={{ opacity: fade * (0.55 + 0.45 * ((i + 1) / log.length)) }}>
            <button
              type="button"
              className="log-go"
              title={S.log.showInUniverse}
              onClick={() => onGo(e.targets)}
              onPointerEnter={(ev) => ev.pointerType !== "touch" && onHover(e.targets)}
              onPointerLeave={(ev) => ev.pointerType !== "touch" && onHover(null)}
              onFocus={() => onHover(e.targets)}
              onBlur={() => onHover(null)}
            >
              <span className="pip" style={{ background: color, color }} aria-hidden="true" />
              <span className="tag">{tag}</span>
              <span className="txt">{text}</span>
              <span className="when">{` · ${e.ev.repo} · ${logAgo(e.at, now)}`}</span>
            </button>
            <a className="log-ext" href={e.ev.url} target="_blank" rel="noopener" title={S.log.openOnGithub} aria-label={S.log.openOnGithubAria(sentence)}>
              <IconExternal />
            </a>
          </li>
        );
      })}
    </ol>
  );
}
