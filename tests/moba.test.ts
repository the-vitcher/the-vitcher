import { describe, it, expect } from 'vitest';
import {
  assignMobaTeams, mobaBotFill, mobaTeamForPos, mobaLaneForPos, mobaEnemyTeam, mobaEnemyCore, mobaHeroSpawn,
  mobaMinionSpawn, mobaMinionMarchTarget, mobaTowerPoints, mobaLanePath, mobaBaseAt, mobaSurfaceAt,
  polylineLength, projectOntoPolyline, distToLane, mobaRespawnSeconds, mobaWaveComposition,
  mobaCoreVulnerable, mobaWinner, mobaHeroKillGold, mobaScaleEffectForRank,
  MOBA_MAP, MOBA_JUNGLE_TREES, MOBA_JUNGLE_CAMPS, MOBA_TOWER_FRACS,
  MOBA_RESPAWN_MIN, MOBA_RESPAWN_MAX, MOBA_MINION_MELEE_ID, MOBA_MINION_RANGED_ID,
  type MobaLaneIndex, type MobaTeam,
} from '../src/sim/moba';
import { RUN_SPEED } from '../src/sim/types';

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

describe('MOBA map: Dota-scale locks (user-specified numbers)', () => {
  it('total area is 15,000-18,000 square meters', () => {
    const side = MOBA_MAP.half * 2;
    expect(side * side).toBeGreaterThanOrEqual(15000);
    expect(side * side).toBeLessThanOrEqual(18000);
  });

  it('mid lane walks ~225 m fountain to fountain (205-235 window)', () => {
    const len = polylineLength(mobaLanePath('A', 1));
    expect(len).toBeGreaterThanOrEqual(205);
    expect(len).toBeLessThanOrEqual(235);
    // and that is a real MOBA walk time at run speed
    const seconds = len / RUN_SPEED;
    expect(seconds).toBeGreaterThanOrEqual(28);
    expect(seconds).toBeLessThanOrEqual(35);
  });

  it('top and bot lanes are the long way around (230-280 m)', () => {
    for (const lane of [0, 2] as MobaLaneIndex[]) {
      const len = polylineLength(mobaLanePath('A', lane));
      expect(len).toBeGreaterThanOrEqual(230);
      expect(len).toBeLessThanOrEqual(280);
    }
  });

  it('every lane waypoint, tower, spawn, and camp sits inside the map', () => {
    const inMap = (p: { x: number; z: number }) =>
      Math.abs(p.x) <= MOBA_MAP.half && Math.abs(p.z) <= MOBA_MAP.half;
    for (const lane of LANES) for (const p of mobaLanePath('A', lane)) expect(inMap(p)).toBe(true);
    for (const team of TEAMS) {
      expect(inMap(mobaHeroSpawn(team))).toBe(true);
      for (const lane of LANES) {
        expect(inMap(mobaMinionSpawn(team, lane))).toBe(true);
        for (const p of mobaTowerPoints(team, lane)) expect(inMap(p)).toBe(true);
      }
    }
    for (const camp of MOBA_JUNGLE_CAMPS) expect(inMap(camp)).toBe(true);
    for (const tree of MOBA_JUNGLE_TREES) expect(inMap(tree)).toBe(true);
  });
});

