import { describe, it, expect } from 'vitest';
import {
  assignMobaTeams, mobaBotFill, mobaTeamForPos, mobaLaneForPos, mobaEnemyTeam, mobaEnemyCore, mobaHeroSpawn,
  mobaMinionSpawn, mobaMinionMarchTarget, mobaTowerPoints, mobaLanePath, mobaBaseAt, mobaSurfaceAt,
  polylineLength, projectOntoPolyline, distToLane, mobaRespawnSeconds, mobaWaveComposition,
  mobaCoreVulnerable, mobaWinner, mobaHeroKillGold, mobaScaleEffectForRank,
  mobaHeightAt, mobaFordAlongDist, pointAlongPolyline,
  MOBA_MAP, MOBA_JUNGLE_TREES, MOBA_JUNGLE_CAMPS, MOBA_TOWER_FRACS,
  MOBA_RIVER, MOBA_BOSS_PIT, MOBA_RUNE_POINTS, MOBA_PLATEAUS, MOBA_RAMPS,
  MOBA_LANE_ENTRANCES, MOBA_WALL_SEGMENTS,
  MOBA_RESPAWN_MIN, MOBA_RESPAWN_MAX, MOBA_MINION_MELEE_ID, MOBA_MINION_RANGED_ID,
  type MobaLaneIndex, type MobaTeam,
} from '../src/sim/moba';
import { RUN_SPEED } from '../src/sim/types';
import { PLAYER_MAX_CLIMB_SLOPE } from '../src/sim/pathfind';

// Max uphill rise/run along a straight transect, sampled finely (the movement
// code checks per-step slope, so a fine sample is the conservative measure).
function maxUphillSlope(x1: number, z1: number, x2: number, z2: number, step = 0.25): number {
  const len = Math.hypot(x2 - x1, z2 - z1);
  const n = Math.max(2, Math.ceil(len / step));
  let worst = 0;
  let prev = mobaHeightAt(x1, z1);
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    const h = mobaHeightAt(x1 + (x2 - x1) * t, z1 + (z2 - z1) * t);
    const rise = h - prev;
    const run = len / n;
    if (rise > 0) worst = Math.max(worst, rise / run);
    prev = h;
  }
  return worst;
}

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

describe('MOBA map v2: scale locks (3x area, ~30 s fountain to lane apex)', () => {
  it('total area is 3x the v1 map (50,000-58,000 square meters)', () => {
    const side = MOBA_MAP.half * 2;
    expect(side * side).toBeGreaterThanOrEqual(50000);
    expect(side * side).toBeLessThanOrEqual(58000);
  });

  it('fountain to the top-lane apex walks ~30 s at run speed (195-235 m)', () => {
    const path = mobaLanePath('A', 0);
    // apex = the vertex nearest the NW map corner (the far end of the lane's own half)
    const corner = { x: -MOBA_MAP.half, z: MOBA_MAP.half };
    let apexArc = 0;
    let best = Infinity;
    let walked = 0;
    for (let i = 0; i < path.length; i++) {
      if (i > 0) walked += Math.hypot(path[i].x - path[i - 1].x, path[i].z - path[i - 1].z);
      const d = Math.hypot(path[i].x - corner.x, path[i].z - corner.z);
      if (d < best) { best = d; apexArc = walked; }
    }
    expect(apexArc).toBeGreaterThanOrEqual(195);
    expect(apexArc).toBeLessThanOrEqual(235);
    const seconds = apexArc / RUN_SPEED;
    expect(seconds).toBeGreaterThanOrEqual(27);
    expect(seconds).toBeLessThanOrEqual(34);
  });

  it('mid is the short lane (300-360 m fountain to fountain); top/bot the long way (380-430 m)', () => {
    const mid = polylineLength(mobaLanePath('A', 1));
    expect(mid).toBeGreaterThanOrEqual(300);
    expect(mid).toBeLessThanOrEqual(360);
    for (const lane of [0, 2] as MobaLaneIndex[]) {
      const len = polylineLength(mobaLanePath('A', lane));
      expect(len).toBeGreaterThanOrEqual(380);
      expect(len).toBeLessThanOrEqual(430);
      expect(len).toBeGreaterThan(mid);
    }
  });

  it('every lane waypoint, tower, spawn, camp, ford, rune, and the pit sit inside the map', () => {
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
    for (const f of MOBA_RIVER.fords) expect(inMap(f)).toBe(true);
    for (const r of MOBA_RUNE_POINTS) expect(inMap(r)).toBe(true);
    expect(inMap(MOBA_BOSS_PIT)).toBe(true);
    for (const w of MOBA_WALL_SEGMENTS) {
      expect(inMap({ x: w.x1, z: w.z1 })).toBe(true);
      expect(inMap({ x: w.x2, z: w.z2 })).toBe(true);
    }
  });
});

