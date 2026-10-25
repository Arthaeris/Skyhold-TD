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
| Corridor islands | The build grid (unchanged for gameplay) sits on an organic floating island. Its outline bulges along the sides and has rocky spurs, and it tapers to the portal plazas at each end. Around the grid is terraced ground with themed trees, outcrops and a shrine on each side. Underneath is a deep layered rock mass with stalactites, roots and crystals. Water, lava, void or gold falls pour off the edges, and loose rocks drift alongside. |
| Rulesets | **Classic** is Circle exactly; the parity test runs it. **Expanded** (the default) is Skyhold's own rules, gated on `state.x` in `sim/core.js` (the `[X]` hooks plus the EXPANDED section at the end of the file). It adds: 72 new creeps with traits (`content/mobs.js`); builders; send tiers with stock and unlock times; life steal; match modifiers; NPC difficulty; challenges; per-player stats. |
| Builders | One per corridor, Warcraft 3 style. A new tower waits for the builder to walk over, then rises over 1.2–5 s and can't fire until it's done. Upgrades take about a second. Selling an unfinished tower refunds it in full. The builders can be switched off in the match rules. |
| Flying / stealth | Flyers ignore the maze and fly portal to portal. Splash and melee towers can't hit them; everything else can. Stealthed creeps can only be targeted while a detecting tower (any Light tower, any tower at Lv 7+, any support tower) has them in range. |
| Saves | Skyhold uses its own localStorage keys (`skyhold_*`), because Circle and Skyhold share the `arthaeris.github.io` origin. The export format is unchanged, so Circle exports import here. |

## Circle effects that exist only as data

Parity means these behave as they do in Circle, where the database describes them but the sim never reads them. They are the first candidates for the "improve what Circle claims" pass.

- **Statuses with no behaviour beyond triggering synergies:** Conductive, Purified, Marked For Death, Corrupted Logic.
- **Lifted:** a `custom` status whose handler is empty, so it does not slow (the comment in Circle says it should act slow-like).
- **Loop adaptations:** Momentum, Hardened and Veteran are applied after loops but have no effect.
- **Mutation flags never read by the sim:** `moltenBoost` (Eruption), `volatileChain` (Rebirth), `slowBoost` (Deep Chill), `spreadBoost` (Plague), `splashOnDeath` (Bloomling), `regen` (Grove), `shockBoost` (Static Field), `rampBoost` (Focus), `tagBoost` (Drone Swarm), `rewriteBoost` (Rewrite). The Hex mutation's `curseBoost: true` is never copied onto the Cursed status either.
- **16.16 overflow (a real Circle bug):** HP above about 32,767 wraps negative. With 4 corridors, Circle's End Boss (18000 HP × the wave-40 scale) spawns with negative HP and dies on its first hit. Loop adaptations and level-5 sends can also overflow. Expanded caps HP at 32,000; Classic keeps Circle's behaviour.
- **Mastery gating:** the sim gates towers and mutations by the `masteryLevel` the client sends. Skyhold sends real mastery, as Circle does; Circle's restore path sends 5.

## Expanded ruleset — what's in, what's next

- **In:**
  - 72 creeps across 20 families, plus minions and four challenge bosses. Every trait in `content/mobs.js` is implemented and exercised by `tools/expanded-soak.mjs`.
  - Send tiers I–IV: unlock at 0:00, 2:30, 6:00 and 11:00, with stock 6/4/2/1 and recharge times of 4/8/16/30 s.
  - Life steal; modifiers (no flyers, no stealth, no disruptors, turbo income, random lanes, doppelgängers, anonymous, gold and lives multipliers).
  - NPCs at Easy, Normal, Hard and Insane (×0.75–×1.5 income, faster play; Hard and up scout your maze and send counters).
  - Match stats and a leak report (time, mob, HP left, wave, sender).
  - Replays: seed plus command log, verified by state hash at the end, with export and import.
  - Spectating after a Vs defeat.
  - Four challenges with Normal and Hard modes; eight builder skins.
- **Tune later:** all of the numbers are a first pass, including mob HP and costs, wave mixing (featured creeps take about 45% of each wave's HP budget) and tier timings.
- **Armour classes** are recorded on every creep (unarmored, light, medium, heavy, fortified, ethereal), waiting for the damage-type pass.
- **Multiplayer:** the expanded sim is deterministic (the soak runs every scenario twice and compares hashes every tick), so lockstep can use it as-is. Ranked play and ratings come with multiplayer.

## Backlog

1. **Multiplayer.** Port `net/firebase.js` and `net/lockstep.js` and wire the Co-op and Compete cards. The sim already supports both modes.
2. **Circle's unimplemented effects** (list above), done as deliberate, documented deviations.
3. **Real-device pass.** The world is about 0.6M vertices with 4 corridors and 1M with 8 (the backdrop plus roughly 75k per corridor island), so check phone frame rates and thin it out on the Low tier if needed. This version was verified in headless Chromium with software WebGL (all screens, a full wave, Vs NPCs, at phone and desktop sizes). It still needs testing on actual phones for frame rate, touch feel and safe areas.
4. **Enemy models.** Final art pass on the 7 enemies; walking and attack animation polish.
5. **Effects polish.** Per-element projectile shapes, status visuals beyond tints and motes (root snares, curse glyphs), and boss entrance moments.
6. **PWA/offline.** A service worker, and bundling three.js locally.
7. **Settings.** Colour-blind origin rings, reduced motion and a camera tilt option.

## Dev tools

- `node tools/parity-test.mjs ../Circle-TD` runs both sims on the same scripted sessions and compares state hashes on every tick (Classic ruleset).
- `node tools/expanded-soak.mjs [ticks]` soaks the Expanded ruleset (Vs with every send, a deep solo loop, a Hard challenge). It checks for crashes and bad values, confirms determinism and reports which mobs and abilities appeared.
- `tools/gallery.html?what=bestiary&page=0..3` and `&builders` show the new models.
- `tools/preview.html?n=4&view=world|field&i=0` shows the world ring without the game. World view also takes `z` (zoom out), `el` (tilt in degrees), `az` (radians) and `tx/ty/tz` (target), and logs the vertex count.
- `tools/gallery.html?stage=0..3&mut=0..2`, `?el=fire` (one element, all stages) and `?what=enemies` show the models.
