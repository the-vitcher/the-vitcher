// The Clash: MOBA-mode content (data-as-code).
//
// A three-lane team battle authored entirely as data, gated behind SimConfig.mobaMode.
// Players pick a BESPOKE hero (its own ability kit, not the 9 class kits), push lanes
// past enemy towers with minion waves, and win by destroying the enemy core.
//
// Each hero maps to an underlying base class (for resource type, GCD, and stat
// scaffolding) but presents its own AbilityDef kit; the Sim builds the player's
// known-ability list from MobaHeroDef.abilities while mobaMode is on (see the Fiesta
// augment precedent). Bespoke abilities are built from the existing AbilityEffect
// primitives, so they need no new combat math.
//
// TONE: the hero roster is deliberately comedic — original characters, no borrowed
// IP. Names/titles are proper nouns (verbatim across locales, like player names);
// blurbs and ability descriptions render from this data as a documented English
// backstop (the GROUND_PICKUP_LINES precedent), pending a dedicated locale pass.
//
// The battleground is the outdoor diagonal-square map (geometry in sim/moba.ts:
// corner bases, S-curved mid, edge-running top/bot, river, jungle). Structures
// (3 towers per lane per team + 1 core per team) spawn from this def's `spawns`;
// their team is assigned at spawn from position (mobaTeamForPos) and their lane
// from the nearest centreline (mobaLaneForPos). Minions spawn in timed waves per
// lane, and the jungle's neutral creep camps respawn on a match timer (both Sim).

import type { AbilityDef, DungeonDef, DungeonSpawn, ItemDef, MobaHeroDef, MobTemplate, NpcDef } from '../types';
import {
  MOBA_CORE_LEVEL, MOBA_MAP, MOBA_MINION_GOLD, MOBA_MINION_LEVEL, MOBA_TOWER_GOLD, MOBA_TOWER_LEVEL,
  mobaTowerPoints, type MobaLaneIndex, type MobaTeam,
} from '../moba';
import { MOBA_MINION_BALANCE, MOBA_TOWER_BALANCE, MOBA_CORE_BALANCE, MOBA_ECONOMY } from './moba_balance';

