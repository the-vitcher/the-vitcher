// The Clash: MOBA-mode content (data-as-code).
//
// A single-lane team battle authored entirely as data, gated behind SimConfig.mobaMode.
// Players pick a BESPOKE hero (its own ability kit, not the 9 class kits), push the lane
// past enemy towers with minion waves, and win by destroying the enemy core.
//
// Each hero maps to an underlying base class (for resource type, GCD, and stat
// scaffolding) but presents its own AbilityDef kit; the Sim builds the player's
// known-ability list from MobaHeroDef.abilities while mobaMode is on (see the Fiesta
// augment precedent). Bespoke abilities are built from the existing AbilityEffect
// primitives, so they need no new combat math.
//
// The lane runs down the central aisle of the shared 'crypt' interior (see moba.ts for
// the geometry). Structures (2 towers + 1 core per team) spawn from this def's `spawns`;
// their team is assigned at spawn from z (mobaTeamForZ). Minions spawn in timed waves
// (Sim), not from `spawns`.

import type { AbilityDef, DungeonDef, DungeonSpawn, MobaHeroDef, MobTemplate } from '../types';
import {
  MOBA_CORE_LEVEL, MOBA_LANE, MOBA_MINION_GOLD, MOBA_MINION_LEVEL, MOBA_TOWER_GOLD, MOBA_TOWER_LEVEL,
} from '../moba';

// ---------------------------------------------------------------------------
// Bespoke hero ability kits. Built from AbilityEffect primitives; `class` is the
// hero's base class (resource type + GCD). learnLevel 1 (heroes are granted their
// whole kit at once, bypassing the class learn-level gate).
// ---------------------------------------------------------------------------
export const MOBA_ABILITIES: Record<string, AbilityDef> = {
  // ---- Emberling (mage / mana): ranged burst mage ----
  moba_ember_bolt: {
    id: 'moba_ember_bolt', name: 'Ember Bolt', class: 'mage', cost: 20, castTime: 1.0, cooldown: 0,
    range: 28, school: 'fire', requiresTarget: true, learnLevel: 1,
    effects: [{ type: 'directDamage', min: 40, max: 60 }],
    description: 'Hurl a bolt of fire, dealing $d damage.',
  },
  moba_cinder_burst: {
    id: 'moba_cinder_burst', name: 'Cinder Burst', class: 'mage', cost: 35, castTime: 0, cooldown: 6,
    range: 25, school: 'fire', requiresTarget: true, learnLevel: 1,
    effects: [{ type: 'aoeDamage', min: 30, max: 45, radius: 8 }],
    description: 'Detonate embers around the target, dealing $d damage to all nearby enemies.',
  },
  moba_scorch: {
    id: 'moba_scorch', name: 'Scorch', class: 'mage', cost: 25, castTime: 0, cooldown: 8,
    range: 28, school: 'fire', requiresTarget: true, learnLevel: 1,
    effects: [{ type: 'dot', total: 60, duration: 6, interval: 2 }, { type: 'slow', mult: 0.5, duration: 4 }],
    description: 'Set the target ablaze, burning them and slowing their movement.',
  },
  moba_meteor: {
    id: 'moba_meteor', name: 'Meteor', class: 'mage', cost: 60, castTime: 1.5, cooldown: 60,
    range: 30, school: 'fire', requiresTarget: true, learnLevel: 1,
    effects: [{ type: 'groundAoE', min: 80, max: 120, radius: 10, duration: 3, interval: 1 }],
    description: 'Call down a meteor, scorching the ground for heavy damage over a few seconds.',
  },

  // ---- Ironward (warrior / rage): frontline bruiser ----
  moba_cleaving_blow: {
    id: 'moba_cleaving_blow', name: 'Cleaving Blow', class: 'warrior', cost: 15, castTime: 0, cooldown: 0,
    range: 0, school: 'physical', requiresTarget: true, learnLevel: 1,
    effects: [{ type: 'weaponStrike', bonus: 20 }],
    description: 'A heavy strike that deals weapon damage plus $d.',
  },
  moba_shield_charge: {
    id: 'moba_shield_charge', name: 'Shield Charge', class: 'warrior', cost: 10, castTime: 0, cooldown: 14,
    range: 25, minRange: 8, school: 'physical', requiresTarget: true, offGcd: true, learnLevel: 1,
    effects: [{ type: 'charge' }, { type: 'stun', duration: 1.5 }],
    description: 'Charge an enemy, stunning them for 1.5 seconds.',
  },
  moba_ground_slam: {
    id: 'moba_ground_slam', name: 'Ground Slam', class: 'warrior', cost: 20, castTime: 0, cooldown: 10,
    range: 0, school: 'physical', requiresTarget: false, learnLevel: 1,
    effects: [{ type: 'aoeDamage', min: 25, max: 35, radius: 8 }, { type: 'aoeAttackSpeed', mult: 0.7, duration: 4, radius: 8 }],
    description: 'Slam the ground, damaging and slowing the attacks of nearby enemies.',
  },
  moba_warbringer: {
    id: 'moba_warbringer', name: 'Warbringer', class: 'warrior', cost: 30, castTime: 0, cooldown: 60,
    range: 0, school: 'physical', requiresTarget: false, learnLevel: 1,
    effects: [{ type: 'aoeRoot', duration: 2, radius: 10, min: 60, max: 90 }],
    description: 'A shockwave that roots and damages all nearby enemies.',
  },

  // ---- Gale (rogue / energy): melee assassin ----
  moba_quick_slash: {
    id: 'moba_quick_slash', name: 'Quick Slash', class: 'rogue', cost: 40, castTime: 0, cooldown: 0,
    range: 0, school: 'physical', requiresTarget: true, awardsCombo: 1, learnLevel: 1,
    effects: [{ type: 'weaponStrike', bonus: 15 }],
    description: 'A fast strike that deals weapon damage plus $d and builds a combo point.',
  },
  moba_shadowstep: {
    id: 'moba_shadowstep', name: 'Shadowstep', class: 'rogue', cost: 30, castTime: 0, cooldown: 12,
    range: 25, minRange: 8, school: 'physical', requiresTarget: true, offGcd: true, learnLevel: 1,
    effects: [{ type: 'charge' }, { type: 'weaponStrike', bonus: 25 }],
    description: 'Blink behind an enemy and strike for weapon damage plus $d.',
  },
  moba_toxic_blade: {
    id: 'moba_toxic_blade', name: 'Toxic Blade', class: 'rogue', cost: 35, castTime: 0, cooldown: 8,
    range: 0, school: 'nature', requiresTarget: true, learnLevel: 1,
    effects: [{ type: 'weaponStrike', bonus: 10 }, { type: 'dot', total: 80, duration: 8, interval: 2 }],
    description: 'Coat your blade in venom, striking and poisoning the target.',
  },
  moba_assassinate: {
    id: 'moba_assassinate', name: 'Assassinate', class: 'rogue', cost: 40, castTime: 0, cooldown: 45,
    range: 0, school: 'physical', requiresTarget: true, requiresTargetHpBelow: 0.4, learnLevel: 1,
    effects: [{ type: 'directDamage', min: 120, max: 180 }],
    description: 'Execute a wounded enemy below 40% health for massive damage.',
  },
};

