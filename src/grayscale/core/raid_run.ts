// Deterministic raid resolution. Given a character, a raid, and a seeded Rng,
// this produces the whole run: which bosses fell, how much of the shared wipe
// budget it cost, and what dropped. Same inputs always give the same run, which
// is what lets the app replay a log and lets the tests assert on outcomes.
//
// All randomness flows through `Rng` (src/sim/rng.ts). No Math.random here.

import { Rng } from '../../sim/rng';
import type { Character } from './focus';
import type { RaidDef } from './raids';

/** Floor and ceiling on a pull, mirroring the sim's "nothing is ever certain" hit table. */
export const MIN_PULL_CHANCE = 0.05;
export const MAX_PULL_CHANCE = 0.95;

/**
 * Hard cap on pulls at a single boss. A soaked wipe costs a pull but not an
 * attempt, so the attempt budget alone does not bound the loop; this makes
 * termination structural rather than probabilistic. Reaching the cap ends the
 * run on that boss exactly as exhausting the budget does.
 */
export const MAX_PULLS_PER_BOSS = 50;

export interface BossOutcome {
  bossId: string;
  defeated: boolean;
  /** Wipes on this boss before it fell (or before the budget ran out). */
  wipes: number;
}

export interface RaidRunResult {
  raidId: string;
  cleared: boolean;
  bosses: BossOutcome[];
  /** Wipe budget consumed across the whole run. */
  attemptsUsed: number;
  /** Banked focus minutes the run consumed. Charged win or lose. */
  minutesSpent: number;
  /** i18n keys of the items that dropped. */
  loot: string[];
  /** Boss the run ended on when the budget ran out, if it did. */
  wipedOnBossId?: string;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Chance a single pull succeeds. Even might against boss power is a coin flip;
 * every point of might past that shifts the odds, clamped so an overgeared
 * character still cannot walk in blind and an undergeared one still has a shot.
 */
export function pullChance(might: number, power: number): number {
  if (power <= 0) return MAX_PULL_CHANCE;
  return clamp(0.5 + (might - power) / (2 * power), MIN_PULL_CHANCE, MAX_PULL_CHANCE);
}

/**
 * Chance a wipe is soaked by the raid's ward instead of costing an attempt.
 * Ward buys resilience, never immunity, so this is capped well below certainty.
 */
export function soakChance(ward: number, power: number): number {
  if (power <= 0) return 0;
  return clamp(ward / (ward + power * 2), 0, 0.4);
}

export function runRaid(character: Character, raid: RaidDef, rng: Rng): RaidRunResult {
  const bosses: BossOutcome[] = [];
  const loot: string[] = [];
  let attemptsUsed = 0;
  let wipedOnBossId: string | undefined;

  for (const boss of raid.bosses) {
    if (wipedOnBossId) {
      bosses.push({ bossId: boss.id, defeated: false, wipes: 0 });
      continue;
    }

    const chance = pullChance(character.might, boss.power);
    const soak = soakChance(character.ward, boss.power);
    let wipes = 0;
    let pulls = 0;
    let defeated = false;

    while (!defeated && attemptsUsed < raid.attempts && pulls < MAX_PULLS_PER_BOSS) {
      pulls++;
      if (rng.chance(chance)) {
        defeated = true;
        break;
      }
      wipes++;
      // A soaked wipe still costs the pull, just not the raid's attempt budget.
      if (!rng.chance(soak)) attemptsUsed++;
    }

    if (!defeated) wipedOnBossId = boss.id;
    bosses.push({ bossId: boss.id, defeated, wipes });

    if (defeated) {
      for (const entry of raid.loot) {
        if (rng.chance(entry.chance)) loot.push(entry.itemKey);
      }
    }
  }

  return {
    raidId: raid.id,
    cleared: bosses.every((outcome) => outcome.defeated),
    bosses,
    attemptsUsed,
    minutesSpent: raid.costMinutes,
    loot,
    ...(wipedOnBossId ? { wipedOnBossId } : {}),
  };
}
