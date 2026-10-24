# Skyhold TD

A browser-based voxel tower defense game set on floating islands. This is a fresh project inspired by Circle-TD's gameplay and the modular Three.js voxel techniques explored in Riftfall and PixelPups.

## Run locally

Because the game uses JavaScript modules, serve this folder over HTTP instead of opening `index.html` directly. For example:

```bash
python -m http.server 8000
```

Then open [http://localhost:8000](http://localhost:8000).

No build step is required; Three.js is loaded from a CDN import map.

## Project layout

- `data.js` — shared configuration, palette, and tower definitions
- `art.js` — reusable voxel geometry/material helpers
- `world.js` — floating island and path construction
- `game.js` — application bootstrap, render loop, and placement input
- `ui.js` — HUD and player-facing controls
- `sim/` — renderer-independent gameplay simulation
- `render/` — Three.js scene, terrain, models, and effects

## Current prototype

The initial foundation includes a floating voxel island, a winding enemy path, tower placement, automatic targeting and firing, enemy waves, lives, and a simple resource economy. It is an early prototype, not yet a feature-complete port of Circle-TD.

Circle-TD remains a separate project and is not modified by this repository.