// ---------------------------------------------------------------------------
// The heroes. Three distinct kits across melee/ranged and each resource type.
// ---------------------------------------------------------------------------
export const MOBA_HEROES: Record<string, MobaHeroDef> = {
  emberling: {
    id: 'emberling', name: 'Emberling', title: 'the Kindled', role: 'mage', baseClass: 'mage',
    abilities: ['moba_ember_bolt', 'moba_cinder_burst', 'moba_scorch', 'moba_meteor'],
    color: 0xff7a3a,
    blurb: 'A ranged fire mage: pick off enemies from afar and drop a Meteor on grouped foes.',
  },
  ironward: {
    id: 'ironward', name: 'Ironward', title: 'the Bulwark', role: 'bruiser', baseClass: 'warrior',
    abilities: ['moba_cleaving_blow', 'moba_shield_charge', 'moba_ground_slam', 'moba_warbringer'],
    color: 0x8a97b0,
    blurb: 'A durable frontline bruiser: charge in, slam the ground, and root the enemy team.',
  },
  gale: {
    id: 'gale', name: 'Gale', title: 'the Whisper', role: 'assassin', baseClass: 'rogue',
    abilities: ['moba_quick_slash', 'moba_shadowstep', 'moba_toxic_blade', 'moba_assassinate'],
    color: 0x4ad0a0,
    blurb: 'A slippery assassin: blink onto a target, poison them, and execute the wounded.',
  },
};

export const MOBA_HERO_IDS: string[] = Object.keys(MOBA_HEROES);