describe('MOBA map: diagonal-square geometry', () => {
  it('splits teams across the river diagonal (SW = A, NE = B)', () => {
    expect(mobaTeamForPos(MOBA_MAP.coreA.x, MOBA_MAP.coreA.z)).toBe('A');
    expect(mobaTeamForPos(MOBA_MAP.coreB.x, MOBA_MAP.coreB.z)).toBe('B');
    expect(mobaTeamForPos(-1, 0)).toBe('A');
    expect(mobaTeamForPos(1, 0)).toBe('B');
    expect(mobaTeamForPos(-30, 20)).toBe('A'); // NW jungle, A side of the river
    expect(mobaTeamForPos(30, -20)).toBe('B'); // SE jungle, B side
  });

  it('resolves the nearest lane from a position', () => {
    // points clearly nearest to each centreline
    expect(mobaLaneForPos(-60, 0)).toBe(0); // west edge -> top
    expect(mobaLaneForPos(0, 60)).toBe(0); // north edge -> top
    expect(mobaLaneForPos(0, 2)).toBe(1); // map center -> mid
    expect(mobaLaneForPos(0, -60)).toBe(2); // south edge -> bot
    expect(mobaLaneForPos(60, 0)).toBe(2); // east edge -> bot
  });

  it('points each team at the enemy core', () => {
    expect(mobaEnemyTeam('A')).toBe('B');
    expect(mobaEnemyCore('A')).toEqual(MOBA_MAP.coreB);
    expect(mobaEnemyCore('B')).toEqual(MOBA_MAP.coreA);
  });

  it('fountains and shops sit inside their own base plazas', () => {
    for (const team of TEAMS) {
      const f = mobaHeroSpawn(team);
      expect(mobaBaseAt(f.x, f.z)).toBe(team);
      expect(mobaTeamForPos(f.x, f.z)).toBe(team);
    }
    expect(mobaBaseAt(MOBA_MAP.shopA.x, MOBA_MAP.shopA.z)).toBe('A');
    expect(mobaBaseAt(MOBA_MAP.shopB.x, MOBA_MAP.shopB.z)).toBe('B');
  });

  it('spawns minions on their own half, on their own lane', () => {
    for (const team of TEAMS) {
      for (const lane of LANES) {
        const s = mobaMinionSpawn(team, lane);
        expect(mobaTeamForPos(s.x, s.z)).toBe(team);
        expect(distToLane(lane, s.x, s.z)).toBeLessThanOrEqual(1);
      }
    }
  });

  it('places three towers per lane per team, on the owning half, on the lane', () => {
    expect(MOBA_TOWER_FRACS.length).toBe(3);
    for (const team of TEAMS) {
      for (const lane of LANES) {
        const points = mobaTowerPoints(team, lane);
        expect(points.length).toBe(3);
        for (const p of points) {
          expect(mobaTeamForPos(p.x, p.z)).toBe(team);
          expect(distToLane(lane, p.x, p.z)).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it('marches minions forward along their lane polyline, ending at the enemy core', () => {
    for (const team of TEAMS) {
      for (const lane of LANES) {
        const path = mobaLanePath(team, lane);
        const spawn = mobaMinionSpawn(team, lane);
        // from spawn, the target is strictly further along the path
        const t1 = mobaMinionMarchTarget(team, lane, spawn.x, spawn.z);
        const before = projectOntoPolyline(path, spawn.x, spawn.z).along;
        const after = projectOntoPolyline(path, t1.x, t1.z).along;
        expect(after).toBeGreaterThan(before);
        // walking the whole lane converges on the enemy core (bounded steps)
        let pos = { ...spawn };
        const core = mobaEnemyCore(team);
        let steps = 0;
        while (Math.hypot(pos.x - core.x, pos.z - core.z) > 1 && steps < 60) {
          pos = mobaMinionMarchTarget(team, lane, pos.x, pos.z);
          steps++;
        }
        expect(Math.hypot(pos.x - core.x, pos.z - core.z)).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe('MOBA map: river, jungle, and camps', () => {
  it('classifies the river band, lanes, bases, and open field', () => {
    expect(mobaSurfaceAt(mobaHeroSpawn('A').x, mobaHeroSpawn('A').z)).toBe('base');
    expect(mobaSurfaceAt(0, 0)).toBe('lane'); // mid bridges the river at center
    expect(mobaSurfaceAt(-30, 30)).toBe('river'); // NW anti-diagonal, off-lane
    expect(mobaSurfaceAt(30, -30)).toBe('river');
    expect(mobaSurfaceAt(-42, 2)).toBe('field'); // a jungle camp clearing
  });

  it('keeps jungle trees off lanes, river, bases, and camps', () => {
    expect(MOBA_JUNGLE_TREES.length).toBeGreaterThan(20); // there IS a jungle
    for (const tree of MOBA_JUNGLE_TREES) {
      for (const lane of LANES) expect(distToLane(lane, tree.x, tree.z)).toBeGreaterThanOrEqual(8);
      expect(Math.abs(tree.x + tree.z)).toBeGreaterThan(MOBA_MAP.riverBand);
      expect(mobaBaseAt(tree.x, tree.z)).toBeNull();
      for (const camp of MOBA_JUNGLE_CAMPS) {
        expect(Math.hypot(tree.x - camp.x, tree.z - camp.z)).toBeGreaterThanOrEqual(6);
      }
    }
  });

  it('trees are deterministic (same list on every evaluation)', () => {
    const again = [...MOBA_JUNGLE_TREES];
    expect(again).toEqual([...MOBA_JUNGLE_TREES]);
  });

  it('camps come in mirrored pairs, three per side, off the lanes and river', () => {
    expect(MOBA_JUNGLE_CAMPS.length).toBe(6);
    const aSide = MOBA_JUNGLE_CAMPS.filter((c) => mobaTeamForPos(c.x, c.z) === 'A');
    expect(aSide.length).toBe(3);
    for (const camp of MOBA_JUNGLE_CAMPS) {
      // point-mirrored twin exists (team fairness)
      expect(MOBA_JUNGLE_CAMPS.some((o) => o.x === -camp.x && o.z === -camp.z)).toBe(true);
      for (const lane of LANES) expect(distToLane(lane, camp.x, camp.z)).toBeGreaterThanOrEqual(6);
      expect(Math.abs(camp.x + camp.z)).toBeGreaterThan(MOBA_MAP.riverBand);
      expect(camp.mobs.length).toBeGreaterThan(0);
    }
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

describe('MOBA pure core: ability rank scaling', () => {
  it('scales damage magnitudes up per rank without mutating the source effect', () => {
    const src = { type: 'directDamage', min: 40, max: 60 } as const;
    const r1 = mobaScaleEffectForRank(src, 1) as any;
    const r2 = mobaScaleEffectForRank(src, 2) as any;
    const r3 = mobaScaleEffectForRank(src, 3) as any;
    expect(r1.min).toBeLessThan(r2.min);
    expect(r2.min).toBe(40); // authored numbers ARE rank 2
    expect(r3.min).toBeGreaterThan(r2.min);
    expect(src.min).toBe(40); // source untouched
  });

  it('scales hard-CC durations on the gentler CC curve', () => {
    const stun = { type: 'stun', duration: 2 } as const;
    expect((mobaScaleEffectForRank(stun, 1) as any).duration).toBe(2);
    expect((mobaScaleEffectForRank(stun, 2) as any).duration).toBe(2.5);
    expect((mobaScaleEffectForRank(stun, 3) as any).duration).toBe(3);
  });

  it('leaves rank-invariant effects untouched (charge, slows, self-buffs)', () => {
    const charge = { type: 'charge' } as const;
    expect(mobaScaleEffectForRank(charge, 3)).toEqual(charge);
    const slow = { type: 'slow', mult: 0.5, duration: 4 } as const;
    expect(mobaScaleEffectForRank(slow, 3)).toEqual(slow);
  });

  it('clamps out-of-range ranks into 1..3', () => {
    const src = { type: 'heal', min: 100, max: 100 } as const;
    expect(mobaScaleEffectForRank(src, 0)).toEqual(mobaScaleEffectForRank(src, 1));
    expect(mobaScaleEffectForRank(src, 9)).toEqual(mobaScaleEffectForRank(src, 3));
  });
});

describe('MOBA pure core: objectives + bounties', () => {
  it('core opens up only once one lane of towers is fully down', () => {
    expect(mobaCoreVulnerable([3, 3, 3])).toBe(false);
    expect(mobaCoreVulnerable([1, 1, 1])).toBe(false);
    expect(mobaCoreVulnerable([3, 0, 3])).toBe(true); // mid lane cleared
    expect(mobaCoreVulnerable([0, 3, 3])).toBe(true); // top lane cleared
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
