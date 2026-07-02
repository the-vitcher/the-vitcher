// The Clash: THE balance table.
//
// Every tunable Clash number lives HERE, as plain data (this repo's data-as-code
// idiom): hero stat blocks per role, minion/tower/core stats, the economy, match
// timers, death timers, and ability-rank curves. Balancing the game means editing
// THIS file only — no engine code changes. sim/moba.ts re-exports these values
// under its stable names and content/moba.ts builds the mob templates from them.
//
// Design targets (from the balance brief):
// - Turbo pacing: ~20 minute matches; heroes hit level 6 fast; full build ~18-20 min.
// - Combat feel: high damage, moderate health. Solo kill 2-5s; a squishy caught
//   alone dies in ~1.5-3s; team fights 8-15s; a frontliner survives ~2-2.5x a carry.
// - Minions left unattended kill each other in ~30-45s (locked by a pacing test).
// - Towers fall faster than traditional MOBAs and pay a TEAM-wide bounty.
// - Economy: ~2x a traditional MOBA. Jungle competitive with lanes.
// This module is a LEAF: it imports nothing, so sim core and content can both
// read it without cycles.

export type MobaRole = 'mage' | 'bruiser' | 'assassin' | 'marksman' | 'support';

// Per-role hero stat blocks, folded into recalcPlayerStats via Sim.playerMods.
// sta: +10 hp per point (moderate pools; carries stay squishy). ap: auto-attack
// power (marksmen highest sustained; mages lean on spells). Durability ratio
// bruiser/carry lands ~2.1-2.4x (locked by a pacing test).
export const MOBA_HERO_ROLE_STATS: Record<MobaRole, { sta: number; ap: number }> = {
  assassin: { sta: 24, ap: 42 }, // lowest health, highest burst (kit carries the rest)
  mage: { sta: 24, ap: 22 }, // fragile; spell damage comes from the kit
  marksman: { sta: 26, ap: 48 }, // fragile; highest sustained auto DPS
  bruiser: { sta: 62, ap: 34 }, // fighter/tank: ~2.2x carry durability, moderate damage
  support: { sta: 34, ap: 20 }, // utility over damage
};

// Lane minions. Numbers tuned so an unattended mirror fight resolves in 30-45s
// (pacing test) while a hero clears a caster in a couple of autos + one spell.
export const MOBA_MINION_BALANCE = {
  level: 3,
  melee: { hpBase: 150, hpPerLevel: 7, dmgBase: 5, dmgPerLevel: 0.9, attackSpeed: 2.0, armorPerLevel: 6, moveSpeed: 6, aggroRadius: 9 },
  ranged: { hpBase: 70, hpPerLevel: 5, dmgBase: 7, dmgPerLevel: 1.1, attackSpeed: 2.4, armorPerLevel: 4, moveSpeed: 6, aggroRadius: 12 },
};

// Towers and cores. Towers fall faster than classic MOBAs (turbo) but hit hard
// enough that early dives are lethal for squishy heroes.
export const MOBA_TOWER_BALANCE = {
  level: 8,
  hp: 700,
  dmg: 40,
  attackSpeed: 1.5,
  armorPerLevel: 22,
  aggroRadius: 16,
};
export const MOBA_CORE_BALANCE = {
  level: 10,
  hp: 1800,
  dmg: 26,
  attackSpeed: 2.0,
  armorPerLevel: 26,
  aggroRadius: 14,
};

// Economy: roughly 2x a traditional MOBA so builds complete in ~18-20 minutes.
// Tower kills pay the LAST HITTER `towerGold` plus `towerTeamGold` to every other
// hero on the killing team (objectives reward the whole team).
export const MOBA_ECONOMY = {
  minionGold: 50,
  towerGold: 300,
  towerTeamGold: 150,
  heroGoldBase: 200,
  heroGoldPerLevel: 15,
  // Jungle camp bounties (per creep, on the templates): small pack / goose pack /
  // foreman / miniboss. Kept lane-competitive on purpose.
  campGold: { raccoon: 45, goose: 55, gooseForeman: 90, vendbot: 160 },
};

// XP pacing: turbo (roughly 2x). Kill XP is a fixed fraction of the current
// level requirement, so a steady farmer reaches ~level 6 in the first minutes
// and finishes a match around 10-12.
export const MOBA_XP = {
  minionPct: 0.16,
  towerPct: 0.8,
  heroKillPct: 0.6,
  campPct: 0.2, // per jungle creep
};

// Match + wave timers.
export const MOBA_TIMERS = {
  warmupSec: 5,
  firstWaveSec: 15,
  waveIntervalSec: 30,
  recallChannelSec: 6,
  recallCdSec: 25,
  campRespawnSec: 60,
  // Death timer: min + perLevel*level, capped — long enough late to punish.
  respawnMin: 5,
  respawnPerLevel: 2,
  respawnMax: 45,
};

// Ability rank curves. Authored effect numbers are rank 2; hard-CC durations
// scale on the gentler curve. The last kit slot is the ultimate (single rank,
// unlocked at hero level `ultHeroLevel`).
export const MOBA_RANKS = {
  maxRank: 3,
  ultRanks: 1,
  ultHeroLevel: 6,
  power: [0.7, 1.0, 1.3] as readonly number[],
  cc: [1, 1.25, 1.5] as readonly number[],
};

// Hero seat level (level 1, one skill point, DotA-style).
export const MOBA_HERO_SEAT_LEVEL = 1;