// ---------------------------------------------------------------------------
// Bespoke hero ability kits. Built from AbilityEffect primitives; `class` is the
// hero's base class (resource type + GCD). learnLevel 1 (heroes are granted their
// whole kit at once, bypassing the class learn-level gate).
// ---------------------------------------------------------------------------
export const MOBA_ABILITIES: Record<string, AbilityDef> = {
  // ---- Snacko, the Trash Bandit (warrior / rage): raccoon line cook, bruiser ----
  moba_pan_smash: {
    id: 'moba_pan_smash', name: 'Pan Smash', class: 'warrior', cost: 15, castTime: 0, cooldown: 0,
    range: 0, school: 'physical', requiresTarget: true, learnLevel: 1,
    effects: [{ type: 'weaponStrike', bonus: 22 }],
    description: 'Cast iron solves everything. Strikes for weapon damage plus $d.',
  },
  moba_yoink: {
    id: 'moba_yoink', name: 'Yoink!', class: 'warrior', cost: 10, castTime: 0, cooldown: 14,
    range: 25, minRange: 8, school: 'physical', requiresTarget: true, offGcd: true, learnLevel: 1,
    effects: [{ type: 'charge' }, { type: 'stun', duration: 1.5 }],
    description: 'Sprint at an enemy and bowl them over for 1.5 seconds. They had snacks. They are YOUR snacks now.',
  },
  moba_grease_fire: {
    id: 'moba_grease_fire', name: 'Grease Fire', class: 'warrior', cost: 20, castTime: 0, cooldown: 15,
    range: 20, school: 'fire', requiresTarget: true, learnLevel: 1,
    effects: [{ type: 'groundAoE', min: 45, max: 65, radius: 8, duration: 4, interval: 1 }],
    description: 'The kitchen incident, recreated on purpose. Burns the ground under the target for $d over 4 seconds.',
  },
  moba_five_second_rule: {
    id: 'moba_five_second_rule', name: 'Five-Second Rule', class: 'warrior', cost: 10, castTime: 0, cooldown: 45,
    range: 5, school: 'nature', requiresTarget: true, targetType: 'friendly', learnLevel: 1,
    effects: [{ type: 'heal', min: 120, max: 160 }],
    description: 'Eat something off the floor. It is fine. It is FINE. Restores $d health.',
  },

  // ---- Lord Wafflesworth III, the Breakfast Baron (paladin / mana): support-tank ----
  moba_fork_of_justice: {
    id: 'moba_fork_of_justice', name: 'Fork of Justice', class: 'paladin', cost: 25, castTime: 0, cooldown: 0,
    range: 20, school: 'holy', requiresTarget: true, learnLevel: 1,
    effects: [{ type: 'directDamage', min: 40, max: 55 }],
    description: 'Judgement, pronged. Deals $d holy damage.',
  },
  moba_syrup_slick: {
    id: 'moba_syrup_slick', name: 'Syrup Slick', class: 'paladin', cost: 40, castTime: 0, cooldown: 16,
    range: 0, school: 'nature', requiresTarget: false, learnLevel: 1,
    effects: [{ type: 'aoeRoot', duration: 2, radius: 8, min: 20, max: 30 }],
    description: 'Nobody leaves brunch. Roots nearby enemies in artisanal syrup for 2 seconds.',
  },
  moba_butter_up: {
    id: 'moba_butter_up', name: 'Butter Up', class: 'paladin', cost: 35, castTime: 0, cooldown: 10,
    range: 30, school: 'holy', requiresTarget: true, targetType: 'friendly', learnLevel: 1,
    effects: [{ type: 'absorb', amount: 140, duration: 8 }],
    description: 'Slather an ally in protective butter. Absorbs $d damage. Compliments too, but mostly butter.',
  },
  moba_brunch_hour: {
    id: 'moba_brunch_hour', name: 'Brunch Hour', class: 'paladin', cost: 50, castTime: 0, cooldown: 30,
    range: 30, school: 'holy', requiresTarget: true, targetType: 'friendly', learnLevel: 1,
    effects: [{ type: 'hot', total: 180, duration: 9, interval: 3 }],
    description: 'Declares brunch. Restores $d health over 9 seconds, because you deserve this.',
  },

  // ---- Gerald, Employee of the Month (hunter / mana): cursed accountant, marksman ----
  moba_stapler_shot: {
    id: 'moba_stapler_shot', name: 'Thrown Stapler', class: 'hunter', cost: 20, castTime: 0, cooldown: 0,
    range: 30, school: 'physical', requiresTarget: true, learnLevel: 1,
    effects: [{ type: 'directDamage', min: 38, max: 52 }],
    description: 'The red one. He has been waiting years to do this. Deals $d damage.',
  },
  moba_red_tape: {
    id: 'moba_red_tape', name: 'Red Tape', class: 'hunter', cost: 30, castTime: 0, cooldown: 14,
    range: 30, school: 'arcane', requiresTarget: true, learnLevel: 1,
    effects: [{ type: 'root', duration: 2.5 }],
    description: 'Your request is pending. Roots the target in bureaucracy for 2.5 seconds.',
  },
  moba_audit: {
    id: 'moba_audit', name: 'The Audit', class: 'hunter', cost: 30, castTime: 0, cooldown: 10,
    range: 30, school: 'shadow', requiresTarget: true, learnLevel: 1,
    effects: [{ type: 'dot', total: 90, duration: 9, interval: 3 }],
    description: 'Your receipts are lies and now everyone knows. Deals $d damage over 9 seconds.',
  },
  moba_severance: {
    id: 'moba_severance', name: 'Severance Package', class: 'hunter', cost: 40, castTime: 0, cooldown: 40,
    range: 30, school: 'physical', requiresTarget: true, requiresTargetHpBelow: 0.35, learnLevel: 1,
    effects: [{ type: 'directDamage', min: 130, max: 190 }],
    description: 'Effective immediately. Executes an enemy below 35% health for $d damage.',
  },

  // ---- Grandma Vex, the Passive-Aggressor (priest / mana): support ----
  moba_cookie_toss: {
    id: 'moba_cookie_toss', name: 'Cookie Toss', class: 'priest', cost: 30, castTime: 1.0, cooldown: 0,
    range: 30, school: 'holy', requiresTarget: true, targetType: 'friendly', learnLevel: 1,
    effects: [{ type: 'heal', min: 70, max: 95 }],
    description: 'A warm cookie, thrown with terrifying accuracy. Restores $d health. You WILL say thank you.',
  },
  moba_itchy_sweater: {
    id: 'moba_itchy_sweater', name: 'Itchy Sweater', class: 'priest', cost: 30, castTime: 0, cooldown: 8,
    range: 30, school: 'holy', requiresTarget: true, targetType: 'friendly', learnLevel: 1,
    effects: [{ type: 'absorb', amount: 120, duration: 10 }],
    description: 'She knitted it herself and you are wearing it. Absorbs $d damage. It itches. Endure.',
  },
  moba_disappointed_sigh: {
    id: 'moba_disappointed_sigh', name: 'Disappointed Sigh', class: 'priest', cost: 25, castTime: 0, cooldown: 15,
    range: 0, school: 'shadow', requiresTarget: false, learnLevel: 1,
    effects: [{ type: 'aoeDamage', min: 15, max: 25, radius: 9 }, { type: 'aoeAttackPower', amount: 30, duration: 8, radius: 9 }],
    description: 'Not angry, just disappointed. Deals $d psychic damage and saps 30 attack power from everyone nearby who should have known better.',
  },
  moba_naptime: {
    id: 'moba_naptime', name: 'Naptime', class: 'priest', cost: 45, castTime: 1.2, cooldown: 25,
    range: 25, school: 'arcane', requiresTarget: true, learnLevel: 1,
    effects: [{ type: 'polymorph', duration: 5 }],
    description: 'Tucks an enemy in against their will for 5 seconds. Breaks on damage; they wake up refreshed, which is somehow worse.',
  },

  // ---- Blorbo, the Unemployed (druid / mana): sentient slime, bruiser ----
  moba_splat: {
    id: 'moba_splat', name: 'Splat', class: 'druid', cost: 30, castTime: 0, cooldown: 0,
    range: 0, school: 'nature', requiresTarget: false, learnLevel: 1,
    effects: [{ type: 'aoeDamage', min: 32, max: 44, radius: 7 }],
    description: 'Blorbo falls over. It is devastating. Deals $d damage to everything nearby.',
  },
  moba_engulf: {
    id: 'moba_engulf', name: 'Engulf', class: 'druid', cost: 35, castTime: 0, cooldown: 18,
    range: 0, school: 'nature', requiresTarget: true, learnLevel: 1,
    effects: [{ type: 'incapacitate', duration: 3 }],
    description: 'You are now inside Blorbo. Blorbo is so sorry. Incapacitates for 3 seconds; breaks on damage.',
  },
  moba_acid_reflux: {
    id: 'moba_acid_reflux', name: 'Acid Reflux', class: 'druid', cost: 25, castTime: 0, cooldown: 10,
    range: 20, school: 'nature', requiresTarget: true, learnLevel: 1,
    effects: [{ type: 'dot', total: 100, duration: 8, interval: 2 }],
    description: 'Blorbo should not have eaten that mailbox. Deals $d nature damage over 8 seconds.',
  },
  moba_regoo: {
    id: 'moba_regoo', name: 'Re-goo', class: 'druid', cost: 50, castTime: 0, cooldown: 40,
    range: 5, school: 'nature', requiresTarget: true, targetType: 'friendly', learnLevel: 1,
    effects: [{ type: 'hot', total: 200, duration: 10, interval: 2 }],
    description: 'Blorbo pulls himself together. Literally. Restores $d health over 10 seconds.',
  },

  // ---- Captain Chairleg, the Furniture Pirate (rogue / energy): assassin ----
  moba_splinter_stab: {
    id: 'moba_splinter_stab', name: 'Splinter Stab', class: 'rogue', cost: 35, castTime: 0, cooldown: 0,
    range: 0, school: 'physical', requiresTarget: true, awardsCombo: 1, learnLevel: 1,
    effects: [{ type: 'weaponStrike', bonus: 18 }],
    description: 'Stabs with a sharpened chair leg for weapon damage plus $d. Awards 1 combo point. Yes, it counts as a sword.',
  },
  moba_flatpack_ambush: {
    id: 'moba_flatpack_ambush', name: 'Flatpack Ambush', class: 'rogue', cost: 30, castTime: 0, cooldown: 16,
    range: 25, minRange: 8, school: 'physical', requiresTarget: true, offGcd: true, awardsCombo: 1, learnLevel: 1,
    effects: [{ type: 'charge' }, { type: 'weaponStrike', bonus: 28 }],
    description: 'Some assembly required. By your face. Lunges to the target and strikes for weapon damage plus $d.',
  },
  moba_peg_leg_sweep: {
    id: 'moba_peg_leg_sweep', name: 'Peg-Leg Sweep', class: 'rogue', cost: 40, castTime: 0, cooldown: 12,
    range: 0, school: 'physical', requiresTarget: false, learnLevel: 1,
    effects: [{ type: 'aoeDamage', min: 26, max: 38, radius: 6 }],
    description: 'The peg leg is ALSO furniture. Deals $d damage to nearby enemies.',
  },
  moba_warranty_void: {
    id: 'moba_warranty_void', name: 'Warranty Void', class: 'rogue', cost: 35, castTime: 0, cooldown: 0,
    range: 0, school: 'physical', requiresTarget: true, spendsCombo: true, learnLevel: 1,
    effects: [{ type: 'finisherDamage', base: 60, perCombo: 45, variance: 20 }],
    description: 'Finishing move: deals $d damage plus more per combo point. No refunds, no exchanges, no survivors.',
  },

  // ---- Professor Zapp, Tenured and Unhinged (mage / mana): mage ----
  moba_pop_quiz: {
    id: 'moba_pop_quiz', name: 'Pop Quiz', class: 'mage', cost: 25, castTime: 1.0, cooldown: 0,
    range: 30, school: 'arcane', requiresTarget: true, learnLevel: 1,
    effects: [{ type: 'directDamage', min: 42, max: 58 }],
    description: 'Nobody is ever prepared. Deals $d arcane damage, worth 40% of your final grade.',
  },
  moba_peer_review: {
    id: 'moba_peer_review', name: 'Peer Review', class: 'mage', cost: 35, castTime: 0, cooldown: 12,
    range: 30, school: 'shadow', requiresTarget: true, learnLevel: 1,
    effects: [{ type: 'dot', total: 110, duration: 10, interval: 2 }],
    description: 'Anonymous. Merciless. Reviewer 2. Deals $d damage over 10 seconds.',
  },
  moba_office_hours: {
    id: 'moba_office_hours', name: 'Office Hours', class: 'mage', cost: 55, castTime: 0, cooldown: 20,
    range: 28, school: 'fire', requiresTarget: true, learnLevel: 1,
    effects: [{ type: 'groundAoE', min: 60, max: 90, radius: 9, duration: 4, interval: 1 }],
    description: 'By appointment only. The appointment is pain. Burns the area for $d over 4 seconds.',
  },
  moba_thesis_defense: {
    id: 'moba_thesis_defense', name: 'Thesis Defense', class: 'mage', cost: 45, castTime: 0, cooldown: 30,
    range: 30, school: 'arcane', requiresTarget: true, targetType: 'friendly', learnLevel: 1,
    effects: [{ type: 'absorb', amount: 180, duration: 8 }],
    description: 'Seventeen years of research between you and harm. Absorbs $d damage.',
  },

  // ---- Doug, the Middle Manager of Darkness (warlock / mana): mage ----
  moba_touch_base: {
    id: 'moba_touch_base', name: 'Touch Base', class: 'warlock', cost: 25, castTime: 1.0, cooldown: 0,
    range: 30, school: 'shadow', requiresTarget: true, learnLevel: 1,
    effects: [{ type: 'directDamage', min: 40, max: 56 }],
    description: 'Just circling back on your continued existence. Deals $d shadow damage.',
  },
  moba_circle_back: {
    id: 'moba_circle_back', name: 'Circle Back', class: 'warlock', cost: 30, castTime: 0, cooldown: 8,
    range: 30, school: 'shadow', requiresTarget: true, learnLevel: 1,
    effects: [{ type: 'dot', total: 120, duration: 12, interval: 3 }],
    description: 'Puts a recurring meeting on your calendar. The agenda is suffering. Deals $d damage over 12 seconds.',
  },
  moba_synergy_drain: {
    id: 'moba_synergy_drain', name: 'Synergy Drain', class: 'warlock', cost: 40, castTime: 0, cooldown: 15,
    channel: { duration: 3, ticks: 3 },
    range: 25, school: 'shadow', requiresTarget: true, learnLevel: 1,
    effects: [{ type: 'drainTick', min: 25, max: 35, healFrac: 1 }],
    description: 'Leverages YOUR core competencies. Channels for 3 seconds, draining $d health per second into Doug.',
  },
  moba_mandatory_meeting: {
    id: 'moba_mandatory_meeting', name: 'Mandatory Meeting', class: 'warlock', cost: 55, castTime: 0, cooldown: 30,
    range: 0, school: 'shadow', requiresTarget: false, learnLevel: 1,
    effects: [{ type: 'aoeRoot', duration: 2.5, radius: 9, min: 24, max: 36 }],
    description: 'This could have been an email. Roots nearby enemies for 2.5 seconds while Doug shares his screen.',
  },

  // ---- Tinker Tallulah, OSHA's Final Warning (shaman / mana): support ----
  moba_rocket_wrench: {
    id: 'moba_rocket_wrench', name: 'Rocket Wrench', class: 'shaman', cost: 25, castTime: 0, cooldown: 0,
    range: 28, school: 'fire', requiresTarget: true, learnLevel: 1,
    effects: [{ type: 'directDamage', min: 40, max: 56 }],
    description: 'It comes back. Usually. Deals $d fire damage.',
  },
  moba_duct_tape: {
    id: 'moba_duct_tape', name: 'Duct Tape', class: 'shaman', cost: 35, castTime: 0, cooldown: 8,
    range: 30, school: 'nature', requiresTarget: true, targetType: 'friendly', learnLevel: 1,
    effects: [{ type: 'heal', min: 80, max: 110 }],
    description: 'Structural. Medical. Emotional. Restores $d health and holds the rest together.',
  },
  moba_jumper_cables: {
    id: 'moba_jumper_cables', name: 'Jumper Cables', class: 'shaman', cost: 40, castTime: 0, cooldown: 20,
    range: 10, school: 'nature', requiresTarget: true, learnLevel: 1,
    effects: [{ type: 'directDamage', min: 20, max: 30 }, { type: 'stun', duration: 2 }],
    description: 'CLEAR! Shocks the target for $d damage and stuns them for 2 seconds. Not certified for this. Not certified for anything.',
  },
  moba_untested_prototype: {
    id: 'moba_untested_prototype', name: 'Untested Prototype', class: 'shaman', cost: 60, castTime: 0, cooldown: 45,
    range: 0, school: 'fire', requiresTarget: false, learnLevel: 1,
    effects: [{ type: 'aoeDamage', min: 80, max: 120, radius: 9 }],
    description: 'The warranty voids on impact. Deals $d fire damage to everything nearby, including her eyebrows.',
  },

  // ---- Moth Larry, Lamp Enthusiast (mage / mana): marksman ----
  moba_wing_slap: {
    id: 'moba_wing_slap', name: 'Wing Slap', class: 'mage', cost: 20, castTime: 0, cooldown: 0,
    range: 25, school: 'physical', requiresTarget: true, learnLevel: 1,
    effects: [{ type: 'directDamage', min: 36, max: 50 }],
    description: 'A dusty, surprisingly firm wing to the face. Deals $d damage.',
  },
  moba_dust_gust: {
    id: 'moba_dust_gust', name: 'Dust Gust', class: 'mage', cost: 30, castTime: 0, cooldown: 12,
    range: 0, school: 'nature', requiresTarget: false, learnLevel: 1,
    effects: [{ type: 'aoeDamage', min: 18, max: 26, radius: 8 }, { type: 'aoeAttackSpeed', mult: 0.7, duration: 5, radius: 8 }],
    description: 'One good flap. Nearby enemies take $d damage and attack 30% slower while coughing.',
  },
  moba_erratic_flight: {
    id: 'moba_erratic_flight', name: 'Erratic Flight', class: 'mage', cost: 25, castTime: 0, cooldown: 25,
    range: 0, school: 'arcane', requiresTarget: false, offGcd: true, learnLevel: 1,
    effects: [{ type: 'selfBuff', kind: 'buff_dodge', value: 0.3, duration: 6 }],
    description: 'Nobody can predict the moth. Not even the moth. +30% dodge for 6 seconds.',
  },
  moba_the_lamp: {
    id: 'moba_the_lamp', name: 'L A M P', class: 'mage', cost: 60, castTime: 1.2, cooldown: 50,
    range: 30, school: 'holy', requiresTarget: true, learnLevel: 1,
    effects: [{ type: 'groundAoE', min: 90, max: 130, radius: 10, duration: 3, interval: 1 }],
    description: 'He found it. The big one. The beautiful one. Sears the area for $d holy damage over 3 seconds.',
  },
};

