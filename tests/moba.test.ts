import { describe, it, expect } from 'vitest';
import {
  assignMobaTeams, mobaBotFill, mobaTeamForZ, mobaLaneForX, mobaEnemyTeam, mobaEnemyCore, mobaHeroSpawn,
  mobaMinionSpawn, mobaMinionMarchTarget, mobaTowerPoints, mobaRespawnSeconds, mobaWaveComposition,
  mobaCoreVulnerable, mobaWinner, mobaHeroKillGold, MOBA_MAP, MOBA_LANE_XS, MOBA_RESPAWN_MIN,
  MOBA_RESPAWN_MAX, MOBA_MINION_MELEE_ID, MOBA_MINION_RANGED_ID, type MobaLaneIndex, type MobaTeam,
} from '../src/sim/moba';

const LANES: MobaLaneIndex[] = [0, 1, 2];
const TEAMS: MobaTeam[] = ['A', 'B'];

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

describe('MOBA pure core: three-lane geometry', () => {
  it('assigns team by which half of the map a z sits in', () => {
    expect(mobaTeamForZ(MOBA_MAP.coreA.z)).toBe('A');
    expect(mobaTeamForZ(MOBA_MAP.coreB.z)).toBe('B');
    expect(mobaTeamForZ(MOBA_MAP.midZ - 1)).toBe('A');
    expect(mobaTeamForZ(MOBA_MAP.midZ + 1)).toBe('B');
  });

  it('resolves the nearest lane from an x position', () => {
    for (const lane of LANES) expect(mobaLaneForX(MOBA_LANE_XS[lane])).toBe(lane);
    expect(mobaLaneForX(-60)).toBe(0);
    expect(mobaLaneForX(-10)).toBe(1);
    expect(mobaLaneForX(60)).toBe(2);
  });

  it('points each team at the enemy core', () => {
    expect(mobaEnemyTeam('A')).toBe('B');
    expect(mobaEnemyCore('A')).toEqual(MOBA_MAP.coreB);
    expect(mobaEnemyCore('B')).toEqual(MOBA_MAP.coreA);
  });

  it('spawns heroes behind their own core and minions on their own half, per lane', () => {
    expect(mobaTeamForZ(mobaHeroSpawn('A').z)).toBe('A');
    expect(mobaTeamForZ(mobaHeroSpawn('B').z)).toBe('B');
    for (const team of TEAMS) {
      for (const lane of LANES) {
        const s = mobaMinionSpawn(team, lane);
        expect(s.x).toBe(MOBA_LANE_XS[lane]);
        expect(mobaTeamForZ(s.z)).toBe(team);
      }
    }
  });

  it('places two towers per lane per team, on the owning half, at the lane x', () => {
    for (const team of TEAMS) {
      for (const lane of LANES) {
        const points = mobaTowerPoints(team, lane);
        expect(points.length).toBe(2);
        for (const p of points) {
          expect(p.x).toBe(MOBA_LANE_XS[lane]);
          expect(mobaTeamForZ(p.z)).toBe(team);
        }
      }
    }
  });

  it('marches minions down their lane, then swings them into the enemy core', () => {
    // A team-A top-laner far from the enemy end holds the lane centreline...
    const early = mobaMinionMarchTarget('A', 0, 40);
    expect(early.x).toBe(MOBA_LANE_XS[0]);
    expect(early.z).toBe(MOBA_MAP.laneTurnZB);
    // ...and swings toward the core once past the turn point.
    const late = mobaMinionMarchTarget('A', 0, MOBA_MAP.laneTurnZB + 1);
    expect(late).toEqual(MOBA_MAP.coreB);
    // Mirror for team B.
    const earlyB = mobaMinionMarchTarget('B', 2, 100);
    expect(earlyB.x).toBe(MOBA_LANE_XS[2]);
    expect(earlyB.z).toBe(MOBA_MAP.laneTurnZA);
    expect(mobaMinionMarchTarget('B', 2, MOBA_MAP.laneTurnZA - 1)).toEqual(MOBA_MAP.coreA);
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
  it('core opens up only once one lane of towers is fully down', () => {
    expect(mobaCoreVulnerable([2, 2, 2])).toBe(false);
    expect(mobaCoreVulnerable([1, 1, 1])).toBe(false);
    expect(mobaCoreVulnerable([2, 0, 2])).toBe(true); // mid lane cleared
    expect(mobaCoreVulnerable([0, 2, 2])).toBe(true); // top lane cleared
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
