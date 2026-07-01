// The Crawl: a descending megadungeon scenario in the dungeon-crawl tradition
// (a deadly, game-show-narrated descent where you level up on one floor and take
// the stairs down to the next, tougher one). It is authored entirely as data:
// a chain of single-instance DungeonDefs, each linked to the next by an internal
// "Stairway Down" (templateId 'dungeon_door'), exactly like the Nythraxis
// crypt -> boss-arena chain in dungeons.ts. Leveling and the floor-to-floor
// transition are existing engine mechanics; this file only describes the floors.
//
// Unlike the rest of the dungeons, The Crawl ships its OWN bespoke roster
// (THE_CRAWL_MOBS) and loot (THE_CRAWL_ITEMS), themed to the Showrunner's live
// broadcast: spectator drones, husked former residents, chrome zealots, and a
// boss per floor. Mob level bands rise floor by floor (Floor 1 ~L1-4 up to the
// Showrunner at L20), which is what forces the player to grind a floor before the
// next is survivable.
//
// Floor interiors all use the shared 'crypt' room (sim/dungeon_layout CRYPT_LAYOUT,
// z -19..112, walls at |x|=23, pillars at |x|=14, tombs at |x|=19). Spawns sit in
// the safe centre aisle (|x| <= 9, z 18..98) and each Stairway Down sits flush to
// the back wall at z 110.4, mirroring the proven Nythraxis door placement.

import type { DungeonDef, DungeonObjectSpawn, DungeonSpawn, ItemDef, MobTemplate, NpcDef } from '../types';

// ---------------------------------------------------------------------------
// The guide. Sotreel is spawned into the Guide Room instance (dynamic: true, so
// the world loader does not surface-place it); the crawler talks to it to hear
// what is going on. Its greeting is the orientation, including the spectator /
// approval economy that drives the whole broadcast.
// ---------------------------------------------------------------------------
export const THE_CRAWL_NPCS: Record<string, NpcDef> = {
  crawl_guide_sotreel: {
    id: 'crawl_guide_sotreel',
    name: 'Sotreel',
    title: 'Tier-9 Liaison',
    pos: { x: 0, z: 0 }, // ignored: spawned into the instance, not surface-placed
    facing: 0,
    color: 0x6b8f3a,
    questIds: [],
    greeting: 'Crawler. Sotreel, Tier-9 Liaison, that is me, and yes I drew the short straw. Fast version, because everything down here is on a timer: your world got redeveloped and you are now a contestant on the Crawl, a live broadcast the whole galaxy is betting on. There are floors below us, each deadlier than the last. Kill things, take their levels, find the stairs down, and do not get boring, because the audience pays for the bold. Approval is the only currency that buys a way out, so stay near your party and try to be worth watching. The stairs are at the back. Good luck. I get paid when you live.',
    dynamic: true,
  },
};

// ---------------------------------------------------------------------------
// Bespoke loot: a signature drop per boss, plus a junk token the trash drops.
// No requiredClass (universal), so any class can use a drop.
// ---------------------------------------------------------------------------
export const THE_CRAWL_ITEMS: Record<string, ItemDef> = {
  crawl_token: {
    id: 'crawl_token', name: 'Crawl Token', kind: 'junk', quality: 'common', sellValue: 25,
  },
  gnashers_fang: {
    id: 'gnashers_fang', name: "Gnasher's Fang", kind: 'weapon', slot: 'mainhand', quality: 'uncommon',
    weapon: { min: 6, max: 11, speed: 1.8, dagger: true }, stats: { agi: 3 }, sellValue: 110,
  },
  landlords_padded_vest: {
    id: 'landlords_padded_vest', name: "Landlord's Padded Vest", kind: 'armor', slot: 'chest', quality: 'uncommon',
    stats: { sta: 6, armor: 60 }, sellValue: 160,
  },
  producers_pet_collar: {
    id: 'producers_pet_collar', name: "Producer's Pet Collar", kind: 'armor', slot: 'waist', quality: 'uncommon',
    stats: { str: 4, sta: 5, armor: 45 }, sellValue: 210,
  },
  hostess_long_gloves: {
    id: 'hostess_long_gloves', name: "Hostess's Long Gloves", kind: 'armor', slot: 'gloves', quality: 'rare',
    stats: { agi: 8, sta: 5, armor: 70 }, sellValue: 420,
  },
  mist_anchor_pauldrons: {
    id: 'mist_anchor_pauldrons', name: 'Mist-Anchor Pauldrons', kind: 'armor', slot: 'shoulder', quality: 'rare',
    stats: { int: 10, sta: 6, armor: 80 }, sellValue: 520,
  },
  headliners_crown: {
    id: 'headliners_crown', name: "Headliner's Crown", kind: 'armor', slot: 'helmet', quality: 'rare',
    stats: { str: 8, sta: 12, armor: 130 }, sellValue: 800,
  },
  showrunners_gavel: {
    id: 'showrunners_gavel', name: "The Showrunner's Gavel", kind: 'weapon', slot: 'mainhand', quality: 'epic',
    weapon: { min: 30, max: 56, speed: 2.6 }, stats: { str: 14, sta: 10 }, sellValue: 6000,
  },
};

