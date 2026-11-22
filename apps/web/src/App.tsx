import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { ServerSnapshot } from "@solaria/contract";
import type { DemoEventKind } from "@solaria/universe";
import { Controller } from "./live/controller.ts";
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
import { IconCollapse, IconDemo, IconExpand, IconFit, IconSearch, IconTour } from "./ui/icons.tsx";

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
  const [fs, setFs] = useState<null | "api" | "css">(null);
  const lastInput = useRef(0);
  const searchBtn = useRef<HTMLButtonElement>(null);
  const demoBtn = useRef<HTMLButtonElement>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Boot: start the Scene, then ask the server which mode to run in.
  useEffect(() => {
    const root = rootRef.current, host = glRef.current, labels = labelsRef.current;
    if (!root || !host || !labels) return;
    let alive = true;
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
      else controller.live(snap);
    })();
    const prune = setInterval(() => controller.pruneLog(), 20_000);
    return () => {
      alive = false;
      clearInterval(prune);
      controller.attachScene(null);
      controller.stop();
      sceneRef.current?.destroy();
      sceneRef.current = null;
    };
  }, []);

  useEffect(() => { document.title = S.brand.pageTitle; }, []);

  const highlight = useCallback((t: Targets | null) => sceneRef.current?.highlight(t), []);
  const go = useCallback((t: Targets) => sceneRef.current?.travel(t, 800), []);
  const seen = useCallback((id: string) => controller.markLogSeen(id), []);
  const demo = useCallback((k: DemoEventKind) => controller.demo(k), []);

  const setTour = useCallback((on: boolean) => {
    setTourOn(on);
    try { localStorage.setItem(TOUR_KEY, on ? "1" : "0"); } catch { /* storage blocked */ }
    if (!on) sceneRef.current?.tourStop();
    lastInput.current = performance.now();
  }, []);

  // Any input stops the tour on the spot; 2 minutes of quiet starts it.
  useEffect(() => {
    const onInput = () => { lastInput.current = performance.now(); sceneRef.current?.tourStop(); };
    const onMove = (e: PointerEvent) => { if (e.pointerType !== "touch" && (e.movementX || e.movementY)) onInput(); };
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

  // Keyboard: / search, P tour, D demo, 0 recenter, F full screen, arrows pan, +/- zoom.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.target instanceof Element && e.target.closest("input, textarea, select")) return;
      const k = e.key, s = sceneRef.current;
      if (k === "/") { setSearchOpen(true); e.preventDefault(); return; }
      if (k === "p" || k === "P") { setTour(!tourOn); e.preventDefault(); return; }
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
  }, [tourOn, demoOpen, fs, setTour, toggleFs]);

  const cls = ["u", fs ? "is-clean" : "", demoOpen ? "demo-open" : ""].filter(Boolean).join(" ");
  const tourLabel = tourOn ? S.tool.tourOn : S.tool.tourOff;
  const fsLabel = fs ? S.tool.fullscreenExit : S.tool.fullscreenEnter;
  return (
    <div className={cls} ref={rootRef} tabIndex={0} role="group" aria-label={S.brand.ariaLabel} aria-describedby="uDesc">
      <div className="gl" ref={glRef} aria-hidden="true" />
      <div className="labels" ref={labelsRef} />
      {state.mode === "demo" && <div className="veil" aria-hidden="true" />}
      <Header mode={state.mode} checkedAt={state.checkedAt} error={state.status.state === "error"} />
      <div className="tools" data-chrome>
        <button ref={searchBtn} className="tool" type="button" aria-label={S.tool.search} title={S.tool.search} aria-expanded={searchOpen} aria-controls="search" onClick={() => setSearchOpen((o) => !o)}><IconSearch /></button>
        <button className="tool" type="button" aria-pressed={tourOn} aria-label={tourLabel} title={tourLabel} onClick={() => setTour(!tourOn)}><IconTour /></button>
        <button ref={demoBtn} className="tool" type="button" aria-label={S.tool.demo} title={S.tool.demo} aria-expanded={demoOpen} aria-controls="demo" onClick={() => setDemoOpen((o) => !o)}><IconDemo /></button>
        <button className="tool" type="button" aria-label={S.tool.recenter} title={S.tool.recenter} onClick={() => sceneRef.current?.recenter()}><IconFit /></button>
        <button className="tool tool-fs" type="button" aria-label={fsLabel} title={fsLabel} onClick={toggleFs}>{fs ? <IconCollapse /> : <IconExpand />}</button>
      </div>
      <ActivityLog log={state.log} reducedMotion={still()} onHover={highlight} onGo={go} onSeen={seen} />
      <Legend />
      {searchOpen && <Search searchables={() => sceneRef.current?.searchables() ?? []} onChoose={choose} onClose={closeSearch} />}
      {demoOpen && <DemoPanel live={state.mode === "live"} onEvent={demo} />}
      <Tooltip ref={tipRef} tip={tip} />
      <UniverseCard state={state} />
      {notice && <Card title={notice.title} hint={notice.text} />}
      <p className="sr-only" id="uDesc">{desc}</p>
    </div>
  );
}

/** The one universe-wide card, if any: demo with no token, a rejected token, or no repos. */
function UniverseCard({ state }: { state: ControllerState }) {
  const U = S.universe;
  if (state.mode === "demo") return <Card title={U.demoNoToken.title} hint={U.demoNoToken.hint} snippet={U.demoNoToken.snippet} />;
  if (state.mode !== "live") return null;
  if (state.status.state === "error" && state.status.code === "bad_token") return <Card title={U.badToken.title} hint={U.badToken.hint} snippet={U.badToken.snippet} />;
  if (state.status.state === "ok" && !state.repos.length) return <Card title={U.noRepos.title} hint={U.noRepos.hint} snippet={U.noRepos.snippet} />;
  return null;
}