// ---------------------------------------------------------------------------
// The heroes. Ten originals across every role, each on a different base class
// (mage doubles up) so every resource type is represented.
// ---------------------------------------------------------------------------
export const MOBA_HEROES: Record<string, MobaHeroDef> = {
  snacko: {
    id: 'snacko', name: 'Snacko', title: 'the Trash Bandit', role: 'bruiser', baseClass: 'warrior',
    abilities: ['moba_pan_smash', 'moba_yoink', 'moba_grease_fire', 'moba_five_second_rule'],
    color: 0xc87f3a,
    blurb: 'A raccoon line cook who fights with a cast-iron pan and zero food-safety training. Everything is a snack if you believe.',
  },
  wafflesworth: {
    id: 'wafflesworth', name: 'Lord Wafflesworth III', title: 'the Breakfast Baron', role: 'support', baseClass: 'paladin',
    abilities: ['moba_fork_of_justice', 'moba_syrup_slick', 'moba_butter_up', 'moba_brunch_hour'],
    color: 0xe8b84a,
    blurb: 'A sentient waffle of noble birth. Shields allies in butter, roots enemies in syrup, and insists this is all very dignified.',
  },
  gerald: {
    id: 'gerald', name: 'Gerald', title: 'Employee of the Month', role: 'marksman', baseClass: 'hunter',
    abilities: ['moba_stapler_shot', 'moba_red_tape', 'moba_audit', 'moba_severance'],
    color: 0x8a9aa8,
    blurb: 'An accountant who snapped during the Q3 review. Weaponized office supplies, audits that draw blood, and one very final severance package.',
  },
  grandma_vex: {
    id: 'grandma_vex', name: 'Grandma Vex', title: 'the Passive-Aggressor', role: 'support', baseClass: 'priest',
    abilities: ['moba_cookie_toss', 'moba_itchy_sweater', 'moba_disappointed_sigh', 'moba_naptime'],
    color: 0xd8a8c8,
    blurb: 'Heals with cookies, shields with hand-knitted sweaters, and lowers enemy morale with a single, devastating sigh.',
  },
  blorbo: {
    id: 'blorbo', name: 'Blorbo', title: 'the Unemployed', role: 'bruiser', baseClass: 'druid',
    abilities: ['moba_splat', 'moba_engulf', 'moba_acid_reflux', 'moba_regoo'],
    color: 0x6ad46a,
    blurb: 'A slime between jobs. Falls on people professionally, swallows them apologetically, and reassembles himself when it all goes wrong.',
  },
  chairleg: {
    id: 'chairleg', name: 'Captain Chairleg', title: 'the Furniture Pirate', role: 'assassin', baseClass: 'rogue',
    abilities: ['moba_splinter_stab', 'moba_flatpack_ambush', 'moba_peg_leg_sweep', 'moba_warranty_void'],
    color: 0x9a6a3a,
    blurb: 'Plunders living rooms, duels with a sharpened chair leg, and voids warranties as a finishing move. The peg leg is also furniture.',
  },
  zapp: {
    id: 'zapp', name: 'Professor Zapp', title: 'Tenured and Unhinged', role: 'mage', baseClass: 'mage',
    abilities: ['moba_pop_quiz', 'moba_peer_review', 'moba_office_hours', 'moba_thesis_defense'],
    color: 0x7a6aff,
    blurb: 'Teaches applied destruction. Pop quizzes hit like meteors, office hours are a war crime, and his thesis is legally a shield.',
  },
  doug: {
    id: 'doug', name: 'Doug', title: 'Middle Manager of Darkness', role: 'mage', baseClass: 'warlock',
    abilities: ['moba_touch_base', 'moba_circle_back', 'moba_synergy_drain', 'moba_mandatory_meeting'],
    color: 0x6a4a8a,
    blurb: 'A demon who found his true calling in middle management. Drains your synergy, circles back on your health bar, and roots whole teams in meetings.',
  },
  tallulah: {
    id: 'tallulah', name: 'Tinker Tallulah', title: "OSHA's Final Warning", role: 'support', baseClass: 'shaman',
    abilities: ['moba_rocket_wrench', 'moba_duct_tape', 'moba_jumper_cables', 'moba_untested_prototype'],
    color: 0xff8a4a,
    blurb: 'Field engineer, field medic, fire hazard. Duct tape fixes allies, jumper cables restart enemies, and the prototype has never been tested. Once.',
  },
  moth_larry: {
    id: 'moth_larry', name: 'Moth Larry', title: 'Lamp Enthusiast', role: 'marksman', baseClass: 'mage',
    abilities: ['moba_wing_slap', 'moba_dust_gust', 'moba_erratic_flight', 'moba_the_lamp'],
    color: 0xd8d0b0,
    blurb: 'A moth with one dream and four wings. Flies erratically, slaps firmly, and his ultimate is exactly what you think it is.',
  },
};

