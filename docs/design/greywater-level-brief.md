# Greywater Valley — Level Architecture Brief / Build Prompt

> Hand this to whoever (or whatever) builds the level. It is written to be executed
> against THIS engine, not a generic open-world toolkit. Every geographic idea below
> names the primitive that realizes it (`terrainHeight` smoothstep band, `ZoneDef.poi`,
> `ROADS` polyline, lazy `CampDef`, `GROUND_OBJECTS`, `PROPS`, collider). Build to the
> brief, then verify against the Acceptance Criteria at the end.

---

## 0. The prompt, in one paragraph

You are the lead environment architect for Greywater Valley, a self-contained witcher
region bolted onto the eastern edge of the world at world-space **x +95..+175,
z -190..+200**. You design in a deterministic 20 Hz sim whose terrain is a pure height
function (`terrainHeight(x,z,seed)` in `src/sim/world.ts`), whose roads and points of
interest are data, and whose monsters spawn lazily as the player approaches. Your job is
to make a player who has only ever seen the bright hub of Eastbrook walk through a stone
pass and feel the temperature drop: a drowned, debt-ridden, monster-haunted valley that
reads as Velen-by-way-of-Crookback-Bog. Large, legible, and grim. Build it as a sequence
of composed sightlines along one golden path, ringed by optional dread.

---

## 1. Design pillars (rank-ordered; when two conflict, the higher wins)

1. **Legibility before size.** A first-time player must always know where the next
   landmark is. The valley is large, but it is read along a single spine road with tall
   silhouette anchors (the gatehouse, the mill wheel, the manor on the rise). No "where do
   I go" moments.
2. **Tone is water and debt.** Everything sags toward the marsh. The valley is a basin
   that drowned a trade road; the people who stayed are in hock to a margrave. Wetness,
   rot, gallows-iron, and ledgers are the material language.
3. **The witcher reads the land, not a quest marker.** Monster territory is written into
   the geography (drowners own the ford, nekkers own the scree slopes, the leshen owns the
   old-growth grove). A skilled player should be able to predict an encounter from terrain
   alone.
4. **Every path has a payoff.** No dead corridors. Each spur ends in a landmark, a body,
   a chest, a vista, or a quest beat. (Mirrors the existing rule: every quest choice has
   its own reward.)
5. **Determinism is sacred.** No `Math.random`, no `Date.now`. All shaping is the height
   function plus authored data. Monsters are **lazy camps** so they never perturb the
   shared world-gen RNG stream (this is already how Greywater spawns; keep it).

---

## 2. The engine you are building in (read this before drawing a single contour)

| You want | You author | Where |
|---|---|---|
| Ground shape (hills, the basin, the wall, the pass) | additive `smoothstep` bands in `terrainHeight` | `src/sim/world.ts` |
| Water surface (marsh, ford, millpond) | sink terrain below `WATER_LEVEL`; render fills it | `world.ts` + `render/water.ts` |
| A named place on the map | `{ x, z, label }` in `ZoneDef.pois` | `src/sim/content/zone1.ts` |
| A visible road that paints terrain flat | polyline in `ROADS` | `src/sim/content/greywater.ts` |
| Monsters that appear near the player | `CampDef` with `lazy: true` | `greywater.ts` (`GREYWATER_CAMPS`) |
| Lootable/interactable world object | `GROUND_OBJECTS` entry | `greywater.ts` |
| Buildings, carts, fences, tents, props | `PROPS` / `ZonePropsDef.carts` | `greywater.ts`, rendered by `render/props.ts` |
| Solid things you cannot walk through | collider entry | `src/sim/colliders.ts` |
| A quest giver and their micro-set | `NPCS` record + nearby props/objects | `greywater.ts` |

**Hard constraints the architecture must respect:**

- **Render height == sim height.** The renderer samples the SAME `terrainHeight`. If you
  sculpt it, both the picture and the collision/movement move together. Never fake a hill
  in the renderer.
