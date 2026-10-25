# Skyhold TD — port notes

These notes supersede the earlier `STYLE_AND_PORT_PLAN.md` discussion draft. Its open questions were settled as follows.

## Decisions

| Topic | Decision |
|---|---|
| Field camera | Orthographic, tilted 55°, looking along the corridor's travel direction. Portrait phones fit the corridor's width and scroll its length, like Circle; landscape screens fit the whole corridor. Pinch/wheel zoom (1–4×) and drag pan. |
| World map | One 3D world. Corridor islands lie along the edges of Circle's polygon (gate k → gate k+1), so the loop enemies walk is the ring you see. Tapping a gate flies the camera down; the menu and setup screens orbit the same world. |
| Parity | Exact. Circle's sim and data are used unchanged, apart from render-only events. Improvements come later, as logged deviations (see the backlog). |
| Towers | 40 unique voxel models with 4 growth stages (Lv 1–3, 4–6, 7–9, 10 crowned) and mutation shards. |
| Enemies | First-pass chunky dark-fantasy models; expected to be replaced later. |
| UI | Circle's layout and wording, in dark liquid glass (PixelPups' glass recipe); voxel thumbnails in the rings, sheets, mastery and wave preview. |
| Circle assets reused | Music (`assets/audio/music.mp3`; Circle's menu and game tracks are the same file) and the app icon. Everything else is rendered. |
| World backdrop | `render/backdrop.js`, after Circle's world background art. The ring floats high above a glowing sea (y = −110). Around it are eight elemental landmasses (volcano with lava falls, jungle temple with waterfalls, ice and storm spires, rune shrines and portals), floating islets with waterfalls, sea stacks with foam rings, a whirlpool and light beam under the vortex, mist and cloud banks, and drifting motes. Coast foam and the shadows cast by floating islands come from a mask baked on the CPU. |
| Saves | Skyhold uses its own localStorage keys (`skyhold_*`), because Circle and Skyhold share the `arthaeris.github.io` origin. The export format is unchanged, so Circle exports import here. |

## Circle effects that exist only as data

Parity means these behave as they do in Circle, where the database describes them but the sim never reads them. They are the first candidates for the "improve what Circle claims" pass.

- **Statuses with no behaviour beyond triggering synergies:** Conductive, Purified, Marked For Death, Corrupted Logic.
- **Lifted:** a `custom` status whose handler is empty, so it does not slow (the comment in Circle says it should act slow-like).
- **Loop adaptations:** Momentum, Hardened and Veteran are applied after loops but have no effect.
- **Mutation flags never read by the sim:** `moltenBoost` (Eruption), `volatileChain` (Rebirth), `slowBoost` (Deep Chill), `spreadBoost` (Plague), `splashOnDeath` (Bloomling), `regen` (Grove), `shockBoost` (Static Field), `rampBoost` (Focus), `tagBoost` (Drone Swarm), `rewriteBoost` (Rewrite). The Hex mutation's `curseBoost: true` is never copied onto the Cursed status either.
- **Mastery gating:** the sim gates towers and mutations by the `masteryLevel` the client sends. Skyhold sends real mastery, as Circle does; Circle's restore path sends 5.

## Backlog

1. **Multiplayer.** Port `net/firebase.js` and `net/lockstep.js` and wire the Co-op and Compete cards. The sim already supports both modes.
2. **Circle's unimplemented effects** (list above), done as deliberate, documented deviations.
3. **Real-device pass.** The backdrop alone is about 0.5M vertices with 4 corridors and 0.8M with 8, so check phone frame rates and thin it out on the Low tier if needed. This version was verified in headless Chromium with software WebGL (all screens, a full wave, Vs NPCs, at phone and desktop sizes). It still needs testing on actual phones for frame rate, touch feel and safe areas.
4. **Enemy models.** Final art pass on the 7 enemies; walking and attack animation polish.
5. **Effects polish.** Per-element projectile shapes, status visuals beyond tints and motes (root snares, curse glyphs), and boss entrance moments.
6. **PWA/offline.** A service worker, and bundling three.js locally.
7. **Settings.** Colour-blind origin rings, reduced motion and a camera tilt option.

## Dev tools

- `node tools/parity-test.mjs ../Circle-TD` runs both sims on the same scripted sessions and compares state hashes on every tick.
- `tools/preview.html?n=4&view=world|field&i=0` shows the world ring without the game. World view also takes `z` (zoom out), `el` (tilt in degrees), `az` (radians) and `tx/ty/tz` (target), and logs the vertex count.
- `tools/gallery.html?stage=0..3&mut=0..2`, `?el=fire` (one element, all stages) and `?what=enemies` show the models.