// ---------------------------------------------------------------------------
// Lane structures and minions. Towers and cores are stationary (mobaRole gates
// the Sim's stationary AI); minions walk the lane. Team comes from Entity.mobaTeam,
// assigned at spawn by z (mobaTeamForZ).
// ---------------------------------------------------------------------------
export const MOBA_MOBS: Record<string, MobTemplate> = {
  moba_minion_melee: {
    id: 'moba_minion_melee', name: 'Lane Footman', minLevel: MOBA_MINION_LEVEL, maxLevel: MOBA_MINION_LEVEL,
    family: 'humanoid', mobaRole: 'minion',
    hpBase: 120, hpPerLevel: 6, dmgBase: 9, dmgPerLevel: 1.4, attackSpeed: 2.0,
    armorPerLevel: 6, moveSpeed: 6, aggroRadius: 9,
    loot: [{ copper: MOBA_MINION_GOLD, chance: 1 }],
    scale: 0.85, color: 0xb8a06a,
  },
  moba_minion_ranged: {
    id: 'moba_minion_ranged', name: 'Lane Caster', minLevel: MOBA_MINION_LEVEL, maxLevel: MOBA_MINION_LEVEL,
    family: 'humanoid', mobaRole: 'minion',
    hpBase: 80, hpPerLevel: 5, dmgBase: 11, dmgPerLevel: 1.6, attackSpeed: 2.4,
    armorPerLevel: 4, moveSpeed: 6, aggroRadius: 12,
    loot: [{ copper: MOBA_MINION_GOLD, chance: 1 }],
    scale: 0.8, color: 0x8a6ab8,
  },
  moba_tower: {
    id: 'moba_tower', name: 'Guard Tower', minLevel: MOBA_TOWER_LEVEL, maxLevel: MOBA_TOWER_LEVEL,
    family: 'elemental', mobaRole: 'tower',
    hpBase: 900, hpPerLevel: 0, dmgBase: 34, dmgPerLevel: 0, attackSpeed: 1.5,
    armorPerLevel: 22, moveSpeed: 0, aggroRadius: 16,
    loot: [{ copper: MOBA_TOWER_GOLD, chance: 1 }],
    scale: 2.2, color: 0xd9c27a,
  },
  moba_core: {
    id: 'moba_core', name: 'Nexus Core', minLevel: MOBA_CORE_LEVEL, maxLevel: MOBA_CORE_LEVEL,
    family: 'elemental', mobaRole: 'core',
    hpBase: 2200, hpPerLevel: 0, dmgBase: 22, dmgPerLevel: 0, attackSpeed: 2.0,
    armorPerLevel: 26, moveSpeed: 0, aggroRadius: 14,
    loot: [],
    scale: 3.0, color: 0x6ad0ff,
  },
};

// ---------------------------------------------------------------------------
// Static structure spawns (instance-local). Two towers + one core per team,
// laid down the aisle. Team is derived from z at spawn time.
// ---------------------------------------------------------------------------
const MOBA_STRUCTURE_SPAWNS: DungeonSpawn[] = [
  { mobId: 'moba_core', x: MOBA_LANE.coreA.x, z: MOBA_LANE.coreA.z },
  { mobId: 'moba_tower', x: MOBA_LANE.towersA[0].x, z: MOBA_LANE.towersA[0].z },
  { mobId: 'moba_tower', x: MOBA_LANE.towersA[1].x, z: MOBA_LANE.towersA[1].z },
  { mobId: 'moba_core', x: MOBA_LANE.coreB.x, z: MOBA_LANE.coreB.z },
  { mobId: 'moba_tower', x: MOBA_LANE.towersB[0].x, z: MOBA_LANE.towersB[0].z },
  { mobId: 'moba_tower', x: MOBA_LANE.towersB[1].x, z: MOBA_LANE.towersB[1].z },
];

// ---------------------------------------------------------------------------
// The lane instance. Reuses the 'crypt' interior; the lane runs down its aisle.
// index 14 -> instanceOrigin x 9300 (the arena band sits beyond it, see data.ts).
// ---------------------------------------------------------------------------
export const MOBA_DUNGEON_DEFS: Record<string, DungeonDef> = {
  moba_lane: {
    id: 'moba_lane',
    name: 'The Clash: Ironhold Lane',
    index: 14,
    doorPos: { x: 120, z: 30 }, // overworld portal, clear of town and the Crawl door
    overworldDoor: true,
    entry: { x: 0, z: 6 }, // players arrive at the Team A foot; team B is placed at their core on match start
    exitOffset: { x: 0, z: -6 },
    spawns: MOBA_STRUCTURE_SPAWNS,
    interior: 'crypt',
    suggestedPlayers: 5,
    enterText: 'Welcome to the Clash. Push the lane, take their towers, and shatter the enemy core before they shatter yours.',
    leaveText: 'You withdraw from the lane.',
  },
};
