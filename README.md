# Skyhold TD — Circle Tower Wars in voxels

Skyhold TD is a voxel port of [Circle Tower Wars](https://github.com/Arthaeris/Circle-TD). The rules, numbers, modes and menus are Circle's. The 2D art is replaced by one continuous, floating voxel world: corridor islands ring a chained vortex above a cosmic sea, and the camera flies between the world map and each corridor.

## Run it

Serve the folder over HTTP (ES modules need it):

```bash
python3 -m http.server 8000
```

Open <http://localhost:8000>. three.js r186 and the fonts come from CDNs, so the first load needs a connection.

- `?unlock` treats every element as mastered, which is handy for testing towers. Your saved progress is left untouched.
- **PC controls:** Space starts a wave · W world map · Q/E or ←/→ switch corridors · 1, 2, 3, 5 game speed · Esc pause · mouse wheel zooms · drag pans.
- **Touch controls:** tap an empty spot for the build ring (towers, plus 📍 *Builder* to send your builder there) · drag the green square to shift the spot · tap a tower for its ring · drag to pan · pinch to zoom.
- **Builders** (main menu or the run options): every look stands on a turntable — drag or swipe to turn it, ‹ › to flip through the looks, tap any card to try it on (locked ones too) and *Equip* to wear it.
- **Settings** (gear on the main menu, or the pause menu): music and sound effects on/off with volume, graphics quality, frame rate.

## What's in this version

- **Circle's simulation, unchanged.** `sim/` is Circle-TD's deterministic fixed-point core, copied as-is. The only additions are render-only events (beam/chain/melee paths, kills) that never feed back into the state. `node tools/parity-test.mjs <path-to-Circle-TD>` runs both sims on the same seeds and commands and compares state hashes on every tick.
- **All of Circle's content.** 8 elements, 40 towers, 26 statuses, 14 synergies, mutations, expert ranks, loop adaptations, wave affixes, bosses and the Sealed One. The content is `circle/database*.js`, byte-identical to Circle's.
- **Modes:**
  - Solo: Quick (one corridor), Standard (a loop of 3–8 corridors) or Endless, four difficulties, Gold or Essence economy, Manual or Auto pacing.
  - Vs NPCs, with Circle's maze-building bots, sends and the send panel.
  - **Play Online:** Vs for 2–8 players over Firebase, with room codes, NPC seats, chat and emotes, and rejoin after a disconnect. Add `?mocknet` to test with two local tabs. Co-op and Compete are still *Soon*.
- **Circle's shell:**
  - Menu, setup, HUD, survivors-by-origin panel, corridor nav and the wave dock with its next-wave preview.
  - Radial build and tower rings with tap-again-to-confirm (near an edge the bubbles fan out to the open side, so the spot is never covered), and compact cards that expand: tower (level, expert progress, stats with upgrade delta, targeting, synergies, mutations), enemy (live portrait, follow cam, traits), builder (queue, Inspire, sends) and the ⓘ wave guide for the next three waves. Boss bar and toasts.
  - Two field cameras: top-down and a close perspective view. Creeps enter at the top and walk towards you.
  - Pause, end screen with mastery progress, the Mastery and Synergy Codex screen, and Save / Import / Export. Circle's export files import here too.
  - Autosave after every wave, and Continue.
- **The voxel world:**
  - Riftfall-style batched voxel meshes, a bloom + ink-outline post pass and auto quality tiers.
  - Element-themed corridor islands carrying Circle's obstacle families, plus gate islands and bridges.
  - A vortex that breaks its chains when the End Boss is ready.
  - 40 unique tower models that grow at levels 4, 7 and 10 and show their mutations.
  - 7 instanced enemy models with status tints and freeze blocks, plus projectiles, beams, chain lightning, impact rings and route chevrons.
  - PixelPups-style voxel thumbnails in the menus.
- **Expanded content:**
  - 72 new creeps with traits: flyers, stealth, healers, summoners, splitters, tower-jammers, tricksters, elites.
  - Warcraft-3-style builders.
  - Line-Tower-Wars-style Vs: send tiers with stock and timers, life steal, NPCs from Easy to Insane, match modifiers.
  - Match stats and a leak report, replays (export/import) and spectating.
  - Post-victory challenges that unlock builder skins, and a Bestiary.
- **Skyhold rules (the default since the balance pass; Classic stays for old replays and parity):**
  - **Win = hold every wave.** Run length follows the corridors: 10 waves for Quick (1 corridor), 20 for 3–4, 22 for 5–6, 25 for 7–8. Clearing the last wave is the win (it counts for Mastery). Then the Vortex glows: tap it (or *Summon at the Vortex* in the dock) to call out the Sealed One, an optional bonus fight that unlocks a *Sealbreaker* builder skin per element. The victory screen comes after that fight, or when you choose *Finish run*.
  - **Solo difficulty:** Chill, Normal, Hard and Brutal scale creep health and speed only — the rules stay the same. The setup screen estimates the run length.
  - **Percentage armour:** damage × 25 / (25 + armour), so armour matters but never makes a creep immune. Towers deal Physical, Blast, Magic or Chaos damage; creeps are Unarmored, Light, Medium, Heavy, Fortified, Ethereal or Boss, and the class table bends damage between 0.5× and 1.5×. Every card shows both.
  - **Reactions:** 28 two-element pairs, always *A + B → C*. A tower of one element hits a creep carrying the other element's status and sets off a named effect (Thermal Shock, Wildfire, Overload…). Each creep can react once per second. The codex lists them all, and the setup screen shows the pair you picked.
  - **Pick an element and a partner.** Every corridor can build both, so the two elements meet in one maze.
  - **Stealth and air:** every tower is tagged (damage type, hits air, sees stealth). Light towers, support towers and any tower at level 7+ detect; the builder's lantern reveals creeps near it (Inspire a tower to park it), and a revealed creep stays marked for 2.5 s. The next-wave preview warns when you can't hit what's coming.
  - **Faster, clearer creeps:** creeps move about twice as fast (with HP and tower damage rebalanced to match), waves are staggered so creeps don't stack, enemies are drawn larger, and toasts sit above the dock instead of over the field. Speed goes up to ×5.
  - **Vs NPCs:** waves come on a shared timer, sent creeps leave after they leak, each corridor can only hold so much sent HP at once (no spam-wipes), life steal is capped, and wave HP ramps after 5 minutes so matches end. NPCs scout the next waves (air, stealth, armour) and build, upgrade and send accordingly.
  - **Challenges:** ten waves and a boss each, with the pool introduced gradually; winnable with any element pair, harder on Hard. Each challenge × element has its own builder look.
  - **Towers build and upgrade over time:** a bar over the tower shows the progress. An upgrade re-raises the tower, and each level takes 10% longer than the last.
  - **Your builder:** besides raising towers and Inspiring one, it can be sent anywhere (the ring's 📍 bubble, or *Move to…* on its card), so its lantern watches for stealth where you need it.
  - **Loops are one go:** a creep that slips out of a corridor walks on into the next; it costs a life only once it has come all the way round your ring. Ordinary creeps in a ring carry more health (×3.2 at 3 corridors up to ×8.4 at 8; heals still count from their normal health) and move a little faster per extra corridor, so a ring stays a fight. In Vs, it costs a life once it has passed every corridor you hold.
  - **Guided tour:** a spotlight tutorial (dims the screen, rings the one thing to press) on first launch, replayable from the menu and the pause menu. The defeat screen says why the run slipped away.
- **Audio:** Circle's music track plus synthesized sound effects.

## Layout

| Path | What it is |
|---|---|
| `circle/` | Circle's content database (unchanged) |
| `content/mobs.js` | Skyhold's bestiary, send tiers and challenges (Expanded rules) |
| `content/rules.js` | The Skyhold rules: armour, damage types, reactions, difficulty, run lengths and every balance number (`TUNE`) |
| `content/skins.js` | Builder skins and how each one unlocks |
| `app/npc.js` | The NPC brain (Vs seats, held online seats and the balance harness) |
| `ui/tutorial.js` | The spotlight tour engine |
| `sim/` | Circle's deterministic sim (`core.js` + render-only events) |
| `net/commands.js`, `app/loop.js`, `save.js` | Circle's command schema, fixed-step loop and save layer (Skyhold storage keys) |
| `app/main.js` | Shell orchestrator, ported from Circle: commands, screens, autosave, bots, input |
| `ui/shell.js`, `ui/icons.js` | Circle's UI panels and rings, elemental sigils and SVG icons |
| `render/` | `renderer.js` (camera, sync, picking), `world.js` (ring, islands, gates, vortex, sea), `towers.js` (+ `towermodels.js`: all 40 towers as voxel sculpts), `enemies.js` (+ `bossmodels.js`: voxel bosses, `mobvox.js`: voxel body plans, accessories and weapons for the five classic creeps and all 80 bestiary enemies), `voxkit.js` (voxel sculpting kit), `propmodels.js` (voxel obstacles and island props), `ringmodels.js` (voxel portals, gate islands, vortex, bridges), `buildermodels.js` (voxel builders: a creature per element + outfits per unlock), `shotfx.js` (per-tower projectiles, trails, impacts, beams and chains), `statusfx.js` (status markers and particles, voxel ice), `effects.js`, `post.js`, `kit.js`, `theme.js`, `thumbs.js` |
| `audio/sound.js` | Music and synthesized SFX |
| `tools/` | `parity-test.mjs`, `expanded-soak.mjs`, `balance-sim.mjs`, plus `preview.html` and `gallery.html` for eyeballing the world and models |
| `docs/PORT_NOTES.md` | Decisions, known gaps and the backlog |

Circle-TD remains a separate project; this port only changes Skyhold-TD.