- **The pass already exists.** Current shaping: a wall ridge peaks near **x 110**
  (gated by `smoothstep(95,107,x)`), with a **pass notch around z 2.5**, and a sunken
  marsh floor inside via `smoothstep(112,132,x)`, with a **road causeway** keeping the
  spine dry. A north-south z-gate (`1 - smoothstep(160,185,z)`) stops the basin from
  flooding the Mirefen crater further south. Extend this; do not fight it.
- **Discoverability is shipped.** POIs (Greywater Ford ~x146,z-148; Greywater Valley
  ~x140,z30; Greywater Mill ~x134,z158), a connector road from the Eastbrook hub, and
  Calla's level-1 entry quest already make the valley findable. Your build deepens what is
  found, it does not re-solve "can the player get here."
- **The world map is horizontally mirrored** (world +X draws LEFT). Compose so the
  intended reading order works on the mirrored map, not just in 3D.

---

## 3. Macro geography — the basin, read as elevation bands

Think of Greywater as a **tilted bowl** that someone drove a road across before it
drowned. From the world hub (west, low x) to the valley's back wall (high x), the player
crosses five elevation bands. Author each as an additive term in `terrainHeight`,
composed with `smoothstep` so the seams are invisible.

```
WEST (hub)                                                        EAST (back wall)
x ~95            x ~110          x ~120        x ~145          x ~168
 |  THE PASS   |  THE LIP      |  MARSH FLAT |  VALLEY FLOOR |  THE RISE / WALL  |
 ridge + notch   spillover       below water   dry causeway     manor terrace
   ^gatehouse      ^first vista    ^the ford      ^village         ^margrave's seat
```