// ---------------------------------------------------------------------------
// Bespoke roster: 10 trash creatures reused across adjacent floors by level
// band, plus 7 floor bosses (elite; the Showrunner is the finale boss).
// ---------------------------------------------------------------------------
export const THE_CRAWL_MOBS: Record<string, MobTemplate> = {
  // ---- Trash ----
  crawl_tutorial_grub: {
    id: 'crawl_tutorial_grub', name: 'Tutorial Grub', minLevel: 1, maxLevel: 3, family: 'beast',
    hpBase: 28, hpPerLevel: 10, dmgBase: 5, dmgPerLevel: 1.6, attackSpeed: 2.2,
    armorPerLevel: 8, moveSpeed: 6.5, aggroRadius: 11,
    loot: [{ copper: 18, chance: 1 }, { itemId: 'crawl_token', chance: 0.2 }],
    scale: 0.8, color: 0x9aa86b,
  },
  crawl_spectator_drone: {
    id: 'crawl_spectator_drone', name: 'Spectator Drone', minLevel: 2, maxLevel: 5, family: 'elemental',
    hpBase: 24, hpPerLevel: 9, dmgBase: 5, dmgPerLevel: 1.8, attackSpeed: 1.8,
    armorPerLevel: 6, moveSpeed: 8.5, aggroRadius: 13,
    loot: [{ copper: 24, chance: 1 }, { itemId: 'crawl_token', chance: 0.2 }],
    scale: 0.7, color: 0x66ccff,
  },
  crawl_alley_skitterling: {
    id: 'crawl_alley_skitterling', name: 'Alley Skitterling', minLevel: 3, maxLevel: 6, family: 'spider',
    hpBase: 30, hpPerLevel: 11, dmgBase: 6, dmgPerLevel: 2.0, attackSpeed: 1.6,
    armorPerLevel: 8, moveSpeed: 8, aggroRadius: 12,
    loot: [{ copper: 30, chance: 1 }, { itemId: 'crawl_token', chance: 0.2 }],
    scale: 0.9, color: 0x7d5fa3,
  },
  crawl_husk_tenant: {
    id: 'crawl_husk_tenant', name: 'Husk Tenant', minLevel: 5, maxLevel: 9, family: 'undead',
    hpBase: 42, hpPerLevel: 15, dmgBase: 7, dmgPerLevel: 2.1, attackSpeed: 2.2,
    armorPerLevel: 12, moveSpeed: 6.5, aggroRadius: 12,
    loot: [{ copper: 50, chance: 1 }, { itemId: 'crawl_token', chance: 0.25 }],
    scale: 1.0, color: 0xb0a890,
  },
  crawl_spark_hound: {
    id: 'crawl_spark_hound', name: 'Spark Hound', minLevel: 6, maxLevel: 10, family: 'beast',
    hpBase: 46, hpPerLevel: 16, dmgBase: 8, dmgPerLevel: 2.2, attackSpeed: 1.8,
    armorPerLevel: 12, moveSpeed: 9, aggroRadius: 13,
    loot: [{ copper: 60, chance: 1 }, { itemId: 'crawl_token', chance: 0.25 }],
    scale: 0.95, color: 0xffd35a,
  },
  crawl_stitched_meatgolem: {
    id: 'crawl_stitched_meatgolem', name: 'Stitched Meat-Golem', minLevel: 9, maxLevel: 13, family: 'ogre',
    hpBase: 70, hpPerLevel: 20, dmgBase: 10, dmgPerLevel: 2.5, attackSpeed: 2.6,
    armorPerLevel: 18, moveSpeed: 6, aggroRadius: 12,
    cleave: { radius: 7, mult: 0.5, name: 'Wide Swing' },
    loot: [{ copper: 90, chance: 1 }, { itemId: 'crawl_token', chance: 0.25 }],
    scale: 1.2, color: 0xc56b5a,
  },
  crawl_rust_revenant: {
    id: 'crawl_rust_revenant', name: 'Rust Revenant', minLevel: 11, maxLevel: 15, family: 'undead',
    hpBase: 58, hpPerLevel: 19, dmgBase: 10, dmgPerLevel: 2.5, attackSpeed: 2.2,
    armorPerLevel: 18, moveSpeed: 7, aggroRadius: 12,
    loot: [{ copper: 130, chance: 1 }, { itemId: 'crawl_token', chance: 0.3 }],
    scale: 1.05, color: 0x9c6b3a,
  },
  crawl_static_wraith: {
    id: 'crawl_static_wraith', name: 'Static Wraith', minLevel: 13, maxLevel: 17, family: 'elemental',
    hpBase: 54, hpPerLevel: 20, dmgBase: 11, dmgPerLevel: 2.6, attackSpeed: 2.0,
    armorPerLevel: 12, moveSpeed: 8, aggroRadius: 13,
    loot: [{ copper: 170, chance: 1 }, { itemId: 'crawl_token', chance: 0.3 }],
    scale: 1.0, color: 0xa0e0ff,
  },
  crawl_chrome_zealot: {
    id: 'crawl_chrome_zealot', name: 'Chrome Zealot', minLevel: 15, maxLevel: 19, family: 'humanoid',
    hpBase: 62, hpPerLevel: 22, dmgBase: 12, dmgPerLevel: 2.7, attackSpeed: 2.2,
    armorPerLevel: 20, moveSpeed: 7, aggroRadius: 13,
    loot: [{ copper: 220, chance: 1 }, { itemId: 'crawl_token', chance: 0.3 }],
    scale: 1.0, color: 0xcfd8dc,
  },
  crawl_ratings_horror: {
    id: 'crawl_ratings_horror', name: 'Ratings Horror', minLevel: 18, maxLevel: 20, family: 'demon',
    hpBase: 70, hpPerLevel: 24, dmgBase: 13, dmgPerLevel: 2.8, attackSpeed: 2.2,
    armorPerLevel: 22, moveSpeed: 7.5, aggroRadius: 14,
    loot: [{ copper: 300, chance: 1 }, { itemId: 'crawl_token', chance: 0.3 }],
    scale: 1.15, color: 0xff4d6d,
  },

  // ---- Floor bosses (elite) ----
  crawl_boss_gnasher: {
    id: 'crawl_boss_gnasher', name: 'Gnasher, the First-Floor Favorite', minLevel: 4, maxLevel: 4, family: 'beast',
    elite: true,
    hpBase: 90, hpPerLevel: 24, dmgBase: 9, dmgPerLevel: 2.3, attackSpeed: 2.2,
    armorPerLevel: 14, moveSpeed: 7.5, aggroRadius: 15,
    cleave: { radius: 7, mult: 0.5, name: 'Gnashing Cleave' },
    loot: [{ copper: 600, chance: 1 }, { itemId: 'gnashers_fang', chance: 0.35 }],
    scale: 1.3, color: 0xd98c3a,
  },
  crawl_boss_vurmix: {
    id: 'crawl_boss_vurmix', name: 'Vurmix the Landlord', minLevel: 7, maxLevel: 7, family: 'undead',
    elite: true,
    hpBase: 140, hpPerLevel: 26, dmgBase: 10, dmgPerLevel: 2.4, attackSpeed: 2.3,
    armorPerLevel: 18, moveSpeed: 6.8, aggroRadius: 15,
    aoePulse: { min: 8, max: 12, radius: 9, every: 10, name: 'Eviction Notice' },
    loot: [{ copper: 1400, chance: 1 }, { itemId: 'landlords_padded_vest', chance: 0.35 }],
    scale: 1.25, color: 0x8d9b6a,
  },
  crawl_boss_producers_pet: {
    id: 'crawl_boss_producers_pet', name: "The Producer's Pet", minLevel: 10, maxLevel: 10, family: 'demon',
    elite: true,
    hpBase: 200, hpPerLevel: 30, dmgBase: 11, dmgPerLevel: 2.6, attackSpeed: 2.0,
    armorPerLevel: 20, moveSpeed: 8, aggroRadius: 16,
    enrage: { belowHpPct: 0.3, dmgMult: 1.4, hasteMult: 1.25 },
    loot: [{ copper: 2500, chance: 1 }, { itemId: 'producers_pet_collar', chance: 0.35 }],
    scale: 1.35, color: 0xb24bd6,
  },
  crawl_boss_mortdecai: {
    id: 'crawl_boss_mortdecai', name: 'Hostess Mortdecai', minLevel: 13, maxLevel: 13, family: 'humanoid',
    elite: true,
    hpBase: 220, hpPerLevel: 32, dmgBase: 12, dmgPerLevel: 2.6, attackSpeed: 2.2,
    armorPerLevel: 22, moveSpeed: 7, aggroRadius: 16,
    aoePulse: { min: 14, max: 20, radius: 11, every: 10, name: 'Audience Applause' },
    loot: [{ copper: 3500, chance: 1 }, { itemId: 'hostess_long_gloves', chance: 0.3 }],
    scale: 1.2, color: 0xd64b7a,
  },
  crawl_boss_mist_anchor: {
    id: 'crawl_boss_mist_anchor', name: 'The Mist Anchor', minLevel: 16, maxLevel: 16, family: 'elemental',
    elite: true,
    hpBase: 260, hpPerLevel: 34, dmgBase: 13, dmgPerLevel: 2.7, attackSpeed: 2.4,
    armorPerLevel: 22, moveSpeed: 6.5, aggroRadius: 16,
    summonAdds: { mobId: 'crawl_static_wraith', count: 2, atHpPct: [0.6, 0.3] },
    loot: [{ copper: 4500, chance: 1 }, { itemId: 'mist_anchor_pauldrons', chance: 0.3 }],
    scale: 1.4, color: 0x4bd6c0,
  },
  crawl_boss_kordeth: {
    id: 'crawl_boss_kordeth', name: 'Kordeth the Headliner', minLevel: 19, maxLevel: 19, family: 'demon',
    elite: true,
    hpBase: 320, hpPerLevel: 40, dmgBase: 14, dmgPerLevel: 2.9, attackSpeed: 2.6,
    armorPerLevel: 28, moveSpeed: 7, aggroRadius: 17,
    enrage: { belowHpPct: 0.3, dmgMult: 1.5, hasteMult: 1.3 },
    stomp: { radius: 9, every: 12, duration: 1.5, min: 18, max: 26, name: 'Headline Drop' },
    loot: [{ copper: 6000, chance: 1 }, { itemId: 'headliners_crown', chance: 0.3 }],
    scale: 1.5, color: 0xd6304b,
  },
  crawl_boss_showrunner: {
    id: 'crawl_boss_showrunner', name: 'The Showrunner', minLevel: 20, maxLevel: 20, family: 'demon',
    elite: true, boss: true,
    hpBase: 420, hpPerLevel: 48, dmgBase: 15, dmgPerLevel: 3.0, attackSpeed: 2.6,
    armorPerLevel: 32, moveSpeed: 7, aggroRadius: 18,
    aoePulse: { min: 28, max: 40, radius: 13, every: 8, name: 'Prime-Time Spotlight' },
    enrage: { belowHpPct: 0.3, dmgMult: 1.5, hasteMult: 1.3 },
    loot: [{ copper: 60000, chance: 1 }, { itemId: 'showrunners_gavel', chance: 0.4 }],
    scale: 1.7, color: 0x2b1b3d,
  },
};

