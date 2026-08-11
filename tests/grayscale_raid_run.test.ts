// Raid resolution: the pull/soak curves, the shared attempt budget, loot
// gating, and determinism from the seed.

import { describe, it, expect } from 'vitest';
import {
  MAX_PULLS_PER_BOSS,
  MAX_PULL_CHANCE,
  MIN_PULL_CHANCE,
  pullChance,
  runRaid,
  soakChance,
} from '../src/grayscale/core/raid_run';
import { RAIDS, raidById, type RaidDef } from '../src/grayscale/core/raids';
import { characterFor, type Character } from '../src/grayscale/core/focus';
import { Rng } from '../src/sim/rng';

const CRYPT = raidById('hollow_crypt') as RaidDef;

function characterWith(might: number, ward: number): Character {
  return { level: 10, xp: 0, xpForNext: 100, lifetimeXp: 0, might, ward };
}

describe('pullChance', () => {
  it('is a coin flip when might exactly matches boss power', () => {
    expect(pullChance(50, 50)).toBeCloseTo(0.5, 10);
  });

  it('rises with might and falls without it', () => {
    expect(pullChance(75, 50)).toBeGreaterThan(0.5);
    expect(pullChance(25, 50)).toBeLessThan(0.5);
  });

  it('clamps both ends so nothing is ever certain', () => {
    expect(pullChance(100_000, 50)).toBe(MAX_PULL_CHANCE);
    expect(pullChance(0, 50)).toBe(MIN_PULL_CHANCE);
    expect(pullChance(-100_000, 50)).toBe(MIN_PULL_CHANCE);
  });

  it('does not divide by zero on a powerless boss', () => {
    expect(pullChance(10, 0)).toBe(MAX_PULL_CHANCE);
  });
});

describe('soakChance', () => {
  it('is zero without ward and rises with it', () => {
    expect(soakChance(0, 50)).toBe(0);
    expect(soakChance(80, 50)).toBeGreaterThan(soakChance(20, 50));
  });

  it('never reaches immunity', () => {
    expect(soakChance(1_000_000, 50)).toBeLessThanOrEqual(0.4);
  });

  it('does not divide by zero on a powerless boss', () => {
    expect(soakChance(10, 0)).toBe(0);
  });
});

describe('runRaid', () => {
  it('is deterministic: same character, raid, and seed give the same run', () => {
    const character = characterWith(40, 30);
    const a = runRaid(character, CRYPT, new Rng(12345));
    const b = runRaid(character, CRYPT, new Rng(12345));
    expect(a).toEqual(b);
  });

  it('gives different runs for different seeds', () => {
    const character = characterWith(40, 30);
    const runs = [1, 2, 3, 4, 5, 6, 7, 8].map((seed) => runRaid(character, CRYPT, new Rng(seed)));
    const shapes = new Set(runs.map((run) => JSON.stringify(run.bosses)));
    expect(shapes.size).toBeGreaterThan(1);
  });

  it('clears the raid outright when the character massively outgears it', () => {
    const result = runRaid(characterWith(100_000, 100_000), CRYPT, new Rng(7));
    expect(result.cleared).toBe(true);
    expect(result.bosses.every((boss) => boss.defeated)).toBe(true);
    expect(result.wipedOnBossId).toBeUndefined();
  });

  it('reports a wipe and skips the bosses behind it when undergeared', () => {
    const result = runRaid(characterWith(1, 0), CRYPT, new Rng(3));
    expect(result.cleared).toBe(false);
    expect(result.wipedOnBossId).toBe(CRYPT.bosses[0].id);
    // Every boss still gets a row, so the log can render the whole raid.
    expect(result.bosses).toHaveLength(CRYPT.bosses.length);
    expect(result.bosses[1].defeated).toBe(false);
    expect(result.bosses[1].wipes).toBe(0);
  });

  it('never spends more than the raid attempt budget', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const result = runRaid(characterWith(2, 1), CRYPT, new Rng(seed));
      expect(result.attemptsUsed).toBeLessThanOrEqual(CRYPT.attempts);
    }
  });

  it('charges the raid cost win or lose', () => {
    expect(runRaid(characterWith(100_000, 0), CRYPT, new Rng(1)).minutesSpent).toBe(CRYPT.costMinutes);
    expect(runRaid(characterWith(1, 0), CRYPT, new Rng(1)).minutesSpent).toBe(CRYPT.costMinutes);
  });

  it('drops loot only from the raid table', () => {
    const allowed = new Set(CRYPT.loot.map((entry) => entry.itemKey));
    for (let seed = 1; seed <= 50; seed++) {
      for (const key of runRaid(characterWith(100_000, 0), CRYPT, new Rng(seed)).loot) {
        expect(allowed.has(key)).toBe(true);
      }
    }
  });

  it('drops nothing when no boss falls', () => {
    const result = runRaid(characterWith(1, 0), CRYPT, new Rng(3));
    expect(result.bosses.some((boss) => boss.defeated)).toBe(false);
    expect(result.loot).toEqual([]);
  });

  it('terminates on every shipped raid even at the pull floor', () => {
    // Minimum pull chance against maximum soak is the worst case for the loop.
    for (const raid of RAIDS) {
      for (let seed = 1; seed <= 25; seed++) {
        const result = runRaid(characterWith(0, 10_000_000), raid, new Rng(seed));
        for (const boss of result.bosses) {
          expect(boss.wipes).toBeLessThanOrEqual(MAX_PULLS_PER_BOSS);
        }
      }
    }
  });
});

describe('shipped raid content', () => {
  it('has unique ids and a sane difficulty ramp', () => {
    const ids = RAIDS.map((raid) => raid.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (let i = 1; i < RAIDS.length; i++) {
      expect(RAIDS[i].minLevel).toBeGreaterThan(RAIDS[i - 1].minLevel);
      expect(RAIDS[i].costMinutes).toBeGreaterThan(RAIDS[i - 1].costMinutes);
    }
  });

  it('gates every raid at a level the focus curve can actually reach', () => {
    for (const raid of RAIDS) {
      expect(raid.minLevel).toBeLessThanOrEqual(characterFor(1_000_000, 0).level);
      expect(raid.bosses.length).toBeGreaterThan(0);
      expect(raid.attempts).toBeGreaterThan(0);
    }
  });

  it('keeps every loot chance a real probability', () => {
    for (const raid of RAIDS) {
      for (const entry of raid.loot) {
        expect(entry.chance).toBeGreaterThan(0);
        expect(entry.chance).toBeLessThanOrEqual(1);
      }
    }
  });

  it('resolves by id and misses unknown ids', () => {
    expect(raidById('hollow_crypt')?.id).toBe('hollow_crypt');
    expect(raidById('not_a_raid')).toBeUndefined();
  });
});
