// The Crawl: a descending megadungeon scenario in the dungeon-crawl tradition
// (a deadly, game-show-narrated descent where you level up on one floor and take
// the stairs down to the next, tougher one). It is authored entirely as data:
// a chain of single-instance DungeonDefs, each linked to the next by an internal
// "Stairway Down" (templateId 'dungeon_door'), exactly like the Nythraxis
// crypt -> boss-arena chain in dungeons.ts. Leveling and the floor-to-floor
// transition are existing engine mechanics; this file only describes the floors.
//
// Each floor reuses existing mob templates (sim/data MOBS) chosen so the level
// band rises floor by floor (roughly L1-5 on Floor 1 up to L20 on Floor 7), which
// is what forces the player to grind a floor before the next one is survivable.
// No new mob/item records are introduced here, so every spawn id and loot table
// is already valid; the floors carry their own identity through their names and
// the Showrunner's enter/leave narration.
//
// Floor interiors all use the shared 'crypt' room (sim/dungeon_layout CRYPT_LAYOUT,
// z -19..112, walls at |x|=23, pillars at |x|=14, tombs at |x|=19). Spawns sit in
// the safe centre aisle (|x| <= 9, z 18..98) and each Stairway Down sits flush to
// the back wall at z 110.4, mirroring the proven Nythraxis door placement.

import type { DungeonDef, DungeonObjectSpawn, DungeonSpawn } from '../types';

// Shared overworld entrance for the whole Crawl. Only Floor 1 opens a door here
// (overworldDoor defaults true); the rest are reached by the in-floor stairs, but
// every floor points its doorPos here so dying / leaving any floor returns the
// crawler to the surface mouth of the dungeon. Kept in the Eastbrook Vale band,
// well clear of town, on open ground.
const CRAWL_DOOR = { x: 110, z: 40 };

// One Stairway Down, placed flush to the crypt back wall, linking to the next floor.
function stairsTo(dungeonId: string): DungeonObjectSpawn {
  return { itemId: '', name: 'Stairway Down', x: 0, z: 110.4, templateId: 'dungeon_door', dungeonId };
}

// Twelve safe centre-aisle slots shared by every floor (last three flank the boss
// at the z 96-98 dais). Each floor maps its own mob ids onto these slots, so the
// pacing (trash packs, a midpoint elite, a boss with two guards) stays consistent
// while the roster and difficulty climb.
const SLOTS: { x: number; z: number }[] = [
  { x: -3, z: 18 }, { x: 3, z: 19 },
  { x: -9, z: 38 }, { x: -5, z: 39 },
  { x: 9, z: 54 }, { x: 5, z: 55 },
  { x: -5, z: 68 }, { x: -1, z: 70 },
  { x: -4, z: 82 }, { x: 1, z: 83 },
  { x: 0, z: 98 }, // boss
  { x: -4, z: 96 }, { x: 4, z: 96 }, // boss guards
];

function floorSpawns(mobIds: string[]): DungeonSpawn[] {
  return mobIds.map((mobId, i) => ({ mobId, x: SLOTS[i].x, z: SLOTS[i].z }));
}

// Per-floor rosters. Index 10 is the floor boss; 11 and 12 are its guards. The
// level band of the chosen templates is what makes each floor harder than the last.
const FLOOR_ROSTERS: string[][] = [
  // Floor 1 (L1-5): tutorial vermin and bandits. Old Greyjaw caps it.
  ['tunnel_rat', 'forest_wolf', 'wild_boar', 'webwood_spider', 'vale_bandit', 'forest_wolf',
   'tunnel_rat', 'wild_boar', 'vale_bandit', 'webwood_spider', 'old_greyjaw', 'forest_wolf', 'tunnel_rat'],
  // Floor 2 (L5-9): the restless dead stir. Sexton Marrow caps it.
  ['restless_bones', 'webwood_spider', 'vale_bandit', 'crypt_shambler', 'restless_bones', 'crypt_shambler',
   'hollow_acolyte', 'restless_bones', 'crypt_shambler', 'hollow_acolyte', 'sexton_marrow', 'crypt_shambler', 'crypt_shambler'],
  // Floor 3 (L7-10): the crypt proper. Morthen the Gravecaller caps it.
  ['crypt_shambler', 'hollow_acolyte', 'bonechill_widow', 'crypt_shambler', 'hollow_acolyte', 'bonechill_widow',
   'sexton_marrow', 'hollow_acolyte', 'crypt_shambler', 'bonechill_widow', 'morthen', 'crypt_shambler', 'crypt_shambler'],
  // Floor 4 (L11-13): the drowned ranks. Knight-Commander Olen caps it.
  ['drowned_dead', 'bastion_revenant', 'tidebound_acolyte', 'drowned_dead', 'bastion_revenant', 'tidebound_acolyte',
   'fen_troll', 'bastion_revenant', 'drowned_dead', 'tidebound_acolyte', 'knight_commander_olen', 'bastion_revenant', 'bastion_revenant'],
  // Floor 5 (L13-15): the mist warrens. Vael the Mistcaller caps it.
  ['bastion_revenant', 'tidebound_acolyte', 'fen_troll', 'bastion_revenant', 'mire_prowler', 'tidebound_acolyte',
   'fen_troll', 'bastion_revenant', 'mire_prowler', 'tidebound_acolyte', 'vael_the_mistcaller', 'bastion_revenant', 'tidebound_acolyte'],
  // Floor 6 (L15-20): the bonewright halls. Korgath the Bound caps it.
  ['ridge_stalker', 'thornpeak_ogre', 'wyrmcult_zealot', 'sanctum_boneguard', 'sanctum_drakonid', 'wyrmcult_zealot',
   'sanctum_boneguard', 'thornpeak_ogre', 'sanctum_drakonid', 'sanctum_boneguard', 'korgath_the_bound', 'sanctum_drakonid', 'sanctum_boneguard'],
  // Floor 7 (L20 finale): the Showrunner's vault. Korzul the Gravewyrm is the last boss.
  ['sanctum_drakonid', 'wyrmcult_necromancer', 'sanctum_boneguard', 'sanctum_drakonid', 'wyrmcult_necromancer', 'sanctum_drakonid',
   'grand_necromancer_velkhar', 'sanctum_drakonid', 'sanctum_boneguard', 'wyrmcult_necromancer', 'korzul_the_gravewyrm', 'sanctum_drakonid', 'sanctum_drakonid'],
];