// Shared overworld entrance for the whole Crawl. Only Floor 1 opens a door here
// (overworldDoor defaults true); the rest are reached by the in-floor stairs, but
// every floor points its doorPos here so dying / leaving any floor returns the
// crawler to the surface mouth of the dungeon. Kept in the Eastbrook Vale band,
// well clear of town, on open ground.
const CRAWL_DOOR = { x: 110, z: 40 };

// Seconds a party has on each floor before it collapses. Sized so a full descent
// fits inside an hourly run (seven floors) with room to spare.
const FLOOR_TIME_SEC = 300;

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
// bespoke trash creatures are drawn from the band that covers each floor's level.
const FLOOR_ROSTERS: string[][] = [
  // Floor 1 (L1-4)
  ['crawl_tutorial_grub', 'crawl_spectator_drone', 'crawl_alley_skitterling', 'crawl_tutorial_grub', 'crawl_spectator_drone', 'crawl_alley_skitterling',
   'crawl_tutorial_grub', 'crawl_spectator_drone', 'crawl_alley_skitterling', 'crawl_tutorial_grub', 'crawl_boss_gnasher', 'crawl_tutorial_grub', 'crawl_spectator_drone'],
  // Floor 2 (L5-7)
  ['crawl_husk_tenant', 'crawl_spark_hound', 'crawl_alley_skitterling', 'crawl_husk_tenant', 'crawl_spark_hound', 'crawl_husk_tenant',
   'crawl_spark_hound', 'crawl_alley_skitterling', 'crawl_husk_tenant', 'crawl_spark_hound', 'crawl_boss_vurmix', 'crawl_husk_tenant', 'crawl_spark_hound'],
  // Floor 3 (L9-10)
  ['crawl_spark_hound', 'crawl_husk_tenant', 'crawl_stitched_meatgolem', 'crawl_spark_hound', 'crawl_husk_tenant', 'crawl_stitched_meatgolem',
   'crawl_spark_hound', 'crawl_stitched_meatgolem', 'crawl_husk_tenant', 'crawl_spark_hound', 'crawl_boss_producers_pet', 'crawl_stitched_meatgolem', 'crawl_spark_hound'],
  // Floor 4 (L11-13)
  ['crawl_stitched_meatgolem', 'crawl_rust_revenant', 'crawl_stitched_meatgolem', 'crawl_rust_revenant', 'crawl_stitched_meatgolem', 'crawl_rust_revenant',
   'crawl_stitched_meatgolem', 'crawl_rust_revenant', 'crawl_stitched_meatgolem', 'crawl_rust_revenant', 'crawl_boss_mortdecai', 'crawl_rust_revenant', 'crawl_stitched_meatgolem'],
  // Floor 5 (L13-16)
  ['crawl_rust_revenant', 'crawl_static_wraith', 'crawl_rust_revenant', 'crawl_static_wraith', 'crawl_rust_revenant', 'crawl_static_wraith',
   'crawl_rust_revenant', 'crawl_static_wraith', 'crawl_rust_revenant', 'crawl_static_wraith', 'crawl_boss_mist_anchor', 'crawl_static_wraith', 'crawl_rust_revenant'],
  // Floor 6 (L16-19)
  ['crawl_static_wraith', 'crawl_chrome_zealot', 'crawl_static_wraith', 'crawl_chrome_zealot', 'crawl_static_wraith', 'crawl_chrome_zealot',
   'crawl_static_wraith', 'crawl_chrome_zealot', 'crawl_static_wraith', 'crawl_chrome_zealot', 'crawl_boss_kordeth', 'crawl_chrome_zealot', 'crawl_static_wraith'],
  // Floor 7 (L18-20 finale)
  ['crawl_chrome_zealot', 'crawl_ratings_horror', 'crawl_chrome_zealot', 'crawl_ratings_horror', 'crawl_chrome_zealot', 'crawl_ratings_horror',
   'crawl_chrome_zealot', 'crawl_ratings_horror', 'crawl_chrome_zealot', 'crawl_ratings_horror', 'crawl_boss_showrunner', 'crawl_ratings_horror', 'crawl_chrome_zealot'],
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
    enter: 'Floor 3. The Producer keeps a pet down here and does not share. Gain a few levels first, then knock.',
    leave: 'You back out of the crypt while you still can.',
  },
  {
    name: 'The Crawl: Floor 4, The Drowned Ranks',
    enter: 'Floor 4. Cold water, colder dead, and a Hostess with strong opinions about visitors.',
    leave: 'You wade back up out of the drowning dark.',
  },
  {
    name: 'The Crawl: Floor 5, The Mist Warrens',
    enter: 'Floor 5. The Mist Anchor drags the fog in, and the fog drags reinforcements. The audience loves reinforcements.',
    leave: 'You feel your way back up through the thinning mist.',
  },
  {
    name: 'The Crawl: Floor 6, The Bonewright Halls',
    enter: 'Floor 6. Kordeth the Headliner is only the warmup for what waits below. Be the right level for this.',
    leave: 'You haul yourself back up the bonewright stair.',
  },
  {
    name: 'The Crawl: Floor 7, The Showrunners Vault',
    enter: 'The bottom floor. The Showrunner waits on the great dais, and the whole galaxy is watching. There are no more stairs down.',
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
      overworldDoor: false, // the surface portal opens into the Guide Room; floors are reached by descending
      entry: { x: 0, z: 4 },
      exitOffset: { x: 0, z: -6 },
      spawns: floorSpawns(FLOOR_ROSTERS[i]),
      objects: objects.length ? objects : undefined,
      interior: 'crypt',
      floorTimeSec: FLOOR_TIME_SEC, // reach the stairs down before the floor collapses
      suggestedPlayers: floor <= 2 ? 1 : 5,
      enterText: text.enter,
      leaveText: text.leave,
    };
  }
  return out;
}

