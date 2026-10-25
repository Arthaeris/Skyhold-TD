# Skyhold TD — Circle Tower Wars in voxels

Skyhold TD is a voxel port of [Circle Tower Wars](https://github.com/Arthaeris/Circle-TD). The rules, numbers, modes and menus are Circle's. The 2D art is replaced by one continuous, floating voxel world: corridor islands ring a chained vortex above a cosmic sea, and the camera flies between the world map and each corridor.

## Run it

Serve the folder over HTTP (ES modules need it):

```bash
python3 -m http.server 8000
```

Open <http://localhost:8000>. three.js r186 and the fonts come from CDNs, so the first load needs a connection.

- `?unlock` treats every element as mastered, which is handy for testing towers. Your saved progress is left untouched.
- **PC controls:** Space starts a wave · W world map · Q/E or ←/→ switch corridors · 1–3 game speed · Esc pause · mouse wheel zooms · drag pans.
- **Touch controls:** tap to build and inspect · drag to pan · pinch to zoom.

## What's in this version

- **Circle's simulation, unchanged.** `sim/` is Circle-TD's deterministic fixed-point core, copied as-is. The only additions are render-only events (beam/chain/melee paths, kills) that never feed back into the state. `node tools/parity-test.mjs <path-to-Circle-TD>` runs both sims on the same seeds and commands and compares state hashes on every tick.
- **All of Circle's content.** 8 elements, 40 towers, 26 statuses, 14 synergies, mutations, expert ranks, loop adaptations, wave affixes, bosses and the Sealed One. The content is `circle/database*.js`, byte-identical to Circle's.
- **Modes:**
  - Solo, with Loop, Single and Endless waves, 1–8 corridors, Gold or Essence economy, Single or Stacking statuses, and Manual or Auto pacing.
  - Vs NPCs, with Circle's maze-building bots, sends and the send panel.
  - Co-op and Compete are shown as *Soon*. The sim supports them; only the network lobby is missing.
- **Circle's shell:**
  - Menu, setup, HUD, survivors-by-origin panel, corridor nav and the wave dock with its next-wave preview.
  - Radial build and tower rings with tap-again-to-confirm, the tower sheet with stats, targeting, synergies and mutations, the enemy sheet, boss bar and toasts.
  - Pause, end screen with mastery progress, the Mastery and Synergy Codex screen, and Save / Import / Export. Circle's export files import here too.
  - Autosave after every wave, and Continue.
- **The voxel world:**
  - Riftfall-style batched voxel meshes, a bloom + ink-outline post pass and auto quality tiers.
  - Element-themed corridor islands carrying Circle's obstacle families, plus gate islands and bridges.
  - A vortex that breaks its chains when the End Boss is ready.
  - 40 unique tower models that grow at levels 4, 7 and 10 and show their mutations.
  - 7 instanced enemy models with status tints and freeze blocks, plus projectiles, beams, chain lightning, impact rings and route chevrons.
  - PixelPups-style voxel thumbnails in the menus.
- **Expanded rules (default; Classic = Circle exactly):**
  - 72 new creeps with traits: flyers, stealth, healers, summoners, splitters, tower-jammers, tricksters, elites.
  - Warcraft-3-style builders.
  - Line-Tower-Wars-style Vs: send tiers with stock and timers, life steal, NPCs from Easy to Insane, match modifiers.
  - Match stats and a leak report, replays (export/import) and spectating.
  - Post-victory challenges that unlock builder skins, and a Bestiary.
- **Audio:** Circle's music track plus synthesized sound effects.

## Layout

| Path | What it is |
|---|---|
| `circle/` | Circle's content database (unchanged) |
| `content/mobs.js` | Skyhold's bestiary, send tiers, challenges and builder skins (Expanded rules) |
| `sim/` | Circle's deterministic sim (`core.js` + render-only events) |
| `net/commands.js`, `app/loop.js`, `save.js` | Circle's command schema, fixed-step loop and save layer (Skyhold storage keys) |
| `app/main.js` | Shell orchestrator, ported from Circle: commands, screens, autosave, bots, input |
| `ui/shell.js`, `ui/icons.js` | Circle's UI panels and rings, elemental sigils and SVG icons |
| `render/` | `renderer.js` (camera, sync, picking), `world.js` (ring, islands, gates, vortex, sea), `towers.js`, `enemies.js`, `effects.js`, `post.js`, `kit.js`, `theme.js`, `thumbs.js` |
| `audio/sound.js` | Music and synthesized SFX |
| `tools/` | `parity-test.mjs`, `expanded-soak.mjs`, plus `preview.html` and `gallery.html` for eyeballing the world and models |
| `docs/PORT_NOTES.md` | Decisions, known gaps and the backlog |

Circle-TD remains a separate project; this port only changes Skyhold-TD.
