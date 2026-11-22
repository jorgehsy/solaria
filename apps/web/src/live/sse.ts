import { FreshNote, SSE_FRESH, SSE_SNAPSHOT, ServerSnapshot } from "@solaria/contract";
import type { Controller } from "./controller.ts";

/**
 * Follow the server's live stream: the full snapshot on connect and on every change, a small
 * "still fresh" note otherwise. EventSource reconnects on its own after a drop.
 */
export function followLive(controller: Controller, url = "/api/events"): () => void {
  const es = new EventSource(url);
  es.addEventListener(SSE_SNAPSHOT, (e) => {
    const snap = ServerSnapshot.safeParse(JSON.parse((e as MessageEvent<string>).data));
    if (snap.success && snap.data.mode === "live") controller.live(snap.data);
  });
  es.addEventListener(SSE_FRESH, (e) => {
    const note = FreshNote.safeParse(JSON.parse((e as MessageEvent<string>).data));
    if (note.success) controller.fresh(note.data.checkedAt);
  });
  return () => es.close();
}