describe('MOBA map v2: diagonal-square geometry', () => {
  it('splits teams across the river diagonal (SW = A, NE = B)', () => {
    expect(mobaTeamForPos(MOBA_MAP.coreA.x, MOBA_MAP.coreA.z)).toBe('A');
    expect(mobaTeamForPos(MOBA_MAP.coreB.x, MOBA_MAP.coreB.z)).toBe('B');
    expect(mobaTeamForPos(-1, 0)).toBe('A');
    expect(mobaTeamForPos(1, 0)).toBe('B');
    expect(mobaTeamForPos(-30, 20)).toBe('A');
    expect(mobaTeamForPos(30, -20)).toBe('B');
  });

  it('resolves the nearest lane from a position', () => {
    expect(mobaLaneForPos(-100, 0)).toBe(0); // west edge -> top
    expect(mobaLaneForPos(0, 100)).toBe(0); // north edge -> top
    expect(mobaLaneForPos(0, 2)).toBe(1); // map center -> mid
    expect(mobaLaneForPos(0, -100)).toBe(2); // south edge -> bot
    expect(mobaLaneForPos(100, 0)).toBe(2); // east edge -> bot
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
        const t1 = mobaMinionMarchTarget(team, lane, spawn.x, spawn.z);
        const before = projectOntoPolyline(path, spawn.x, spawn.z).along;
        const after = projectOntoPolyline(path, t1.x, t1.z).along;
        expect(after).toBeGreaterThan(before);
        let pos = { ...spawn };
        const core = mobaEnemyCore(team);
        let steps = 0;
        while (Math.hypot(pos.x - core.x, pos.z - core.z) > 1 && steps < 80) {
          pos = mobaMinionMarchTarget(team, lane, pos.x, pos.z);
          steps++;
        }
        expect(Math.hypot(pos.x - core.x, pos.z - core.z)).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe('MOBA map v2: heightfield (cliffs block, ramps and fords walk)', () => {
  it('the river banks are cliffs away from the fords (steeper than the climb limit)', () => {
    // transect across the channel at a spot far from every ford
    const probes = [{ x: -66, z: 66 }, { x: 24, z: -24 }];
    for (const p of probes) {
      for (const f of MOBA_RIVER.fords) {
        expect(Math.abs(mobaFordAlongDist(f, p.x, p.z))).toBeGreaterThan(f.r + 2);
      }
      // climb OUT of the bed toward the field, perpendicular to the river
      const d = Math.SQRT1_2;
      const slope = maxUphillSlope(p.x, p.z, p.x + 20 * d, p.z + 20 * d);
      expect(slope).toBeGreaterThan(PLAYER_MAX_CLIMB_SLOPE);
    }
  });

  it('every lane crosses the river on a walkable ford', () => {
    for (const team of TEAMS) {
      for (const lane of LANES) {
        const path = mobaLanePath(team, lane);
        const len = polylineLength(path);
        // sample the march finely across the whole lane: never a wall
        let prevP = pointAlongPolyline(path, 0);
        let worst = 0;
        for (let arc = 1; arc <= len; arc += 1) {
          const p = pointAlongPolyline(path, arc);
          const slope = maxUphillSlope(prevP.x, prevP.z, p.x, p.z);
          worst = Math.max(worst, slope);
          prevP = p;
        }
        expect(worst).toBeLessThanOrEqual(1.2);
      }
    }
  });

  it('hidden fords are walkable crossings; the open river bank is not', () => {
    for (const r of MOBA_RUNE_POINTS) {
      const d = Math.SQRT1_2;
      const slope = maxUphillSlope(r.x - 16 * d, r.z - 16 * d, r.x + 16 * d, r.z + 16 * d);
      expect(slope).toBeLessThanOrEqual(1.2);
      expect(mobaSurfaceAt(r.x, r.z)).toBe('ford');
    }
  });

  it('plateau edges are cliffs; their ramps are the walkable ways up', () => {
    for (const pl of MOBA_PLATEAUS) {
      // probe from the direction facing away from BOTH ramps (their mounds are
      // the intended ways up, so the cliff test must avoid them)
      const ramps = MOBA_RAMPS.filter((r) => r.x1 === pl.x && r.z1 === pl.z);
      expect(ramps.length).toBe(2);
      let ax = 0, az = 0;
      for (const r of ramps) {
        const dl = Math.hypot(r.x2 - r.x1, r.z2 - r.z1) || 1;
        ax -= (r.x2 - r.x1) / dl;
        az -= (r.z2 - r.z1) / dl;
      }
      const al = Math.hypot(ax, az) || 1;
      const away = { x: pl.x + (ax / al) * (pl.r + 6), z: pl.z + (az / al) * (pl.r + 6) };
      const slope = maxUphillSlope(away.x, away.z, pl.x, pl.z);
      expect(slope).toBeGreaterThan(PLAYER_MAX_CLIMB_SLOPE);
      expect(mobaHeightAt(pl.x, pl.z)).toBeCloseTo(pl.h, 3);
    }
    for (const ramp of MOBA_RAMPS) {
      // walk the ramp axis from beyond its foot up to its head: always legal
      const dx = ramp.x2 - ramp.x1, dz = ramp.z2 - ramp.z1;
      const dl = Math.hypot(dx, dz);
      const footX = ramp.x2 + (dx / dl) * (ramp.r + ramp.falloff + 2);
      const footZ = ramp.z2 + (dz / dl) * (ramp.r + ramp.falloff + 2);
      const slope = maxUphillSlope(footX, footZ, ramp.x1, ramp.z1);
      expect(slope).toBeLessThanOrEqual(1.2);
    }
  });

  it('the boss pit is a bowl with sheer rims and two walkable mouths', () => {
    const pit = MOBA_BOSS_PIT;
    expect(mobaHeightAt(pit.x, pit.z)).toBeLessThanOrEqual(pit.floor + 0.05);
    expect(mobaSurfaceAt(pit.x, pit.z)).toBe('pit');
    // climbing out anywhere between the mouths is blocked by the rim wall
    // (probe across the river, and along it at 90 degrees to the mouth axis)
    for (const dir of [{ x: Math.SQRT1_2, z: Math.SQRT1_2 }, { x: -Math.SQRT1_2, z: -Math.SQRT1_2 }]) {
      const rimSlope = maxUphillSlope(pit.x, pit.z, pit.x + dir.x * (pit.r + 3), pit.z + dir.z * (pit.r + 3));
      expect(rimSlope).toBeGreaterThan(PLAYER_MAX_CLIMB_SLOPE);
    }
    // exiting through each mouth onto the riverbed is walkable
    for (const m of pit.mouths) {
      const dx = m.x - pit.x, dz = m.z - pit.z;
      const dl = Math.hypot(dx, dz);
      const outX = pit.x + (dx / dl) * (pit.r + 4);
      const outZ = pit.z + (dz / dl) * (pit.r + 4);
      const slope = maxUphillSlope(pit.x, pit.z, outX, outZ);
      expect(slope).toBeLessThanOrEqual(1.2);
    }
  });

  it('gameplay points stand on sane ground (fountains, shops, camps, towers, runes)', () => {
    for (const team of TEAMS) {
      const f = mobaHeroSpawn(team);
      expect(Math.abs(mobaHeightAt(f.x, f.z))).toBeLessThanOrEqual(0.05);
      for (const lane of LANES) {
        for (const p of mobaTowerPoints(team, lane)) {
          expect(Math.abs(mobaHeightAt(p.x, p.z))).toBeLessThanOrEqual(2.2);
        }
      }
    }
    for (const camp of MOBA_JUNGLE_CAMPS) {
      expect(Math.abs(mobaHeightAt(camp.x, camp.z))).toBeLessThanOrEqual(0.05);
    }
    for (const r of MOBA_RUNE_POINTS) {
      const h = mobaHeightAt(r.x, r.z);
      expect(h).toBeGreaterThan(MOBA_RIVER.bedDepth);
      expect(h).toBeLessThanOrEqual(0);
    }
  });

  it('the heightfield is deterministic and bounded', () => {
    for (let x = -MOBA_MAP.half; x <= MOBA_MAP.half; x += 7) {
      for (let z = -MOBA_MAP.half; z <= MOBA_MAP.half; z += 7) {
        const h = mobaHeightAt(x, z);
        expect(h).toBe(mobaHeightAt(x, z));
        expect(h).toBeGreaterThanOrEqual(-2.6);
        expect(h).toBeLessThanOrEqual(3.1);
      }
    }
  });
});

describe('MOBA map v2: walls and lane entrances', () => {
  it('each lane offers 3-5 authored jungle entrances (mixed kinds)', () => {
    for (const lane of LANES) {
      const gaps = MOBA_LANE_ENTRANCES.filter((e) => e.lane === lane);
      expect(gaps.length).toBeGreaterThanOrEqual(3);
      expect(gaps.length).toBeLessThanOrEqual(5);
      expect(new Set(gaps.map((g) => g.kind)).size).toBeGreaterThanOrEqual(2);
      for (const g of gaps) {
        expect(g.frac).toBeGreaterThan(0.1);
        expect(g.frac).toBeLessThan(0.9);
        expect(g.width).toBeGreaterThanOrEqual(5);
      }
    }
  });

  it('builds wall lines along the lanes, broken at entrances, the river, and bases', () => {
    expect(MOBA_WALL_SEGMENTS.length).toBeGreaterThan(50);
    for (const w of MOBA_WALL_SEGMENTS) {
      for (const end of [{ x: w.x1, z: w.z1 }, { x: w.x2, z: w.z2 }]) {
        expect(Math.abs(end.x + end.z)).toBeGreaterThan(MOBA_MAP.riverBand + 2);
        expect(mobaBaseAt(end.x, end.z)).toBeNull();
      }
    }
  });

  it('every authored entrance is an actual gap in the wall line', () => {
    for (const e of MOBA_LANE_ENTRANCES) {
      const path = mobaLanePath('A', e.lane);
      const len = polylineLength(path);
      const p = pointAlongPolyline(path, len * e.frac);
      const ahead = pointAlongPolyline(path, Math.min(len, len * e.frac + 1));
      const dl = Math.hypot(ahead.x - p.x, ahead.z - p.z) || 1;
      const gx = p.x + ((ahead.z - p.z) / dl) * (MOBA_MAP.laneHalfW + 2.5) * e.side;
      const gz = p.z - ((ahead.x - p.x) / dl) * (MOBA_MAP.laneHalfW + 2.5) * e.side;
      for (const w of MOBA_WALL_SEGMENTS) {
        const d = Math.min(Math.hypot(gx - w.x1, gz - w.z1), Math.hypot(gx - w.x2, gz - w.z2));
        expect(d).toBeGreaterThan(e.width / 2 - 2.2);
      }
    }
  });
});

describe('MOBA map v2: river, jungle, and camps', () => {
  it('classifies pit, base, lane, ford, river, and open field', () => {
    expect(mobaSurfaceAt(mobaHeroSpawn('A').x, mobaHeroSpawn('A').z)).toBe('base');
    expect(mobaSurfaceAt(0, 0)).toBe('lane'); // mid crosses the center bridge
    expect(mobaSurfaceAt(-66, 66)).toBe('river'); // NW channel, off-ford
    expect(mobaSurfaceAt(24, -24)).toBe('river');
    expect(mobaSurfaceAt(MOBA_BOSS_PIT.x, MOBA_BOSS_PIT.z)).toBe('pit');
    expect(mobaSurfaceAt(-70, -40)).toBe('field'); // A west jungle
    for (const r of MOBA_RUNE_POINTS) expect(mobaSurfaceAt(r.x, r.z)).toBe('ford');
  });

  it('keeps jungle trees off lanes, river, bases, camps, and the pit', () => {
    expect(MOBA_JUNGLE_TREES.length).toBeGreaterThan(60); // a real forest
    for (const tree of MOBA_JUNGLE_TREES) {
      for (const lane of LANES) expect(distToLane(lane, tree.x, tree.z)).toBeGreaterThanOrEqual(8);
      expect(Math.abs(tree.x + tree.z)).toBeGreaterThan(MOBA_MAP.riverBand);
      expect(mobaBaseAt(tree.x, tree.z)).toBeNull();
      expect(Math.hypot(tree.x - MOBA_BOSS_PIT.x, tree.z - MOBA_BOSS_PIT.z)).toBeGreaterThan(MOBA_BOSS_PIT.r + 3);
      for (const camp of MOBA_JUNGLE_CAMPS) {
        expect(Math.hypot(tree.x - camp.x, tree.z - camp.z)).toBeGreaterThanOrEqual(6);
      }
    }
  });

  it('trees are deterministic (same list on every evaluation)', () => {
    const again = [...MOBA_JUNGLE_TREES];
    expect(again).toEqual([...MOBA_JUNGLE_TREES]);
  });

  it('camps come in mirrored tier pairs: two small, two medium, one large per side', () => {
    expect(MOBA_JUNGLE_CAMPS.length).toBe(10);
    for (const side of TEAMS) {
      const mine = MOBA_JUNGLE_CAMPS.filter((c) => mobaTeamForPos(c.x, c.z) === side);
      expect(mine.length).toBe(5);
      expect(mine.filter((c) => c.tier === 'small').length).toBe(2);
      expect(mine.filter((c) => c.tier === 'medium').length).toBe(2);
      expect(mine.filter((c) => c.tier === 'large').length).toBe(1);
    }
    for (const camp of MOBA_JUNGLE_CAMPS) {
      expect(MOBA_JUNGLE_CAMPS.some((o) => o.x === -camp.x && o.z === -camp.z && o.tier === camp.tier)).toBe(true);
      for (const lane of LANES) expect(distToLane(lane, camp.x, camp.z)).toBeGreaterThanOrEqual(6);
      expect(Math.abs(camp.x + camp.z)).toBeGreaterThan(MOBA_MAP.riverBand);
      expect(camp.mobs.length).toBeGreaterThan(0);
    }
  });

  it('the boss pit and runes are equidistant from both fountains (fairness)', () => {
    const a = mobaHeroSpawn('A');
    const b = mobaHeroSpawn('B');
    const dA = Math.hypot(MOBA_BOSS_PIT.x - a.x, MOBA_BOSS_PIT.z - a.z);
    const dB = Math.hypot(MOBA_BOSS_PIT.x - b.x, MOBA_BOSS_PIT.z - b.z);
    expect(Math.abs(dA - dB)).toBeLessThanOrEqual(0.01);
    // the two rune spots are point-mirrors of each other
    expect(MOBA_RUNE_POINTS.some((r) => r.x === -MOBA_RUNE_POINTS[0].x && r.z === -MOBA_RUNE_POINTS[0].z)).toBe(true);
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