1. **The Pass (x ~95..112).** A genuine choke. Tall stone shoulders left and right
   (raise terrain hard with a narrow `smoothstep` gutter at the road's z), one notch the
   road threads. This is the **threshold shot**: the player should crest it and see the
   whole bowl laid out below, mill wheel turning in the distance. Compose the notch so the
   manor-on-the-rise is framed dead-center on exit.
2. **The Lip / first overlook (x ~110..120).** A short downhill apron just inside the
   wall. Place the first POI label and the first readable landmark here. Drowner-free; let
   the player breathe and take the vista before the ground turns wet.
3. **The Marsh Flat (x ~118..135).** The drowned trade road. Sink the floor below
   `WATER_LEVEL` everywhere EXCEPT the raised causeway (already done via `roadDistance`).
   Standing water, reed islands, the half-sunk caravan, the ford crossing. This is
   **drowner and bog-ghoul country** by geography. Visibility is low; sound design carries.
4. **The Valley Floor (x ~135..155).** The causeway lifts you onto dry-ish ground: the
   village of Greywater, the millpond, the market lane, the quest-giver micro-sets.
   Gentle, walkable, the social heart. Slight crowning so water sheds back toward the marsh.
5. **The Rise / Back Wall (x ~155..175).** Ground climbs to a terraced shelf holding the
   margrave's holding (the manor / Velvet Debt seat) and, beyond it, old-growth woods that
   the wall hems in. Steep enough to need switchback paths; high enough to be the dominant
   silhouette from everywhere in the bowl.

**Hydrology (the through-line that ties the bands together):** water enters high on the
Rise (a spring/falls behind the manor), runs down through the **millpond** (drives the
mill wheel — your strongest kinetic landmark), spills into the **marsh flat**, and pools
at the **ford** where it drowned the caravan. Author this as a continuous descending
channel of below-`WATER_LEVEL` cells. The player is, the whole time, walking upstream
against the valley's own drowning.

---

## 4. The golden path and the player's first three minutes

Level architecture is pacing. Stage the spine so the first traversal teaches the valley:

- **00:00 — The Pass.** Compression. Stone walls close in, audio goes dead and dripping,
  fog thickens. A single guardpost prop and a warning (a gibbet, a notice nailed to the
  gate). Tension with no threat yet.
- **00:20 — The Reveal.** Crest the notch. Hard cut to openness: the whole bowl, the mill
  wheel turning, the manor on the rise, grey light. This is the postcard. Frame it.
- **00:40 — The Ford (first stakes).** Downhill into the marsh; the drowned caravan, the
  mudlarks picking the wreck, Calla at her wagon. First monster territory (drowners in the
  shallows). The Drowned Caravan quest opens. Player learns: water = danger here.
- **01:30 — The Village.** Up the causeway onto the floor. People, ledgers, the other
  quest givers, vendors, the millpond. Safe-ish hub; the social and economic web (debt,
  the margrave, the tournament) gets established through props and overheard staging.
- **02:30 — The Rise looms.** From the village the manor is always visible above,
  literally overlooking the people who owe it. The player understands the power structure
  geographically before a line of dialogue confirms it.

Everything optional (the leshen grove, the nekker scree, the hag's pool) branches OFF this
spine and is visible FROM it, so curiosity is self-directed.

---

## 5. Districts / sub-areas — build each as a composed set

Author these as clusters of POI + props + ground objects + a lazy camp. Coordinates are
targets in the existing Greywater band; tune to the height function.

### 5.1 The Gatehouse & Pass (~x108, z2)
The valley's handshake. A ruined stone gate-arch straddling the road notch, a leaning
watchtower prop, a gibbet with an empty noose (foreshadows the Caravan's "hang Calla"
branch and the gallows-iron weapons). Margrave's banner, rain-rotted. **Collider** the gate
jambs so the player threads the gap. Monster-free; this is mood, not combat.

### 5.2 The Ford & the Drowned Caravan (~x146, z-148) — Calla's set
The emotional cold-open. A trade wagon half-sunk at an angle in the shallows, cargo
crates bobbing, a drowned ox. **Calla's wagon** (already placed) on the dry verge with her
beside it; the **mudlarks** working the wreck (add them — looter NPCs/mobs for the
"looters" choice). The **slaver's strongbox** as a ground object both on the drowner drop
and a dry-land test copy. Drowners rise from the reeds as you approach (lazy camp). Reed
islands and sightline-breaking fog so the drowners surprise. This set carries pillar 2
(water + debt) single-handedly: a caravan that drowned in debt-collection, picked by the
poor.

### 5.3 The Marsh Flats & Bog-Ghoul fen (~x125, z-40)
The connective dread between ford and village. Stagnant pools, dead willows, will-o-wisp
VFX, bone piles. **Bog-ghoul** lazy camp keyed to the deepest water. A sunken shrine or
two for environmental storytelling (offerings to keep the drowned down). Low visibility by
design; the causeway is the only safe read-through. Optional spur to the **hag's pool**
(greywater_hag) tucked in a side pocket the player must choose to enter.

### 5.4 Greywater Village & the Market Lane (~x140, z30)
The hub. A loose cluster of mean wattle-and-daub houses along a single muddy lane that
the causeway becomes. Each quest giver gets a **micro-environment** (see §6). A well, a
notice board (quests/notices), a vendor stall, the **millpond's** lower edge. Crown the
ground slightly so it reads as the one dry place. People here are tired, not hostile.

### 5.5 The Mill & Millpond (~x134, z158) — Sera's set, The Inheritance
Your kinetic landmark and the questline's endpoint. A working water-wheel on a stone-and-
timber mill over a dammed pond; the wheel is the one moving silhouette visible from the
pass, so it draws the eye the length of the valley. Sluice, grindstone, grain sacks, a
disputed deed nailed to the door. The pond is **safe water** (contrast to the marsh) but
fed from the haunted Rise, so something is wrong upstream.

### 5.6 The Rise, the Manor & the Velvet Debt (~x165, z70) — the margrave's seat
The power center, terraced above everyone. A walled manor (Inés / the velvet-debt
moneylender, the margrave's guards, the tournament patronage). Switchback path up,
**margrave_guard** patrols (lazy camp) so it feels defended. From its terrace you see the
whole bowl — the design statement that this house watches everything it owns. The **jail**
with the **jail_chest** and its special weapon sits here (the magistrate branch payoff).

### 5.7 The Tournament Ground (~x150, z110) — Ortega's set, The People's Champion
A roped ring on flat ground below the manor: stands, banners, a champion's post.
**Tournament_brawler / tournament_champion** as staged opponents. Crowd props, betting
stalls. The one place in the valley with energy and color, which makes its corruption
(rigged bouts, the margrave's cut) land harder.

### 5.8 The Old-Growth Grove & the Leshen (~x170, z-30) — apex optional content
Behind the manor, hemmed by the back wall, a stand of ancient twisted oaks the villagers
won't enter. **Valley_leshen** as the region's apex predator (lazy camp, hard). Carved
god-trees, animal skulls, a ring of standing stones. Pure witcher: a thing older than the
debt and the margrave both. Visible as a dark mass on the Rise from the village; entering
is the player's choice and the valley's hardest fight.

### 5.9 The Scree Slopes & Nekker warrens (valley shoulders, high |z|)
The bowl's tilted sides. Rocky, broken ground climbing toward the wall, riddled with
**valley_nekker** warrens (lazy camps in clusters — nekkers swarm). These edges punish
players who leave the spine unprepared and reward those who clear them (warren loot). They
also visually contain the bowl, walling the eye in.

---

## 6. Quest-giver micro-environments (the "each giver has its own set" rule)

Every giver is staged so their job is legible before they speak. Author each as the NPC
plus 2-4 props and one interactable ground object:

- **Calla — the Ford wagon** (Drowned Caravan): the half-sunk wagon, cargo crates, the
  strongbox. Already placed; add the mudlarks.
- **Reeve Ondrin — the inspection table** (An Eye for Aldermere): a trestle table with the
  **girl's shawl** laid out as evidence, ledgers, a lantern. The shawl is the
  examine-object. (This is the "table to check the shawl" you asked for.)
- **Inés — the manor counting-room / debtor's cage** (The Velvet Debt): a money table,
  scales, a debtor's cage or pillory, velvet bolts (the "velvet" of the debt). Up on the
  Rise, behind the manor wall.
- **Ortega — the tournament books** (The People's Champion): the betting stall, fight
  ledgers, the champion's post and weapon rack, ringside.
- **Goodwife Sera — the mill** (The Inheritance): the wheel, grindstone, the contested
  deed on the door, grain sacks. The set IS the prize being fought over.
- **Magistrate Holt — the gatehouse/jail office** (Caravan "run to town" branch): a writ
  desk, the **jail_chest** with the special weapon, wanted notices. The reward-bearing
  authority figure for the lawful path.

---

## 7. Composition, sightlines, and verticality

- **Three silhouette anchors** must be visible from the spine at almost all times: the
  **gatehouse** (behind you), the **mill wheel** (mid-valley, moving), the **manor on the
  Rise** (ahead/above). The player navigates by these, never by a compass alone.
- **Frame the reveal.** The pass notch's walls should crop the exit view so the bowl
  arrives as a composed shot with the manor centered.
- **Verticality earns the witcher fantasy.** The Rise's switchbacks, the scree shoulders,
  and the sunken marsh give three distinct elevations within one read. Tune
  `terrainHeight` so slopes are climbable on the intended paths and read as walls off them
  (steep `smoothstep` falloff = soft no-go without invisible barriers).
- **Contain the eye.** The back wall and scree shoulders should rise high enough on the
  skyline that the valley feels enclosed and oppressive, never like open countryside. The
  wall is a character: it's why these people can't just leave their debt.

---

## 8. Monster ecology — geography IS the encounter design

Place lazy camps so a witcher could call the fight from the terrain:

| Territory | Monster | Why it lives there |
|---|---|---|
| Ford shallows, marsh pools | greywater_drowner | drowned dead haunt where they died |
| Deep fen | bog_ghoul | carrion in the standing water |
| Hag's pool (spur) | greywater_hag | a lair off the path, optional |
| Scree shoulders | valley_nekker (swarms) | warrens in broken rock |
| Manor approach | margrave_guard | the holding is defended |
| Tournament ring | tournament_brawler/champion | staged combatants |
| Contested ground | reclamation_mercenary | debt-collectors with steel |
| Old-growth grove | valley_leshen (apex) | a forest spirit older than the valley |

All `lazy: true`, activation radius as currently tuned (~55), cleared of the road so the
spine stays passable. Difficulty rises with x and |z|: gentle on the spine, lethal in the
grove and the deep warrens.

---

## 9. Environmental storytelling beats (no dialogue required)

Scatter readable vignettes; the valley should narrate itself:

- The **gibbet** at the gate (the law here hangs people; gallows-iron weapons exist).
- The **drowned caravan** picked by the poor (debt, desperation, the margrave's reach).
- **Debtor's marks** chalked on village doors (Inés has been here).
- **Offerings** at sunken shrines in the fen (the village fears its own drowned).
- The **manor terrace** physically overlooking every home (power geography).
- **God-trees** in the grove (something predates and outlasts the human drama).
- A **child's shawl** on the reeve's table (the missing-girl thread, Aldermere).

---

## 10. Atmosphere, light, audio

- **Palette:** desaturated greys, bog-greens, peat-browns, rust. The one warm note is the
  tournament ground; the one clean note is the millpond. Everything else is overcast.
- **Fog** thick in the marsh band, thinning on the floor, clearing on the Rise (rewards
  the climb with a view).
- **Audio** carries what fog hides: wheel creak from the mill, water everywhere, distant
  crows, drowner gurgles before you see them. The pass goes near-silent for contrast.
- **Weather** leans wet; the valley should feel like it never fully dries.

---

## 11. Deliverables (what "built" means, file by file)

1. `src/sim/world.ts` — the five-band `terrainHeight` shaping: pass notch, lip apron,
   sunken marsh, crowned floor, terraced Rise, scree shoulders, the descending water
   channel (millpond -> marsh -> ford). All via composed `smoothstep`; no new RNG.
2. `src/sim/content/zone1.ts` — POI labels for every district in §5 (gatehouse, ford,
   fen, village, mill, manor, tournament, grove). English keys only (per the no-translate
   call); accept the pending i18n rows.
3. `src/sim/content/greywater.ts` —
   - `GREYWATER_ROADS`: spine causeway + switchbacks to the Rise + the grove spur.
   - `GREYWATER_CAMPS`: every lazy camp in §8, geographically placed.
   - `GROUND_OBJECTS`: strongbox(es), shawl, jail_chest, shrine offerings, the deed.
   - `PROPS` / carts: gatehouse arch, watchtower, gibbet, drowned wagon, mill + wheel,
     manor, tournament ring, market stalls, the per-giver micro-sets (§6).
   - `NPCS`: the six givers + the mudlarks, each on their set.
4. `src/sim/colliders.ts` — solids: gate jambs, mill building, manor walls, the wagon,
   tournament posts.
5. Tests: extend `tests/greywater_choices.test.ts` / add a placement test asserting each
   POI, camp, and giver resolves and sits on walkable ground (sample `groundHeight` at the
   NPC; assert above `WATER_LEVEL` for land givers).

---

## 12. Acceptance criteria (how we know it's right)

- [ ] **Determinism holds.** `npx vitest run tests/sim.test.ts tests/architecture.test.ts
      tests/snapshots.test.ts tests/progression.test.ts` stays green; no `Math.random`/
      `Date.now` added; world-gen RNG stream unperturbed (lazy camps only).
- [ ] **Render == sim height** everywhere; no renderer-only terrain.
- [ ] **The reveal works:** cresting the pass frames the bowl with the manor centered and
      the mill wheel visible.
- [ ] **Three anchors** (gatehouse, mill, manor) are visible from ~90% of the spine.
- [ ] **No dead ends:** every spur terminates in a landmark, body, chest, vista, or beat.
- [ ] **Encounters are legible from terrain** (drowners=water, nekkers=scree, leshen=grove).
- [ ] **Every quest giver** stands on a self-describing micro-set with one interactable.
- [ ] **Difficulty gradient** rises with distance from the spine; the spine is survivable
      at the entry level (safe passage already shipped).
- [ ] **The valley feels enclosed** — the back wall and shoulders dominate the skyline.
- [ ] Build green: `npm run build`, `npx tsc --noEmit`, i18n regen committed.

---

*Build to the brief, walk the golden path once end to end, then send screenshots of the
five band transitions (pass / lip reveal / ford / village / Rise) for sign-off.*
