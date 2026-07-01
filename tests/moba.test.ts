import { describe, it, expect } from 'vitest';
import {
  assignMobaTeams, mobaBotFill, mobaTeamForZ, mobaEnemyTeam, mobaEnemyCore, mobaHeroSpawn,
  mobaMinionSpawn, mobaRespawnSeconds, mobaWaveComposition, mobaCoreVulnerable, mobaWinner,
  mobaHeroKillGold, MOBA_LANE, MOBA_RESPAWN_MIN, MOBA_RESPAWN_MAX,
  MOBA_MINION_MELEE_ID, MOBA_MINION_RANGED_ID,
} from '../src/sim/moba';

describe('MOBA pure core: team assignment', () => {
  it('splits players into two balanced sides in input order', () => {
    const t = assignMobaTeams([10, 20, 30, 40], 5);
    expect(t.get(10)).toBe('A');
    expect(t.get(20)).toBe('B');
    expect(t.get(30)).toBe('A');
    expect(t.get(40)).toBe('B');
  });

  it('caps each side at teamSize and drops the overflow', () => {
    const t = assignMobaTeams([1, 2, 3, 4, 5, 6], 2); // cap 2 per side => 4 seated
    const a = [...t.entries()].filter(([, s]) => s === 'A').map(([p]) => p);
    const b = [...t.entries()].filter(([, s]) => s === 'B').map(([p]) => p);
    expect(a.length).toBe(2);
    expect(b.length).toBe(2);
    expect(t.has(5)).toBe(false);
    expect(t.has(6)).toBe(false);
  });

  it('clamps teamSize to 1..5', () => {
    expect(assignMobaTeams([1, 2], 0).size).toBe(2); // clamps to 1 per side => both seated
    const big = assignMobaTeams([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], 99); // clamps to 5 per side
    expect(big.size).toBe(10);
  });

  it('is deterministic (same input, same result)', () => {
    const a = assignMobaTeams([7, 8, 9], 5);
    const b = assignMobaTeams([7, 8, 9], 5);
    expect([...a.entries()]).toEqual([...b.entries()]);
  });

  it('computes bot fill to reach teamSize per side', () => {
    expect(mobaBotFill(1, 0, 5)).toEqual({ A: 4, B: 5 });
    expect(mobaBotFill(5, 5, 5)).toEqual({ A: 0, B: 0 });
    expect(mobaBotFill(7, 2, 5)).toEqual({ A: 0, B: 3 }); // never negative
  });
});

describe('MOBA pure core: lane geometry', () => {
  it('assigns team by which half of the lane a z sits in', () => {
    expect(mobaTeamForZ(MOBA_LANE.coreA.z)).toBe('A');
    expect(mobaTeamForZ(MOBA_LANE.coreB.z)).toBe('B');
    expect(mobaTeamForZ(MOBA_LANE.midZ - 1)).toBe('A');
    expect(mobaTeamForZ(MOBA_LANE.midZ + 1)).toBe('B');
  });

  it('points each team at the enemy core', () => {
    expect(mobaEnemyTeam('A')).toBe('B');
    expect(mobaEnemyCore('A')).toEqual(MOBA_LANE.coreB);
    expect(mobaEnemyCore('B')).toEqual(MOBA_LANE.coreA);
  });

  it('spawns heroes and minions on the correct side', () => {
    expect(mobaHeroSpawn('A')).toEqual(MOBA_LANE.coreA);
    expect(mobaHeroSpawn('B')).toEqual(MOBA_LANE.coreB);
    expect(mobaTeamForZ(mobaMinionSpawn('A').z)).toBe('A');
    expect(mobaTeamForZ(mobaMinionSpawn('B').z)).toBe('B');
  });

  it('lays team A structures below mid and team B above it', () => {
    for (const p of [MOBA_LANE.coreA, ...MOBA_LANE.towersA]) expect(p.z).toBeLessThan(MOBA_LANE.midZ);
    for (const p of [MOBA_LANE.coreB, ...MOBA_LANE.towersB]) expect(p.z).toBeGreaterThan(MOBA_LANE.midZ);
  });
});

describe('MOBA pure core: respawn curve', () => {
  it('is non-decreasing in level and clamped', () => {
    let prev = -1;
    for (let lvl = 1; lvl <= 30; lvl++) {
      const s = mobaRespawnSeconds(lvl);
      expect(s).toBeGreaterThanOrEqual(MOBA_RESPAWN_MIN);
      expect(s).toBeLessThanOrEqual(MOBA_RESPAWN_MAX);
      expect(s).toBeGreaterThanOrEqual(prev);
      prev = s;
    }
  });

  it('floors at the minimum for low levels', () => {
    expect(mobaRespawnSeconds(0)).toBe(MOBA_RESPAWN_MIN);
    expect(mobaRespawnSeconds(1)).toBeGreaterThanOrEqual(MOBA_RESPAWN_MIN);
  });
});

describe('MOBA pure core: wave composition', () => {
  it('always includes melee then a ranged caster', () => {
    const w = mobaWaveComposition(1);
    expect(w.filter((m) => m === MOBA_MINION_MELEE_ID).length).toBe(3);
    expect(w.filter((m) => m === MOBA_MINION_RANGED_ID).length).toBe(1);
  });

  it('escalates melee count every third wave', () => {
    expect(mobaWaveComposition(1).filter((m) => m === MOBA_MINION_MELEE_ID).length).toBe(3);
    expect(mobaWaveComposition(3).filter((m) => m === MOBA_MINION_MELEE_ID).length).toBe(4);
    expect(mobaWaveComposition(6).filter((m) => m === MOBA_MINION_MELEE_ID).length).toBe(5);
  });
});

describe('MOBA pure core: objectives + bounties', () => {
  it('core is vulnerable only once all towers are down', () => {
    expect(mobaCoreVulnerable(2)).toBe(false);
    expect(mobaCoreVulnerable(1)).toBe(false);
    expect(mobaCoreVulnerable(0)).toBe(true);
  });

  it('declares a winner only when exactly one core has fallen', () => {
    expect(mobaWinner(true, true)).toBeNull();
    expect(mobaWinner(true, false)).toBe('A');
    expect(mobaWinner(false, true)).toBe('B');
    expect(mobaWinner(false, false)).toBeNull(); // simultaneous fall: no winner
  });

  it('scales hero-kill gold with victim level', () => {
    expect(mobaHeroKillGold(0)).toBeLessThan(mobaHeroKillGold(15));
    expect(mobaHeroKillGold(-5)).toBe(mobaHeroKillGold(0)); // never negative contribution
  });
});