export const MOBA_HERO_IDS: string[] = Object.keys(MOBA_HEROES);

// ---------------------------------------------------------------------------
// The shop. Fifteen bespoke gear pieces (universal: no class/armour-type locks,
// like the Crawl drops) bought with lane gold, tiered so a match's creep income
// buys a build. Prices are buyValue; sellValue is the vendor's buyback rate.
// ---------------------------------------------------------------------------
export const MOBA_ITEMS: Record<string, ItemDef> = {
  moba_spatula_of_smiting: {
    id: 'moba_spatula_of_smiting', name: 'Spatula of Smiting', kind: 'weapon', slot: 'mainhand', quality: 'uncommon',
    weapon: { min: 14, max: 22, speed: 2.4 }, stats: { str: 8, sta: 4 }, sellValue: 180, buyValue: 900,
  },
  moba_sharpened_pencil: {
    id: 'moba_sharpened_pencil', name: 'Number Two Pencil (Sharpened)', kind: 'weapon', slot: 'mainhand', quality: 'uncommon',
    weapon: { min: 9, max: 14, speed: 1.6, dagger: true }, stats: { agi: 8 }, sellValue: 180, buyValue: 900,
  },
  moba_wand_of_inconvenience: {
    id: 'moba_wand_of_inconvenience', name: 'Wand of Mild Inconvenience', kind: 'weapon', slot: 'mainhand', quality: 'uncommon',
    weapon: { min: 11, max: 18, speed: 2.0 }, stats: { int: 10 }, sellValue: 180, buyValue: 900,
  },
  moba_suspicious_spoon: {
    id: 'moba_suspicious_spoon', name: 'Suspiciously Large Spoon', kind: 'weapon', slot: 'mainhand', quality: 'rare',
    weapon: { min: 22, max: 34, speed: 2.8 }, stats: { str: 12, sta: 8 }, sellValue: 440, buyValue: 2200,
  },
  moba_hr_violation: {
    id: 'moba_hr_violation', name: 'Certified HR Violation', kind: 'weapon', slot: 'mainhand', quality: 'rare',
    weapon: { min: 26, max: 40, speed: 2.6 }, stats: { str: 10, agi: 10 }, sellValue: 480, buyValue: 2400,
  },
  moba_bubble_wrap_cuirass: {
    id: 'moba_bubble_wrap_cuirass', name: 'Bubble Wrap Cuirass', kind: 'armor', slot: 'chest', quality: 'uncommon',
    stats: { sta: 10, armor: 90 }, sellValue: 140, buyValue: 700,
  },
  moba_traffic_cone: {
    id: 'moba_traffic_cone', name: 'Traffic Cone of Authority', kind: 'armor', slot: 'helmet', quality: 'uncommon',
    stats: { str: 4, sta: 6, armor: 70 }, sellValue: 120, buyValue: 600,
  },
  moba_oven_mitts: {
    id: 'moba_oven_mitts', name: 'Oven Mitts of Deft Handling', kind: 'armor', slot: 'gloves', quality: 'uncommon',
    stats: { agi: 6, armor: 50 }, sellValue: 100, buyValue: 500,
  },
  moba_foam_clogs: {
    id: 'moba_foam_clogs', name: 'Foam Clogs of Blinding Speed', kind: 'armor', slot: 'feet', quality: 'uncommon',
    stats: { agi: 5, sta: 4, armor: 45 }, sellValue: 130, buyValue: 650,
  },
  moba_cargo_shorts: {
    id: 'moba_cargo_shorts', name: 'Cargo Shorts of Holding', kind: 'armor', slot: 'legs', quality: 'uncommon',
    stats: { str: 4, sta: 6, armor: 55 }, sellValue: 130, buyValue: 650,
  },
  moba_tactical_fanny_pack: {
    id: 'moba_tactical_fanny_pack', name: 'Tactical Fanny Pack', kind: 'armor', slot: 'waist', quality: 'uncommon',
    stats: { sta: 8, armor: 40 }, sellValue: 110, buyValue: 550,
  },
  moba_shoulder_parrot: {
    id: 'moba_shoulder_parrot', name: 'Shoulder Parrot (Taxidermied)', kind: 'armor', slot: 'shoulder', quality: 'uncommon',
    stats: { agi: 4, sta: 4, armor: 55 }, sellValue: 120, buyValue: 600,
  },
  moba_executive_bathrobe: {
    id: 'moba_executive_bathrobe', name: 'Executive Bathrobe', kind: 'armor', slot: 'chest', quality: 'uncommon',
    stats: { int: 12, spi: 5, armor: 45 }, sellValue: 160, buyValue: 800,
  },
  moba_reading_glasses: {
    id: 'moba_reading_glasses', name: "Grandma's Reading Glasses", kind: 'armor', slot: 'helmet', quality: 'uncommon',
    stats: { int: 8, spi: 6, armor: 35 }, sellValue: 140, buyValue: 700,
  },
  moba_support_brick: {
    id: 'moba_support_brick', name: 'Emotional Support Brick', kind: 'armor', slot: 'waist', quality: 'rare',
    stats: { sta: 14, armor: 60 }, sellValue: 400, buyValue: 2000,
  },
};

