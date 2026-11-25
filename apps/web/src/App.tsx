import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { ServerSnapshot } from "@solaria/contract";
import type { DemoEventKind } from "@solaria/universe";
import { Controller } from "./live/controller.ts";
import { followLive } from "./live/sse.ts";
import type { ControllerState, Targets } from "./live/controller.ts";
import { Scene } from "./scene/Scene.ts";
import type { Searchable, TipInfo } from "./scene/Scene.ts";
import { S } from "./ui/strings.ts";
import { Header } from "./ui/Header.tsx";
import { Legend } from "./ui/Legend.tsx";
import { ActivityLog } from "./ui/ActivityLog.tsx";
import { DemoPanel } from "./ui/DemoPanel.tsx";
import { Search } from "./ui/Search.tsx";
import { Tooltip } from "./ui/Tooltip.tsx";
import { Card } from "./ui/Card.tsx";
import { galaxyNotes, universeCard } from "./ui/galaxyNotes.ts";
import { IconCards, IconCollapse, IconDemo, IconExpand, IconFit, IconSearch, IconTour } from "./ui/icons.tsx";

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const still = () => reduceMotion.matches;
const controller = new Controller({ reducedMotion: still });

/** Auto tour: after 2 minutes with no input. Remembered in localStorage. */
const IDLE_MS = 2 * 60 * 1000;
const TOUR_KEY = "solaria.tour";
function readTour(): boolean {
  try {
    const v = localStorage.getItem(TOUR_KEY);
    if (v === "1") return true;
    if (v === "0") return false;
  } catch { /* storage blocked */ }
  return !still();
}

/** Cards toggle: note cards at each Galaxy, the hover card and the dim/ghost look; on by default. On first load they wait 4 s. Remembered in localStorage. */
const CARDS_KEY = "solaria.cards";
const CARDS_DELAY_MS = 4000;
function readCards(): boolean {
  try { return localStorage.getItem(CARDS_KEY) !== "0"; } catch { return true; }
}