const CRAWL_FLOORS = buildFloors();

// The Guide Room: a safe lobby reached from the surface portal. The crawler meets
// their guide (Sotreel) here, hears what is going on, then takes the stairs down to
// Floor 1. Instanced per party like every Crawl floor, so a group shares one guide.
const CRAWL_GUIDE_ROOM: DungeonDef = {
  id: 'crawl_guide_room',
  name: 'The Crawl: Guide Room',
  index: 13, // instanceOrigin x = 8400, clear of the arena band (ARENA_X 9000)
  doorPos: { ...CRAWL_DOOR }, // the surface portal opens into the Guide Room first
  overworldDoor: true,
  entry: { x: 0, z: 4 },
  exitOffset: { x: 0, z: -6 },
  spawns: [], // safe room: no hostiles
  objects: [stairsTo('crawl_floor_1')], // stairway down to Floor 1
  npcs: [{ npcId: 'crawl_guide_sotreel', x: 0, z: 22 }],
  interior: 'crypt',
  suggestedPlayers: 1,
  enterText: 'Welcome to the Crawl. This is a safe room, so nothing dies in here, including you. Find your guide, hear them out, and take the stairs down when you are ready.',
  leaveText: 'You step back out toward the surface that no longer exists.',
};

export const THE_CRAWL_DUNGEON_DEFS: Record<string, DungeonDef> = { crawl_guide_room: CRAWL_GUIDE_ROOM, ...CRAWL_FLOORS };

// Ordered floor ids (the seven combat floors, not the guide room).
export const THE_CRAWL_FLOOR_IDS: string[] = Object.keys(CRAWL_FLOORS);