// ---------------------------------------------------------------------------
// The shopkeeper. One NPC def, spawned at BOTH bases (two dungeon.npcs entries).
// Talking to it opens the standard vendor window; stock is the full MOBA gear
// line plus the classic potions (already localized base items).
// ---------------------------------------------------------------------------
export const MOBA_NPCS: Record<string, NpcDef> = {
  moba_shopkeeper: {
    id: 'moba_shopkeeper',
    name: 'Twobags',
    title: 'Definitely Licensed Merchant',
    pos: { x: 0, z: 0 }, // ignored: spawned into the instance, not surface-placed
    facing: 0,
    color: 0xc8a84a,
    questIds: [],
    vendorItems: [
      ...Object.keys(MOBA_ITEMS),
      'minor_healing_potion', 'lesser_healing_potion', 'healing_potion',
      'minor_mana_potion', 'lesser_mana_potion', 'mana_potion',
    ],
    greeting: 'Welcome, welcome! Twobags has everything a hero needs: pans, cones, bricks, questionable paperwork. All sales final, all items certified by someone. Gold up front, glory later!',
    dynamic: true,
  },
};

// ---------------------------------------------------------------------------
// Lane structures, minions, and the jungle's neutral creeps. Towers and cores are
// stationary (mobaRole gates the Sim's stationary AI); minions walk their lane.
// Team comes from Entity.mobaTeam, assigned at spawn from position. The jungle
// creeps have NO mobaRole and NO mobaTeam: they are neutral (hostile to both
// teams, ignored by minions and towers), guard their camp with the normal
// threat-table AI, and pay instant last-hit gold plus kill XP — farm them.
// ---------------------------------------------------------------------------
export const MOBA_MOBS: Record<string, MobTemplate> = {
  moba_minion_melee: {
    id: 'moba_minion_melee', name: 'Lane Footman', minLevel: MOBA_MINION_LEVEL, maxLevel: MOBA_MINION_LEVEL,
    family: 'humanoid', mobaRole: 'minion',
    ...MOBA_MINION_BALANCE.melee,
    loot: [{ copper: MOBA_MINION_GOLD, chance: 1 }],
    scale: 0.85, color: 0xb8a06a,
  },
  moba_minion_ranged: {
    id: 'moba_minion_ranged', name: 'Lane Caster', minLevel: MOBA_MINION_LEVEL, maxLevel: MOBA_MINION_LEVEL,
    family: 'humanoid', mobaRole: 'minion',
    ...MOBA_MINION_BALANCE.ranged,
    loot: [{ copper: MOBA_MINION_GOLD, chance: 1 }],
    scale: 0.8, color: 0x8a6ab8,
  },
  moba_tower: {
    id: 'moba_tower', name: 'Guard Tower', minLevel: MOBA_TOWER_LEVEL, maxLevel: MOBA_TOWER_LEVEL,
    family: 'elemental', mobaRole: 'tower',
    hpBase: MOBA_TOWER_BALANCE.hp, hpPerLevel: 0, dmgBase: MOBA_TOWER_BALANCE.dmg, dmgPerLevel: 0,
    attackSpeed: MOBA_TOWER_BALANCE.attackSpeed,
    armorPerLevel: MOBA_TOWER_BALANCE.armorPerLevel, moveSpeed: 0, aggroRadius: MOBA_TOWER_BALANCE.aggroRadius,
    loot: [{ copper: MOBA_TOWER_GOLD, chance: 1 }],
    scale: 2.2, color: 0xd9c27a,
  },
  moba_core: {
    id: 'moba_core', name: 'Nexus Core', minLevel: MOBA_CORE_LEVEL, maxLevel: MOBA_CORE_LEVEL,
    family: 'elemental', mobaRole: 'core',
    hpBase: MOBA_CORE_BALANCE.hp, hpPerLevel: 0, dmgBase: MOBA_CORE_BALANCE.dmg, dmgPerLevel: 0,
    attackSpeed: MOBA_CORE_BALANCE.attackSpeed,
    armorPerLevel: MOBA_CORE_BALANCE.armorPerLevel, moveSpeed: 0, aggroRadius: MOBA_CORE_BALANCE.aggroRadius,
    loot: [],
    scale: 3.0, color: 0x6ad0ff,
  },

  // ---- Jungle neutrals (small / medium / large camp, one of each per side) ----
  moba_creep_raccoon: {
    id: 'moba_creep_raccoon', name: 'Dumpster Raccoon', minLevel: 2, maxLevel: 2, family: 'beast',
    hpBase: 70, hpPerLevel: 8, dmgBase: 6, dmgPerLevel: 1.2, attackSpeed: 1.8,
    armorPerLevel: 5, moveSpeed: 7, aggroRadius: 6,
    loot: [{ copper: MOBA_ECONOMY.campGold.raccoon, chance: 1 }],
    scale: 0.8, color: 0x8a7a66,
  },
  moba_creep_goose: {
    id: 'moba_creep_goose', name: 'Unionized Goose', minLevel: 3, maxLevel: 3, family: 'beast',
    hpBase: 95, hpPerLevel: 9, dmgBase: 8, dmgPerLevel: 1.4, attackSpeed: 1.6,
    armorPerLevel: 5, moveSpeed: 8, aggroRadius: 6,
    loot: [{ copper: MOBA_ECONOMY.campGold.goose, chance: 1 }],
    scale: 0.85, color: 0xd8d8cc,
  },
  moba_creep_goose_foreman: {
    id: 'moba_creep_goose_foreman', name: 'Goose Foreman', minLevel: 4, maxLevel: 4, family: 'beast',
    hpBase: 150, hpPerLevel: 12, dmgBase: 10, dmgPerLevel: 1.6, attackSpeed: 1.8,
    armorPerLevel: 8, moveSpeed: 8, aggroRadius: 7,
    cleave: { radius: 5, mult: 0.4, name: 'Grievance Filing' },
    loot: [{ copper: MOBA_ECONOMY.campGold.gooseForeman, chance: 1 }],
    scale: 1.05, color: 0xb8b8a8,
  },
  moba_creep_vendbot: {
    id: 'moba_creep_vendbot', name: 'Vend-O-Tron', minLevel: 5, maxLevel: 5, family: 'elemental',
    hpBase: 260, hpPerLevel: 14, dmgBase: 12, dmgPerLevel: 1.8, attackSpeed: 2.4,
    armorPerLevel: 12, moveSpeed: 5, aggroRadius: 7,
    stoneskin: { amount: 60, every: 12, duration: 6, name: 'Exact Change Only' },
    loot: [{ copper: MOBA_ECONOMY.campGold.vendbot, chance: 1 }],
    scale: 1.3, color: 0xcc4444,
  },
};

