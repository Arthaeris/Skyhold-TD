# Skyhold TD — port notes

These notes supersede the earlier `STYLE_AND_PORT_PLAN.md` discussion draft. Its open questions were settled as follows.

## Decisions

| Topic | Decision |
|---|---|
| Field camera | Two views, toggled with the camera button in the corridor bar (remembered). **Top**: orthographic, tilted 55°. **Close**: a Riftfall-like perspective view at 36° and 34° FOV. Both look back up the corridor, so creeps enter at the top and walk towards you, showing their fronts. At zoom 1 the whole build grid is always in view (portrait: the grid; landscape: the grid plus portal plazas). Pinch/wheel zoom (1–4×) and drag pan. While you place a tower (build ring open, or the hover footprint on desktop), the grid gets a glowing frame and free cells no 3×3 tower can cover (narrow gaps, the portal mouths, spots that would cut the path) are hatched; otherwise the field stays clean. The hatching is worked out on a copy of the grid, in slices across frames. Island terrain beyond either end of the grid ramps up gently and carries no props within 8 cells, so nothing in front of the grid covers a build cell from either camera. Cards never zoom or recentre the camera. A selected tower glides clear of its card, and a selected enemy is followed (across corridors too) until you pan. |
| World map | One 3D world. Corridor islands lie along the edges of Circle's polygon (gate k → gate k+1), so the loop enemies walk is the ring you see. Tapping a gate flies the camera down; the menu and setup screens orbit the same world. |
| Parity | Exact. Circle's sim and data are used unchanged, apart from render-only events. Improvements come later, as logged deviations (see the backlog). |
| Towers | 40 unique voxel models with 4 growth stages (Lv 1–3, 4–6, 7–9, 10 crowned) and mutation shards. |
| Enemies | First-pass chunky dark-fantasy models; expected to be replaced later. |
| UI | Circle's layout and wording, in dark liquid glass (PixelPups' glass recipe), reworked for phones. One card system for towers, enemies, the builder, sends and the wave guide: a compact card above the dock that expands with its grip or "More", and a side panel on wide screens. The tower ring keeps upgrade, target and sell; the tower card shows level, expert stars and progress, DPS/range/speed with the next-level delta, air and stealth badges, with mutations and synergies under "More". The enemy card has a live 3D portrait bubble, HP and shield bars, and trait chips you tap for an explanation. The ⓘ next to Start Wave opens the wave guide: what's on the field, the next three waves, affixes, and every creep's traits. Modals are opaque enough to read. Toasts sit under the top bar. |
| Shots (deliberate fix, both rulesets) | A projectile whose target crosses into another corridor drops it, so towers never shoot across corridors. Beams/chains only draw when the target was just in range. `tools/parity-test.mjs` turns the fix off (`circleShots: true`) to compare against Circle. |
| Builder card | Tap the builder. It shows what it's doing and its queue; cancelling a construction refunds it in full. **Inspire**: pick a tower and the builder stands beside it, giving +10% attack speed while no construction is waiting (`BuilderInspire` command). In Vs the card also opens the send menu. After a job the builder waits where it is instead of walking home. |
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

## Online play (Firebase Realtime Database)

- **What it is:** online Vs for 2 to 8 seats, played on the Expanded rules at 1× speed, with waves on a shared 35-second timer (the first at 30 s).
- **Rooms:** created and joined by a 5-letter code or an invite link (`?room=CODE`). The host sets the seat count, fills seats with NPCs (Easy to Insane) and sets the match rules. Everyone picks their own element and readies up.
- **Netcode:** deterministic lockstep (`net/lockstep.js`). Turns are 3 ticks long and commands are scheduled 2 turns ahead, so every action takes effect 200 ms later for everyone.
  - The database stores per seat an ack `u` and write-once commands `c/$turn`. The rules (`database.rules.json`) make these consistent, so no client ever runs a turn it doesn't have every command for.
  - State hashes are compared every 15 s, and a toast warns if the screens drift apart.
- **Disconnects:** the match waits (with a countdown banner). After 30 s the "driver" (the lowest connected human) flags the seat as bot and plays it with the NPC brain.
  - The player can come back from the menu ("Rejoin room") or the invite link.
  - Their client re-simulates the match from the seed and every recorded command, then takes the seat back.
- **Social:** chat (140 characters, rate-limited) and eight emotes. Tap a name in the feed to mute that player.
- **Identity:** Firebase anonymous auth plus a nickname.
- **Local testing:** `?mocknet` switches to an in-browser stand-in server (`net/mock-worker.js`, a SharedWorker), so two tabs can play each other offline. It enforces the same lockstep rules.
- **Setup:** paste `database.rules.json` into the Firebase console under Realtime Database → Regeln (Rules) and publish. Anonymous sign-in must be enabled, and the hosting domain must be in Authentication → Settings → authorised domains.
- **Not yet:** the public lobby browser (backlog), team modes, ranked play, ratings and leaderboards.
- **Data cost:** about 10 small writes per second per player. Rooms older than 6 hours can be deleted by any signed-in client (the rules allow it); there's no automatic clean-up yet.

## Backlog

1. **Multiplayer, phase 2.** Public lobby browser, Co-op and team modes, ranked play and seasons. Online Vs is in.
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
