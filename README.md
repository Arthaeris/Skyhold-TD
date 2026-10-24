# Skyhold TD — Circle Tower Wars in Voxels

Skyhold TD is a voxel-rendered port of Circle Tower Wars. The intended rule set is Circle's; the voxel world replaces the 2D asset/rendering layer, not the underlying tower-defense design.

## Run locally

Serve the repository over HTTP because the game uses JavaScript modules:

```bash
python -m http.server 8000
```

Open [http://localhost:8000](http://localhost:8000). Three.js and Google Fonts are loaded from CDNs, so the first run needs an internet connection.

## What is integrated in this port slice

- Circle's original deterministic, fixed-step simulation core, fixed-point math, seeded random stream, wave generation, and flow-field pathfinding are copied into the Skyhold repository under `sim/circle-*.js`.
- The original Circle content database and extension data are kept under `circle/`; tower stats, enemy stats, elements, statuses, synergies, wave pacing, upgrade scaling, and economy rules come from that data.
- A 31 × 61 corridor grid is rendered in Three.js. The highlighted route is derived from the live flow field, not a hand-authored spline.
- Towers occupy Circle's 3 × 3 grid footprint. Placement is validated by the Circle simulation, which rejects placements that block the entrance-to-exit route.
- Circle-style loop behavior, lives, gold, wave clears, bosses, tower upgrades/selling, target modes, and combat/status logic run in the simulation.
- The first UI slice exposes the four starter elements and their five tower tiers, with touch-first controls and PC mouse/keyboard support.
- Tower and enemy visuals are voxel interpretations of Circle's elemental themes and enemy data.

## Current scope and honest limitations

This is a **first gameplay port slice**, not yet complete parity with every Circle Tower Wars mode. The active scene currently displays one Fire corridor. The simulation core supports much more of Circle's systems than the current presentation exposes; multi-corridor navigation, mastery persistence/unlocks, co-op/versus interfaces, save migration, and complete visual representations of every status/attack are still follow-up work.

The game has been connected to the Circle simulation source, but it has **not yet been verified in a live browser in this environment**. Please report any console errors or unexpected placement/combat behavior from your device so the next iteration can target real issues.

## Project layout

- `circle/database.js`, `circle/database-ext.js` — Circle content, element definitions, tower/enemy balance, statuses, synergies, and extension data.
- `sim/circle-core.js` — deterministic Circle simulation.
- `sim/circle-pathfind.js` — Circle grid flow field and reachability.
- `sim/circle-fx.js`, `sim/circle-rng.js`, `sim/circle-waves.js`, `sim/circle-balance.js` — original simulation support modules.
- `sim/circle-adapter.js` — Skyhold bootstrap adapter and grid/world coordinate conversion.
- `art.js` — reusable voxel parts and data-driven tower/enemy models.
- `render/scene.js`, `render/terrain.js`, `render/models.js` — Three.js camera, grid/route, obstacles, portals, and entities.
- `game.js` — input and fixed-step simulation/render loop.
- `ui.js`, `style.css` — mobile-first HUD and PC layout.
- `docs/STYLE_AND_PORT_PLAN.md` — visual direction and remaining port plan.

## Project boundary

Circle-TD is a separate source project. This port work only changes Skyhold-TD.