// The Showrunner narrates every threshold. Sardonic, in the genre's game-show
// register: the dungeon is live entertainment and the crawler is the underdog.
// Kept concise and in sync with the catalog source in src/ui/i18n.catalog/merge.ts
// (the localized copy of these names/lines). No em/en dashes per house style.
const FLOOR_TEXT: { name: string; enter: string; leave: string }[] = [
  {
    name: 'The Crawl: Floor 1, Orientation',
    enter: 'Floor 1. The cameras are live. Gain levels, find the stairs down, and try not to die in the first minute.',
    leave: 'You climb back toward the surface that no longer exists.',
  },
  {
    name: 'The Crawl: Floor 2, The Restless Dead',
    enter: 'Floor 2. The old tenants are up and walking. Lingering on one floor is a fine way to die on it.',
    leave: 'You retreat back up the stairwell.',
  },
  {
    name: 'The Crawl: Floor 3, The Hollow Crypt',
    enter: 'Floor 3. Morthen runs this level and does not share. Gain a few levels first, then knock.',
    leave: 'You back out of the crypt while you still can.',
  },
  {
    name: 'The Crawl: Floor 4, The Drowned Ranks',
    enter: 'Floor 4. Cold water, colder dead, and a Knight-Commander with strong opinions about visitors.',
    leave: 'You wade back up out of the drowning dark.',
  },
  {
    name: 'The Crawl: Floor 5, The Mist Warrens',
    enter: 'Floor 5. Vael calls the mist, and the mist calls reinforcements. The audience loves reinforcements.',
    leave: 'You feel your way back up through the thinning mist.',
  },
  {
    name: 'The Crawl: Floor 6, The Bonewright Halls',
    enter: 'Floor 6. Korgath the Bound is only the warmup for what waits below. Be the right level for this.',
    leave: 'You haul yourself back up the bonewright stair.',
  },
  {
    name: 'The Crawl: Floor 7, The Showrunners Vault',
    enter: 'The bottom floor. Korzul the Gravewyrm waits on the great dais, and the whole galaxy is watching. There are no more stairs down.',
    leave: 'You turn your back on the dais and climb.',
  },
];

function buildFloors(): Record<string, DungeonDef> {
  const out: Record<string, DungeonDef> = {};
  const count = FLOOR_ROSTERS.length;
  for (let i = 0; i < count; i++) {
    const floor = i + 1;
    const id = `crawl_floor_${floor}`;
    const nextId = `crawl_floor_${floor + 1}`;
    const text = FLOOR_TEXT[i];
    const objects: DungeonObjectSpawn[] = [];
    if (floor < count) objects.push(stairsTo(nextId)); // last floor has no stairs down
    out[id] = {
      id,
      name: text.name,
      index: 6 + i, // x-band 6..12 -> instanceOrigin x 4500..8100 (clear of the arena band)
      doorPos: { ...CRAWL_DOOR },
      overworldDoor: floor === 1, // only the first floor opens a portal on the surface
      entry: { x: 0, z: 4 },
      exitOffset: { x: 0, z: -6 },
      spawns: floorSpawns(FLOOR_ROSTERS[i]),
      objects: objects.length ? objects : undefined,
      interior: 'crypt',
      suggestedPlayers: floor <= 2 ? 1 : 5,
      enterText: text.enter,
      leaveText: text.leave,
    };
  }
  return out;
}

export const THE_CRAWL_DUNGEON_DEFS: Record<string, DungeonDef> = buildFloors();

// Ordered floor ids, for registries that want the chain in descent order.
export const THE_CRAWL_FLOOR_IDS: string[] = Object.keys(THE_CRAWL_DUNGEON_DEFS);
