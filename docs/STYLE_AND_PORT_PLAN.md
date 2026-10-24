# Skyhold TD — Visual Direction & Gameplay Port Plan

**Status:** Discussion draft — not implementation approval  
**Purpose:** Align Skyhold TD with the actual Circle Tower Wars design before more gameplay or art is built.  
**Reference projects:** [Circle-TD](https://github.com/Arthaeris/Circle-TD), [Riftfall](https://github.com/Arthaeris/Riftfall), and [PixelPups](https://github.com/Arthaeris/PixelPups).

---

## 1. The correction: what Skyhold TD is supposed to be

The first prototype proved that a mobile browser can render a small voxel TD scene, but it made the wrong design assumptions. It turned the game into a conventional single-lane tower defense: a fixed spline-like route, one island, a couple of generic towers, and waves marching toward an endpoint.

**That is not the intended port.** Skyhold should be a voxel-world reinterpretation of Circle Tower Wars, not a new TD that merely borrows the name.

The priorities are:

1. **Preserve Circle's game identity and systems.** The loop-based battlefield, corridors, elemental identities, tower growth, statuses, synergies, obstacles, waves, and economy are the foundation.
2. **Use real grid pathfinding.** Enemies navigate the current build grid. The route is a consequence of terrain, obstacles, and tower placement—not a hand-authored line drawn beside buildable ground.
3. **Make the world feel authored.** Borrow the clarity, colour, chunky voxel construction, character personality, and environmental richness of Riftfall and PixelPups, while translating Circle's own elemental visual language into 3D.
4. **Design mobile first.** The board must remain legible and comfortable to play by touch. PC mouse/keyboard support is a second input mode for the same rules and UI—not a separate game.

## 2. What the Circle-TD source tells us

This plan is grounded in the current Circle-TD source structure and data, not only in the game's name.

### Core shape and loop

- The simulation defines a **31 × 61 per-corridor build grid**.
- A corridor has an entrance and an exit; the current flow-field code seeds distances from the exit and lets enemies step toward lower-cost cells.
- The battlefield is loop-oriented: the world renderer arranges gates around a central vortex, and the menu describes enemies cycling until destroyed. Enemies that complete a loop can cost lives rather than simply disappearing at the end of a one-way path.
- Corridors are a central part of the game. The player can choose corridor count and elemental assignment, and the world view communicates the relationship between corridors and the central vortex.
- Buildable space is not merely decoration around a fixed track. The grid tracks free cells, obstacles, and tower-occupied cells. The pathfinder uses orthogonal and diagonal movement costs and prevents diagonal corner cutting. Reachability is part of the build/path logic.

### Strategic depth that should survive the port

The Circle content library includes eight elemental identities:

- **Fire** — heat, burn, explosive pressure.
- **Ice** — chill, freeze, brittle targets.
- **Nature** — poison, roots, spreading growth.
- **Storm** — shock, conductivity, lift.
- **Light** — illumination, purification, blinding.
- **Darkness** — curses, weakening, marks.
- **Mech** — tagging, magnetism, armour shredding.
- **Abnormal** — corruption, fracture, entropy, adaptive effects.

Light, Darkness, Mech, and Abnormal are not merely recolours; the database defines their own statuses and obstacle themes. The database also defines cross-element status synergies, so combining towers is part of the tactical identity.

Other important existing systems include:

- Tower footprints and placement validation, tower levels up to 10, expert mastery up to 5, kill-driven progression, and sell refunds.
- Shared gold or elemental essence economy options.
- Multiple wave modes (including loop and endless), wave affixes/scaling, boss pacing, and enemy sends in versus/competitive contexts.
- Solo, versus-NPC, co-op, and competitive mode concepts, plus deterministic simulation and save/network boundaries in the existing architecture.

**Port principle:** preserve the rules and strategic relationships first. Voxel models, terrain, camera, and effects should communicate those systems—not silently replace them.

## 3. Art direction

### Proposed north star: “Elemental voxel diorama with a living arcade battlefield”

Skyhold should look like a carefully crafted miniature world: bold silhouettes, chunky geometry, readable material colours, rich but controlled scenery, and elemental effects that make combat easy to parse at phone size. It should have the authored density and personality of Riftfall/PixelPups rather than looking like primitive blocks arranged for a test scene.

This is a translation, not a literal copy of either reference project's assets.

### What to carry over from the reference projects

**From Riftfall**
- A reusable voxel kit and consistent block proportions.
- Batched static scenery and vertex-colour shading so the world can feel detailed without excessive draw calls.
- Deliberate terrain layering, varied natural silhouettes, props, sky, water/atmosphere, and environmental storytelling.
- A cohesive world palette with small, purposeful variations in shade rather than flat single-colour surfaces.

**From PixelPups**
- Character models with personality and recognizable silhouettes, built from cached/shared voxel parts.
- Charming, compact, expressive creatures and props; small details that reward a closer look without obscuring gameplay.
- Clear colour coding, warm emissive accents, and simple readable UI/world labels.
- Geometry/material caching and phone-conscious model construction.

**From Circle-TD**
- Strong elemental colour identities and iconography.
- Distinctive portals, vortex, corridor/world map, tower artwork, enemy art, and status-effect language.
- The visual hierarchy of an arcade strategy game: the player should immediately understand their economy, wave, threats, and available actions.

### Rendering and material rules

- Prefer **orthographic or weak-perspective/isometric presentation** for the core battlefield. It keeps grid placement predictable and makes paths and tower footprints readable.
- Use voxel/block forms for terrain, towers, obstacles, props, and enemies, but vary shapes by role. Do not build every object from the same stack of cubes.
- Use face shading, subtle ambient occlusion/contact shadows, vertex-colour variation, and selective emissive materials. Avoid shiny plastic, realistic PBR noise, heavy bloom, and cinematic darkness that harms readability.
- Use a limited base palette for terrain, then reserve saturated colour and glow for elemental identity, active towers, projectiles, status effects, portals, and warnings.
- Keep silhouettes and VFX distinguishable at the smallest common mobile viewport. A status should be recognizable without requiring a tiny text label.
- Use shared geometry/material caches and batched static terrain. Keep animated enemies and towers separate only where they need to update.
- Effects should be short and informative: hit flash, element burst, chain arc, frost outline, poison puff, root snare, curse mark—not screen-filling particle noise.

### Palette direction (proposal, to tune against screenshots)

| Role | Direction |
|---|---|
| Sky / distant space | Deep indigo, blue-violet, atmospheric gradients |
| Main grass / walkable ground | Rich but muted green, warm olive variation |
| Dirt / cliff / island underside | Layered umber, ochre, slate, dark soil |
| Stone / build pads | Cool grey with warm highlights |
| Fire | Ember orange, coral red, gold-hot core |
| Ice | Clear cyan, pale frost blue, deep blue shadow |
| Nature | Leaf green, lime accents, earthy brown |
| Storm | Electric violet, lavender-white sparks |
| Light | Warm ivory, sun gold |
| Darkness | Deep plum, violet, restrained near-black |
| Mech | Steel blue-grey, brass/amber indicators |
| Abnormal | Magenta-pink, fractured violet, deliberately uncanny |

The colours above are a starting direction based on Circle's existing elemental palette; final values should be reviewed in a mobile screenshot before being locked.

## 4. World concept: the Skyhold Nexus

### High-level scene

The battlefield is a **floating, ring-like archipelago of elemental corridors orbiting a central Nexus/Vortex**. The player sees a compact, readable tactical diorama rather than a huge open-world island.

- The central Nexus is the visual anchor: a swirling rift, suspended core, or ancient machine that signals wave state and the loop mechanic.
- Elemental gates sit around the outer ring. Each corridor/field is visually connected to its gate and element.
- The active corridor is a close, tactical view of a large grid-based island/field. A wider world view lets the player switch corridors and understand the overall loop.
- Floating rock shelves, waterfalls or streams, hanging roots, crystals, broken ruins, tiny bridges, drifting fragments, and distant sky islands give the world a handcrafted identity.
- The route should emerge from the traversable grid. Terrain can suggest natural channels and lanes, but must not force enemies along a pre-authored spline independent of the board state.
- The underside and edges of islands should have layered voxel strata, occasional roots/crystals, and silhouette variation. Avoid one flat rectangular slab with a few clouds pasted around it.

### How the route should work visually

The grid is the truth. The ground surface, path markings, and enemy movement all reflect the current pathfinding result.

- Show the current valid route subtly: worn stone, rune inlays, a faint flow line, or animated directional motes.
- Recompute the route when placement changes the grid.
- When a placement would disconnect entrance from exit, reject it and explain why. Do not allow a tower to trap enemies unless the original rules explicitly support that state.
- If multiple equal-cost routes exist, deterministic tie-breaking should keep enemy motion stable across devices.
- Towers and obstacles block their real grid footprint. Diagonal movement must not squeeze through blocked corners.
- If Circle's looping corridor model is retained, completing the corridor should transition the enemy around the loop/world route according to Circle's rules, rather than treating the exit as a generic one-way goal.

### Terrain readability

- Distinguish **walkable route**, **buildable cells**, **blocked cells**, **tower footprints**, and **out-of-bounds terrain** with more than colour alone.
- During tower selection, show a footprint preview and range only when useful. Valid/invalid placement should be obvious, but not cover enemies.
- Keep a small consistent grid rhythm beneath the voxel art. Decorative terrain must never make the logical board ambiguous.
- Obstacles should be designed as gameplay objects with clear footprints and element identity—not random scenery that happens to obstruct movement.

## 5. Tower design language

Towers need to look like a family of functional, upgradeable structures. Avoid two generic test turrets being treated as the finished art direction.

### Shared tower silhouette

Each tower should have:
- A recognizable base footprint that reads from above.
- A strong central body and one primary weapon/focus shape.
- A visible elemental core or material accent.
- A small idle animation (pulse, orbit, steam, leaves, sparks, rotating gear).
- A clear attack tell: muzzle flash, beam, projectile, chain, splash radius, or status application.
- A readable level-up change: new parts, taller profile, additional core rings, more elaborate weapon, or stronger emissive treatment.

### Elemental visual vocabulary

- **Fire:** furnace, brazier, volcanic stone, ember vents; lobbed fireballs or explosive bursts.
- **Ice:** faceted frost crystal, frozen metal, pale blue core; shards, beams, frost rings.
- **Nature:** carved wood, stone, vines, seed pods; thorn shots, roots, spores, spreading growth.
- **Storm:** antennae, coils, suspended crystals; lightning arcs, conductive links, charged shots.
- **Light:** ivory/gold shrine, sun-disc, prisms; focused rays, cleansing rings, flashes.
- **Darkness:** obsidian, bone-like shapes, violet void core; curse marks, shadow bolts, dark tethers.
- **Mech:** riveted steel, brass, pistons, rotating components; bullets, magnets, targeting tags, shrapnel.
- **Abnormal:** asymmetrical geometry, broken floating voxels, unstable magenta core; spatial distortion, fractures, glitch-like pulses.

These are style proposals, not a replacement for the actual tower definitions. Existing tower stats, attack types, statuses, upgrade paths, and synergies should drive each model and effect.

## 6. Enemy design language

Enemies should be a recognizable cast, not identical coloured capsules. Build a shared voxel creature kit, then vary body plan, movement, and effects.

- **Basic ground enemy:** compact, readable body; quick footstep/leg motion; clear health/status indication.
- **Armoured/tank enemy:** broad, low silhouette with layered plates; strong hit response and visible armour damage.
- **Swarm/fast enemy:** small and distinct, with motion trails or a group marker that does not hide individual pathing.
- **Flying enemy (if present in the Circle data/rules):** levitates above the ground grid and visually signals that it ignores ground obstacles/path restrictions as defined by its mechanics.
- **Elemental variants:** small colour accents and material traits rather than recolouring the entire model.
- **Bosses:** large, unique silhouettes with a clear health bar, attack telegraphs, and an entrance effect that does not obscure the field.

Enemy models should communicate gameplay tags: speed, armour, boss status, flight, resistance, or special abilities. Statuses need clear visual feedback—burning embers, frost casing, poison motes, root restraints, storm arcs, curse glyphs, mech target markers, abnormal fractures—while limiting simultaneous effects for mobile performance.

The actual enemy catalogue should be audited before deciding the final roster. Do not invent a new enemy roster in place of Circle's existing waves and balance data.

## 7. Battlefield, obstacles, and decoration

### Gameplay objects
- Element-themed obstacles derived from Circle's obstacle families: lava rock/obsidian, ice shards/frozen boulders, ancient trees/roots, charged crystals/storm spires, sun pillars/radiant crystals, void stones/bone piles, generators/scrap, rift fragments/glitch blocks.
- Towers with valid grid footprints and clearly marked occupancy.
- Entrances/gates and exits/loop transition points with distinct effects.
- Build previews, range overlays, placement error feedback, path previews, wave warnings, and boss telegraphs.

### Decorative objects
- Small rock clusters, tufts, mushrooms, crystal outcrops, ruins, roots, floating debris, flags, lanterns, and distant islands.
- Decoration should be seeded/deterministic where it affects the board layout and must never visually imply a blocked cell where none exists.
- Gameplay blockers and purely decorative props must be separate data categories.

## 8. Mobile-first camera and controls

### Mobile
- Default to a stable view that keeps the whole tactical area visible as much as possible.
- Support tap-to-select, tap-to-place, tap-to-inspect, and explicit cancel/back actions. No hover-only information.
- Use a large bottom build tray, compact top resource/wave strip, and contextual tower/enemy panel. Avoid covering the route with persistent menus.
- Offer a world/corridor switch that is easy to hit with one thumb.
- Keep labels short and readable; use icons plus text for important resources/statuses.
- Support portrait as the baseline, with landscape allowed to use the extra width. The design should not require landscape-only play.
- Avoid tiny drag targets. Dragging may be an optional convenience, never the only way to place a tower.
- Use conservative render scale, batched terrain, cached models/materials, capped pixel ratio, and effects pooling.

### PC
- Same simulation and rules.
- Mouse selection and placement, hover previews as an enhancement, keyboard shortcuts, and optional wheel zoom.
- Responsive HUD can spread into side panels at wide widths, but it must not fork the gameplay model.

## 9. Systems architecture: port rules first, renderer second

Keep the simulation independent from Three.js. Circle already has a deterministic simulation boundary, seeded randomness, a fixed simulation tick, grid flow fields, command validation, and data-driven content. Skyhold should preserve these principles instead of putting pathfinding and game rules into click handlers or render code.

Suggested ownership:

- sim/core.js: authoritative game state and validated player commands.
- sim/pathfind.js: port/adapt Circle's grid flow-field logic; reachability and route recomputation.
- sim/waves.js: use Circle wave generation/scaling/affixes as the source of truth.
- sim/economy.js: preserve shared/elemental economy and spend/reward/sell rules.
- sim/targeting.js: preserve targeting choices and any special targeting behaviours.
- data/ or data.js: migrate tower/enemy/status/element/synergy/wave data rather than hard-coding a tiny new roster.
- render/terrain.js: render the logical grid and voxel terrain; never define gameplay routing here.
- render/models.js: render data-driven tower/enemy models and update their transforms.
- render/effects.js: status, attack, placement, route and wave effects.
- ui.js: translate touch/mouse/keyboard input into simulation commands; never mutate simulation state directly.

**Important:** the current Skyhold sim/pathfind.js only measures distance along a hard-coded list of world points. That is not Circle's pathfinding and should be replaced, not extended into a bigger fixed path.

## 10. Port scope and implementation order

### Phase 0 — Rules audit (before more art)
- Map Circle's current simulation commands, grid/tower footprint rules, wave data, tower definitions, enemy definitions, status effects, synergies, and economy to a port checklist.
- Identify which systems can be adapted directly and which need a 3D-facing wrapper.
- Confirm exact loop transition/life-loss behaviour and how multiple corridors are sequenced.
- Do not modify the Circle-TD repository.

### Phase 1 — Pathfinding-first vertical slice
- Replace the fixed point-path model with a logical grid and flow field.
- Implement tower footprint occupancy and placement validation against reachability.
- Show the computed route in the 3D terrain.
- Move enemies cell-to-cell or along a smoothed path derived from the field.
- Add deterministic route recomputation and tests for blocked exits, diagonal corner cutting, and stable tie-breaks.
- Keep placeholder art if necessary; correctness is more important than polish here.

### Phase 2 — Circle gameplay parity
- Port the actual tower/enemy/wave/status/economy data and rules in slices.
- Begin with one corridor and a representative elemental subset, but structure data so all eight elements and synergies fit without redesign.
- Add upgrade/experience/mastery, sell rules, boss pacing, and the loop/world transition.
- Validate against Circle's simulation for equivalent scenarios wherever practical.

### Phase 3 — Art-direction prototype
- Build one polished small battlefield: central/gate context, voxel terrain strata, 2–3 distinctive obstacles, 3 representative towers, 3 enemy silhouettes, and a few elemental effects.
- Capture phone screenshots and compare against Circle's visual identity and the craft/detail level of Riftfall/PixelPups.
- Lock palette, voxel scale, camera angle, lighting, outline/contrast rules, and mobile HUD only after review.

### Phase 4 — Expand content and modes
- Add all elements, their towers/statuses/obstacles, and their synergies.
- Expand enemies, bosses, waves, corridors, and game modes.
- Add progression, save compatibility, accessibility options, and any multiplayer work only after core single-player parity is solid.

### Phase 5 — Mobile/PC validation
- Test real touch interaction, screen sizes, safe areas, portrait/landscape, browser pause/resume, and low/mid-range device performance.
- Test mouse/keyboard and larger layouts.
- Add a regression checklist for path validity, economy, tower targeting, status interactions, wave completion, and game-over conditions.

## 11. Acceptance criteria for the next prototype

The next milestone should not be considered successful until:

- [ ] The enemy route is generated from a grid flow field, not a fixed point list.
- [ ] Tower placement changes the route and cannot silently make the exit unreachable.
- [ ] Enemies follow the route and respect obstacle/tower occupancy and diagonal corner rules.
- [ ] The game retains Circle's loop/corridor/Nexus concept rather than a generic one-way lane.
- [ ] The data model can represent all eight elements, statuses, synergies, tower levels, enemies, and wave variants.
- [ ] At least one tower interaction demonstrates a Circle-style status effect or elemental synergy.
- [ ] The battlefield reads as a crafted voxel diorama at phone size and has more visual identity than generic cubes.
- [ ] Core actions work by touch without hover; PC mouse/keyboard remains supported.
- [ ] The simulation can be tested without rendering or browser input.
- [ ] The Circle-TD repository remains untouched.

## 12. Decisions for discussion

These are intentionally left open so the document is a basis for agreement rather than an assumed final specification:

1. **Camera:** mostly top-down/isometric (maximum grid clarity) or more cinematic 3D (stronger diorama feel)?
2. **Loop presentation:** a continuous ring/world map around the Nexus, switching into a corridor close-up; or a single tactical view with corridor transitions represented in-scene?
3. **Path readability:** visible stone/rune route at all times, or subtle terrain with a highlighted route preview when placing towers?
4. **Build model:** preserve Circle's current 3×3 tower footprint and 31×61 grid exactly, or adapt world scale while preserving relative footprint/path rules?
5. **Art asset strategy:** recreate Circle's elemental art in voxel form from scratch, or selectively reuse existing Circle artwork for icons/portraits/UI while the 3D models are original?
6. **Initial parity target:** one-player, one-corridor gameplay first, or multi-corridor world navigation in the first playable slice?

**Recommendation:** start with the pathfinding-first vertical slice and a single polished corridor that is unmistakably Circle-derived. Do not add lots of towers or decorative assets until the grid, loop, placement rules, and art direction are agreed.