// ---------------------------------------------------------------------------
// Static structure spawns (instance-local). One core per team plus three towers
// per lane per team, laid out from the shared geometry in sim/moba.ts. Team and
// lane are derived from position at spawn time.
// ---------------------------------------------------------------------------
function structureSpawns(): DungeonSpawn[] {
  const out: DungeonSpawn[] = [
    { mobId: 'moba_core', x: MOBA_MAP.coreA.x, z: MOBA_MAP.coreA.z },
    { mobId: 'moba_core', x: MOBA_MAP.coreB.x, z: MOBA_MAP.coreB.z },
  ];
  for (const team of ['A', 'B'] as MobaTeam[]) {
    for (const lane of [0, 1, 2] as MobaLaneIndex[]) {
      for (const p of mobaTowerPoints(team, lane)) out.push({ mobId: 'moba_tower', x: p.x, z: p.z });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// The battleground instance. Uses the oversized 'clash' interior (three lanes).
// index 14 -> instanceOrigin x 9300 (the arena band sits beyond it, see data.ts).
// ---------------------------------------------------------------------------
export const MOBA_DUNGEON_DEFS: Record<string, DungeonDef> = {
  moba_lane: {
    id: 'moba_lane',
    name: 'The Clash: Ironhold Fields',
    index: 14,
    doorPos: { x: 120, z: 30 }, // overworld portal, clear of town and the Crawl door
    overworldDoor: true,
    entry: { x: 0, z: 0 }, // arrivals land at the Team A end; match seating moves each hero to its base
    exitOffset: { x: 0, z: -6 },
    spawns: structureSpawns(),
    // A shopkeeper at each base, tucked beside the hero spawn pad.
    npcs: [
      { npcId: 'moba_shopkeeper', x: MOBA_MAP.shopA.x, z: MOBA_MAP.shopA.z },
      { npcId: 'moba_shopkeeper', x: MOBA_MAP.shopB.x, z: MOBA_MAP.shopB.z },
    ],
    interior: 'clash',
    suggestedPlayers: 5,
    enterText: 'Welcome to the Clash. Push the lane, take their towers, and shatter the enemy core before they shatter yours.',
    leaveText: 'You withdraw from the lane.',
  },
};
