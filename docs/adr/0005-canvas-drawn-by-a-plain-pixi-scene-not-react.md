# The canvas is drawn by a plain PixiJS Scene class, not by React

The web app is React, but the universe canvas is not rendered by React. One plain TypeScript `Scene` class in `apps/web/src/scene/` owns PixiJS, GSAP and d3, draws every frame, and plays the animations; a single React component mounts it and hands it snapshots and events. React renders only the DOM overlays (header, tools bar, search, log, legend, tooltip, banner, demo panel). We chose this over a React renderer for Pixi (such as `@pixi/react`) because the artifact's scene is already imperative, animations run every frame on Pixi's ticker with GSAP timelines, and pushing that through React reconciliation adds cost and a second mental model for no gain. The layout math is pulled out of the Scene into `packages/universe` as a pure function so it can be tested without a canvas.

## Consequences

- The Scene is not unit tested; correctness lives in the pure `diff` and layout in `packages/universe`, plus Playwright checks in the browser.
- React state never holds Pixi objects. The Scene keeps its own maps of galaxies, suns, planets and trails.
