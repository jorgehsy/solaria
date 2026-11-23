/**
 * Animated favicon. Firefox animates the CSS in /favicon.svg on its own; Chrome and Safari show
 * SVG favicons frozen on the first frame, so there we swap pre-rendered canvas frames instead.
 * Frames are drawn once up front, so each tick only changes the link's href. Background tabs get
 * throttled by the browser (about one tick per second in Chrome), so the planet steps there.
 */

const PERIOD_MS = 6000; // same as the header orbit badge
const FRAMES = 36; // 10° per frame, ~6 fps
const SIZE = 64;

/** Firefox animates the SVG itself; reduced motion keeps the static mark. */
export function needsJsAnimation(userAgent: string, reducedMotion: boolean): boolean {
  return !reducedMotion && !/firefox\//i.test(userAgent);
}

/** One frame of the orbit badge, mirroring favicon.svg (32-unit viewBox scaled to SIZE). */
function drawFrame(ctx: CanvasRenderingContext2D, angle: number): void {
  const k = SIZE / 32;
  const c = 16 * k;
  ctx.clearRect(0, 0, SIZE, SIZE);
  const disc = (x: number, y: number, r: number, fill: string) => {
    ctx.beginPath();
    ctx.arc(x, y, r * k, 0, Math.PI * 2);
    ctx.fillStyle = fill;
    ctx.fill();
  };
  disc(c, c, 16, "#081325");
  ctx.beginPath();
  ctx.arc(c, c, 10 * k, 0, Math.PI * 2);
  ctx.setLineDash([2.6 * k, 2.6 * k]);
  ctx.lineWidth = 1.5 * k;
  ctx.strokeStyle = "rgba(233, 243, 255, 0.5)";
  ctx.stroke();
  ctx.setLineDash([]);
  disc(c, c, 7, "rgba(255, 196, 107, 0.25)");
  disc(c, c, 4.5, "#ffc46b");
  // Planet starts at 12 o'clock and turns clockwise, like the CSS rotate().
  const px = c + Math.sin(angle) * 10 * k;
  const py = c - Math.cos(angle) * 10 * k;
  disc(px, py, 4.8, "rgba(72, 180, 255, 0.3)");
  disc(px, py, 3.5, "#48b4ff");
}

/** Starts the frame swap when the browser needs it. Returns a stop function. */
export function startFaviconAnimation(): () => void {
  const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  if (!needsJsAnimation(navigator.userAgent, reduced)) return () => {};
  const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = SIZE;
  const ctx = canvas.getContext("2d");
  if (!link || !ctx) return () => {};
  const original = link.href;
  const frames: string[] = [];
  for (let i = 0; i < FRAMES; i++) {
    drawFrame(ctx, (i / FRAMES) * Math.PI * 2);
    frames.push(canvas.toDataURL("image/png"));
  }
  link.type = "image/png";
  const tick = () => {
    const i = Math.floor(((Date.now() % PERIOD_MS) / PERIOD_MS) * FRAMES);
    const frame = frames[i];
    if (frame) link.href = frame;
  };
  tick();
  const t = setInterval(tick, PERIOD_MS / FRAMES);
  return () => {
    clearInterval(t);
    link.type = "image/svg+xml";
    link.href = original;
  };
}