export function App() {
  const state = useSyncExternalStore(controller.subscribe, controller.getState);
  const rootRef = useRef<HTMLDivElement>(null);
  const glRef = useRef<HTMLDivElement>(null);
  const labelsRef = useRef<HTMLDivElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<Scene | null>(null);
  const [tip, setTip] = useState<TipInfo | null>(null);
  const [desc, setDesc] = useState("");
  const [notice, setNotice] = useState<{ title: string; text: string } | null>(null);
  const [demoOpen, setDemoOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [tourOn, setTourOn] = useState(readTour);
  const [cardsOn, setCardsOn] = useState(readCards);
  const [cardsReady, setCardsReady] = useState(false);
  /** What the Scene should do with note cards right now (read again when the Scene starts). */
  const cardsShown = useRef(false);
  const cardsOnRef = useRef(cardsOn);
  const [fs, setFs] = useState<null | "api" | "css">(null);
  const lastInput = useRef(0);
  const searchBtn = useRef<HTMLButtonElement>(null);
  const demoBtn = useRef<HTMLButtonElement>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const now = useNow(10_000);

  // Boot: start the Scene, then ask the server which mode to run in.
  useEffect(() => {
    const root = rootRef.current, host = glRef.current, labels = labelsRef.current;
    if (!root || !host || !labels) return;
    let alive = true;
    let unfollow: (() => void) | null = null;
    const scene = new Scene({
      host, labels, root,
      chrome: () => [...root.querySelectorAll("[data-chrome]")],
      reducedMotion: still,
      onTip: setTip,
      onDescribe: setDesc,
    });
    controller.start();
    void (async () => {
      const r = await scene.init();
      if (!alive) { if (r === "ok") scene.destroy(); return; }
      if (r === "ok") {
        sceneRef.current = scene;
        scene.setTipElement(tipRef.current);
        scene.setNotesShown(cardsShown.current);
        scene.setCardsOn(cardsOnRef.current);
        controller.attachScene(scene);
      } else {
        setNotice({ title: S.err.webgl.title, text: r === "nowebgl" ? S.err.webgl.text : S.err.webgl.initFailed });
      }
      let snap: ServerSnapshot = { mode: "demo" };
      try {
        const res = await fetch("/api/snapshot");
        snap = ServerSnapshot.parse(await res.json());
      } catch {
        // No server answer (for example the web app opened on its own): the demo still runs in the browser.
      }
      if (!alive || controller.getState().mode !== "loading") return;
      if (snap.mode === "demo") controller.startDemo();
      else {
        controller.live(snap);
        unfollow = followLive(controller);
      }
    })();
    const prune = setInterval(() => controller.pruneLog(), 20_000);
    return () => {
      alive = false;
      unfollow?.();
      clearInterval(prune);
      controller.attachScene(null);
      controller.stop();
      sceneRef.current?.destroy();
      sceneRef.current = null;
    };
  }, []);

  useEffect(() => { document.title = S.brand.pageTitle; }, []);

  // Error and empty states at each Galaxy: ghost, dimmed stale data, small cards, quiet lines.
  useEffect(() => {
    const u = controller.universe();
    const counts: Record<string, { open: number; maps: number }> = {};
    for (const r of u.repos) counts[r] = { open: 0, maps: 0 };
    for (const i of Object.values(u.issues)) { const c = counts[i.repo]; if (c && !i.closed) c.open++; }
    for (const m of Object.values(u.maps)) { const c = counts[m.repo]; if (c) c.maps++; }
    sceneRef.current?.setNotes(galaxyNotes({ mode: state.mode, status: state.status, repos: state.repos, counts, now }));
  }, [state, now]);

  // First load: cards wait a few seconds so the map is seen clean first.
  useEffect(() => {
    const t = setTimeout(() => setCardsReady(true), CARDS_DELAY_MS);
    return () => clearTimeout(t);
  }, []);
  useEffect(() => {
    cardsShown.current = cardsOn && cardsReady;
    cardsOnRef.current = cardsOn;
    sceneRef.current?.setNotesShown(cardsShown.current);
    sceneRef.current?.setCardsOn(cardsOn);
  }, [cardsOn, cardsReady]);
  const setCards = useCallback((on: boolean) => {
    setCardsOn(on);
    try { localStorage.setItem(CARDS_KEY, on ? "1" : "0"); } catch { /* storage blocked */ }
  }, []);

  const highlight = useCallback((t: Targets | null) => sceneRef.current?.highlight(t), []);
  const go = useCallback((t: Targets) => sceneRef.current?.travel(t, 800), []);
  const seen = useCallback((id: string) => controller.markLogSeen(id), []);
  const tourOnRef = useRef(tourOn);
  useEffect(() => { tourOnRef.current = tourOn; }, [tourOn]);
  // With the Auto tour on, a demo event starts the tour at once so the camera frames it.
  const demo = useCallback((k: DemoEventKind) => {
    if (tourOnRef.current) sceneRef.current?.tourStart();
    controller.demo(k);
  }, []);

  const setTour = useCallback((on: boolean) => {
    setTourOn(on);
    try { localStorage.setItem(TOUR_KEY, on ? "1" : "0"); } catch { /* storage blocked */ }
    if (!on) sceneRef.current?.tourStop();
    lastInput.current = performance.now();
  }, []);

  // Any input stops the tour on the spot; 2 minutes of quiet starts it.
  useEffect(() => {
    // Input in the demo panel does not count: its buttons are how the demo shows events on the tour.
    const inDemo = (e: Event) => e.target instanceof Element && !!e.target.closest("#demo");
    const onInput = (e: Event) => {
      if (inDemo(e)) return;
      lastInput.current = performance.now();
      sceneRef.current?.tourStop();
    };
    const onMove = (e: PointerEvent) => { if (e.pointerType !== "touch" && (e.movementX || e.movementY)) onInput(e); };
    const opts = { capture: true, passive: true } as const;
    lastInput.current = performance.now();
    for (const t of ["pointerdown", "wheel", "keydown", "touchstart"]) window.addEventListener(t, onInput, opts);
    window.addEventListener("pointermove", onMove, opts);
    const t = setInterval(() => {
      const s = sceneRef.current;
      if (!tourOn || !s || document.hidden || s.touring() || notice || searchOpen) return;
      if (performance.now() - lastInput.current >= IDLE_MS) s.tourStart();
    }, 2000);
    return () => {
      for (const n of ["pointerdown", "wheel", "keydown", "touchstart"]) window.removeEventListener(n, onInput, opts);
      window.removeEventListener("pointermove", onMove, opts);
      clearInterval(t);
    };
  }, [tourOn, notice, searchOpen]);

  // Full screen: the real API when allowed, else a clean mode without the chrome.
  const toggleFs = useCallback(() => {
    const el = rootRef.current;
    if (!el) return;
    if (fs === "css") { setFs(null); return; }
    if (fs === "api") { void document.exitFullscreen().catch(() => undefined); return; }
    if (!document.fullscreenEnabled || !el.requestFullscreen) { setFs("css"); return; }
    el.requestFullscreen().catch(() => setFs("css"));
  }, [fs]);
  useEffect(() => {
    const on = () => setFs((cur) => (document.fullscreenElement === rootRef.current ? "api" : cur === "api" ? null : cur));
    document.addEventListener("fullscreenchange", on);
    return () => document.removeEventListener("fullscreenchange", on);
  }, []);

  const closeSearch = useCallback((back: boolean) => {
    setSearchOpen(false);
    if (back) searchBtn.current?.focus();
  }, []);
  const choose = useCallback((h: Searchable) => {
    setSearchOpen(false);
    const s = sceneRef.current;
    if (!s) return;
    const t: Targets = h.kind === "map"
      ? { issues: [], maps: [h.key], repos: [h.repo], prs: [] }
      : { issues: [h.key], maps: [], repos: [h.repo], prs: [] };
    s.travel(t, 800);
    clearTimeout(flashTimer.current);
    s.highlight(t);
    flashTimer.current = setTimeout(() => s.highlight(null), still() ? 2000 : 2800);
  }, []);

  // Keyboard: / search, P tour, C cards, D demo, 0 recenter, F full screen, arrows pan, +/- zoom.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.target instanceof Element && e.target.closest("input, textarea, select")) return;
      const k = e.key, s = sceneRef.current;
      if (k === "/") { setSearchOpen(true); e.preventDefault(); return; }
      if (k === "p" || k === "P") { setTour(!tourOn); e.preventDefault(); return; }
      if (k === "c" || k === "C") { setCards(!cardsOn); e.preventDefault(); return; }
      if (k === "d" || k === "D") { setDemoOpen((o) => !o); e.preventDefault(); return; }
      if (k === "Escape") {
        if (fs === "css") { setFs(null); e.preventDefault(); return; }
        if (demoOpen) { setDemoOpen(false); demoBtn.current?.focus(); return; }
        s?.closeTip();
        return;
      }
      if (k === "0") { s?.recenter(); e.preventDefault(); return; }
      if (k === "f" || k === "F") { toggleFs(); e.preventDefault(); return; }
      if (e.target !== rootRef.current && e.target !== document.body) return;
      const step = 64;
      if (k === "ArrowLeft") s?.keyPan(step, 0);
      else if (k === "ArrowRight") s?.keyPan(-step, 0);
      else if (k === "ArrowUp") s?.keyPan(0, step);
      else if (k === "ArrowDown") s?.keyPan(0, -step);
      else if (k === "+" || k === "=") s?.keyPan(0, 0, 1.25);
      else if (k === "-") s?.keyPan(0, 0, 1 / 1.25);
      else return;
      e.preventDefault();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [tourOn, cardsOn, demoOpen, fs, setTour, setCards, toggleFs]);

  const cls = ["u", fs ? "is-clean" : "", demoOpen ? "demo-open" : ""].filter(Boolean).join(" ");
  const cardsLabel = cardsOn ? S.tool.cardsOn : S.tool.cardsOff;
  const tourLabel = tourOn ? S.tool.tourOn : S.tool.tourOff;
  const fsLabel = fs ? S.tool.fullscreenExit : S.tool.fullscreenEnter;
  return (
    <div className={cls} ref={rootRef} tabIndex={0} role="group" aria-label={S.brand.ariaLabel} aria-describedby="uDesc">
      <div className="gl" ref={glRef} aria-hidden="true" />
      <div className="labels" ref={labelsRef} />
      {state.mode === "demo" && <div className="veil" aria-hidden="true" />}
      <Header mode={state.mode} checkedAt={state.checkedAt} pollMs={state.pollMs} error={state.status.state === "error"} stale={state.repos.filter((r) => r.stale).map((r) => r.repo)} />
      <div className="tools" data-chrome>
        <button ref={searchBtn} className="tool" type="button" aria-label={S.tool.search} title={S.tool.search} aria-expanded={searchOpen} aria-controls="search" onClick={() => setSearchOpen((o) => !o)}><IconSearch /></button>
        <button className="tool" type="button" aria-pressed={tourOn} aria-label={tourLabel} title={tourLabel} onClick={() => setTour(!tourOn)}><IconTour /></button>
        <button className="tool" type="button" aria-pressed={cardsOn} aria-label={cardsLabel} title={cardsLabel} onClick={() => setCards(!cardsOn)}><IconCards /></button>
        <button ref={demoBtn} className="tool" type="button" aria-label={S.tool.demo} title={S.tool.demo} aria-expanded={demoOpen} aria-controls="demo" onClick={() => setDemoOpen((o) => !o)}><IconDemo /></button>
        <button className="tool" type="button" aria-label={S.tool.recenter} title={S.tool.recenter} onClick={() => sceneRef.current?.recenter()}><IconFit /></button>
        <button className="tool tool-fs" type="button" aria-label={fsLabel} title={fsLabel} onClick={toggleFs}>{fs ? <IconCollapse /> : <IconExpand />}</button>
      </div>
      <ActivityLog log={state.log} reducedMotion={still()} onHover={highlight} onGo={go} onSeen={seen} />
      <Legend />
      {searchOpen && <Search searchables={() => sceneRef.current?.searchables() ?? []} onChoose={choose} onClose={closeSearch} />}
      {demoOpen && <DemoPanel live={state.mode === "live"} onEvent={demo} />}
      <Tooltip ref={tipRef} tip={tip} />
      <UniverseCard state={state} now={now} />
      {notice && <Card title={notice.title} hint={notice.text} />}
      <p className="sr-only" id="uDesc">{desc}</p>
    </div>
  );
}

/** The one universe-wide card, if any: demo with no token, a rejected token, no repos, GitHub silent, rate limit. */
function UniverseCard({ state, now }: { state: ControllerState; now: number }) {
  const c = universeCard({ mode: state.mode, status: state.status, repos: state.repos, now });
  return c ? <Card title={c.title} hint={c.hint} snippet={c.snippet} place={c.place} /> : null;
}

/** The clock, ticking every `ms`: ages and countdowns on the cards. */
function useNow(ms: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}
