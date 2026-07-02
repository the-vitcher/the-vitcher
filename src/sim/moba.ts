// The Clash: MOBA-mode pure core.
//
// Host-agnostic, DOM/Sim-free helpers for the three-lane MOBA mode ("The Clash").
// This module owns the battleground GEOMETRY (the diagonal-square map: lanes, bases,
// towers, river, jungle) and the deterministic PROGRESSION MATH (team assignment,
// wave composition, respawn curve, bounties, ability ranks, core-vulnerability and
// win rules). The Sim orchestrates entities and combat around these numbers; keeping
// them here (like threat.ts / pathfind.ts) makes the mode reproducible and
// unit-testable without a live world.
//
// THE MAP v2 (instance-local coords, centered on the battleground origin):
// an outdoor square, side 2*MOBA_MAP.half (232 m, ~53,800 m^2 - 3x the v1 map,
// per the operator's directive; a fountain-to-lane-apex run is ~30 s at
// RUN_SPEED 7). Team A holds the SW corner (x+z < 0), Team B the NE. The three
// lanes are CURVED splines (top hugs the west/north edges with bends, mid
// S-curves the diagonal, bot mirrors top); the RIVER is a sunken channel on the
// NW->SE anti-diagonal (x+z = 0, the team boundary) crossable only at its
// fords; WALL LINES with authored entrance gaps separate each lane from the
// jungle; each jungle pocket carries a raised PLATEAU (cliff edges, two ramps),
// tiered creep camps, and deterministic tree cover; a BOSS PIT sits on the
// river to the southeast and RUNE points spawn at the two hidden fords. The
// HEIGHTFIELD (mobaHeightAt) is pure and authored from this same data - sim
// movement, pathfinding, colliders, the renderer's terrain mesh, and the
// minimap all read one source and can never disagree.

import type { AbilityEffect } from './types';
import { hash2 } from './rng';
import { MOBA_TIMERS, MOBA_ECONOMY, MOBA_XP, MOBA_RANKS, MOBA_MINION_BALANCE, MOBA_TOWER_BALANCE, MOBA_CORE_BALANCE, MOBA_HERO_SEAT_LEVEL } from './content/moba_balance';

export type MobaTeam = 'A' | 'B';
export type MobaLaneIndex = 0 | 1 | 2; // 0 = top (west+north edges), 1 = mid (diagonal), 2 = bot (south+east)

export interface LanePoint { x: number; z: number }

// --- Battleground geometry ---
export const MOBA_MAP = {
  half: 116, // map extent: x,z in [-116, +116] (side 232 -> ~53,800 m^2, 3x v1)
  // Fountains (hero spawn pads), tucked into the corners behind the cores.
  heroSpawnA: { x: -110, z: -110 } as LanePoint,
  heroSpawnB: { x: 110, z: 110 } as LanePoint,
  // Core / nexus per team, on a raised dais (destroying it wins the match).
  coreA: { x: -97, z: -97 } as LanePoint,
  coreB: { x: 97, z: 97 } as LanePoint,
  // Shopkeepers, on the plaza beside each fountain.
  shopA: { x: -110, z: -100 } as LanePoint,
  shopB: { x: 110, z: 100 } as LanePoint,
  // River band: |x+z| <= riverBand around the anti-diagonal (~11.3 m true half-width).
  riverBand: 16,
  // Base plaza: the corner squares beyond this coord are team ground.
  baseCorner: 84,
  // Lane paint half-width (ground texture + minimap + tree keep-out).
  laneHalfW: 6,
} as const;

// Lane centrelines, authored A -> B, fountain to fountain. NOT straight: every
// lane bends to break line of sight. Top runs the west edge north with a
// weave, crosses the river near the NW corner, then runs the north edge east;
// bot mirrors it across the main diagonal; mid takes a wide S through the
// center bridge. Walk locks (tests/moba.test.ts): fountain -> top-lane apex
// 195-235 m (~30 s), mid fountain-to-fountain 300-360 m.
const LANE_PATHS_A: readonly (readonly LanePoint[])[] = [
  // top (lane 0): west edge weave, NW river crossing, north edge weave
  [
    { x: -110, z: -110 }, { x: -104, z: -88 }, { x: -100, z: -40 }, { x: -106, z: 8 },
    { x: -100, z: 52 }, { x: -88, z: 84 }, { x: -72, z: 100 }, { x: -40, z: 106 },
    { x: 8, z: 100 }, { x: 52, z: 104 }, { x: 88, z: 104 }, { x: 110, z: 110 },
  ],
  // mid (lane 1): wide S-curve over the center bridge
  [
    { x: -110, z: -110 }, { x: -90, z: -94 }, { x: -60, z: -78 }, { x: -28, z: -52 },
    { x: -10, z: -14 }, { x: 0, z: 0 }, { x: 10, z: 14 }, { x: 28, z: 52 },
    { x: 60, z: 78 }, { x: 90, z: 94 }, { x: 110, z: 110 },
  ],
  // bot (lane 2): mirror of top across the main diagonal (south edge, SE crossing, east edge)
  [
    { x: -110, z: -110 }, { x: -88, z: -104 }, { x: -40, z: -100 }, { x: 8, z: -106 },
    { x: 52, z: -100 }, { x: 84, z: -88 }, { x: 100, z: -72 }, { x: 106, z: -40 },
    { x: 100, z: 8 }, { x: 104, z: 52 }, { x: 104, z: 88 }, { x: 110, z: 110 },
  ],
];

// The lane polyline oriented for a team's push direction (B marches the reverse).
export function mobaLanePath(team: MobaTeam, lane: MobaLaneIndex): LanePoint[] {
  const path = LANE_PATHS_A[lane].map((p) => ({ ...p }));
  return team === 'A' ? path : path.reverse();
}

// --- Polyline helpers (pure; shared by towers, marching, surface classification) ---

export function polylineLength(path: readonly LanePoint[]): number {
  let len = 0;
  for (let i = 1; i < path.length; i++) len += Math.hypot(path[i].x - path[i - 1].x, path[i].z - path[i - 1].z);
  return len;
}

export function pointAlongPolyline(path: readonly LanePoint[], dist: number): LanePoint {
  let remaining = Math.max(0, dist);
  for (let i = 1; i < path.length; i++) {
    const seg = Math.hypot(path[i].x - path[i - 1].x, path[i].z - path[i - 1].z);
    if (remaining <= seg && seg > 0) {
      const t = remaining / seg;
      return { x: path[i - 1].x + (path[i].x - path[i - 1].x) * t, z: path[i - 1].z + (path[i].z - path[i - 1].z) * t };
    }
    remaining -= seg;
  }
  return { ...path[path.length - 1] };
}

// Distance from a point to a polyline, plus the arc-length of the closest spot
// (used by the march follower to know how far along the lane a minion stands).
export function projectOntoPolyline(path: readonly LanePoint[], x: number, z: number): { dist: number; along: number } {
  let best = Infinity;
  let bestAlong = 0;
  let walked = 0;
  for (let i = 1; i < path.length; i++) {
    const ax = path[i - 1].x, az = path[i - 1].z;
    const bx = path[i].x, bz = path[i].z;
    const dx = bx - ax, dz = bz - az;
    const segLen = Math.hypot(dx, dz);
    const t = segLen > 0 ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (segLen * segLen))) : 0;
    const px = ax + dx * t, pz = az + dz * t;
    const d = Math.hypot(x - px, z - pz);
    if (d < best) { best = d; bestAlong = walked + segLen * t; }
    walked += segLen;
  }
  return { dist: best, along: bestAlong };
}

export function distToLane(lane: MobaLaneIndex, x: number, z: number): number {
  return projectOntoPolyline(LANE_PATHS_A[lane], x, z).dist;
}

function distToSegment(x: number, z: number, ax: number, az: number, bx: number, bz: number): number {
  const dx = bx - ax, dz = bz - az;
  const len2 = dx * dx + dz * dz;
  const t = len2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / len2)) : 0;
  return Math.hypot(x - (ax + dx * t), z - (az + dz * t));
}

function smoothstep01(t: number): number {
  const c = Math.max(0, Math.min(1, t));
  return c * c * (3 - 2 * c);
}

// --- River: a sunken channel on the anti-diagonal, crossable only at fords ---
// Bank walls rise the full bedDepth over ~1 m of ground, steeper than the
// climb limit (1.5 rise/run), so the river SEPARATES the halves; falling in is
// allowed (downhill), and the flat bed is walkable along its length to the
// nearest ford ramp. Each lane crosses at its own ford; two narrow HIDDEN
// fords (the rune spots) pierce the jungle stretches.
// A ford's r is its half-width ALONG the river line; its easing always spans
// the full channel width (a crossing has to reach both banks), so narrow
// fords are narrow along the river, not across it.
export interface MobaFord { x: number; z: number; r: number; kind: 'lane' | 'bridge' | 'hidden' }
export const MOBA_RIVER = {
  band: MOBA_MAP.riverBand, // |x+z| extent of the channel
  bedDepth: -1.8,
  bankBand: 1.4, // |x+z| span of the bank wall (~1 m true width -> slope ~1.8, blocks)
  fords: [
    { x: -86, z: 86, r: 9, kind: 'lane' }, // top lane crossing
    { x: 0, z: 0, r: 10, kind: 'bridge' }, // mid: the center bridge
    { x: 86, z: -86, r: 9, kind: 'lane' }, // bot lane crossing
    { x: -45, z: 45, r: 5, kind: 'hidden' }, // NW jungle ford (rune spot)
    { x: 45, z: -45, r: 5, kind: 'hidden' }, // SE jungle ford (rune spot)
  ] as readonly MobaFord[],
} as const;

// Signed distance from a point to a ford center measured ALONG the river line.
export function mobaFordAlongDist(f: MobaFord, x: number, z: number): number {
  return ((x - f.x) - (z - f.z)) / Math.SQRT2;
}

// Power runes spawn at the hidden fords: holding the river pays.
export const MOBA_RUNE_POINTS: readonly LanePoint[] = [
  { x: -45, z: 45 },
  { x: 45, z: -45 },
];

// --- Boss pit: an isolated bowl ON the river southeast of center, equidistant
// from both fountains. A raised rim wall rings the bowl (sheer both ways, so
// neither the banks nor the riverbed walk in over it) except at the two mouth
// gaps, which open ALONG the riverbed: you approach by dropping into the river
// or crossing at a ford, then walking the bed to a mouth. ---
export const MOBA_BOSS_PIT = {
  x: 64, z: -64, r: 10,
  floor: -2.0, // 0.2 above the riverbed so the mouths step out cleanly
  rimH: 1.8, // rim crest height above the riverbed
  rimHalf: 1.3, // half-width of the rim wall (narrow -> steeper than the climb limit)
  mouths: [
    { x: 57, z: -57 }, // NW mouth (toward the hidden ford / mid)
    { x: 71, z: -71 }, // SE mouth (toward the bot-lane ford)
  ] as readonly LanePoint[],
  mouthR: 6,
} as const;

// --- Jungle high ground: one plateau per jungle pocket (cliff edges steeper
// than the climb limit; the ONLY ways up are the two authored ramps), each
// overlooking a river approach. Point-mirrored for fairness. ---
export interface MobaHeightDisc { x: number; z: number; r: number; h: number; falloff: number }
export interface MobaHeightCapsule { x1: number; z1: number; x2: number; z2: number; r: number; h: number; falloff: number }
export const MOBA_PLATEAUS: readonly MobaHeightDisc[] = [
  { x: -64, z: 22, r: 13, h: 2.5, falloff: 1.1 }, // A west pocket (over the NW ford approach)
  { x: 22, z: -64, r: 13, h: 2.5, falloff: 1.1 }, // A south pocket (over the pit approach)
  { x: 64, z: -22, r: 13, h: 2.5, falloff: 1.1 }, // B east pocket
  { x: -22, z: 64, r: 13, h: 2.5, falloff: 1.1 }, // B north pocket
];
export const MOBA_RAMPS: readonly MobaHeightCapsule[] = [
  // A west plateau: down toward the top lane, and down toward mid
  { x1: -64, z1: 22, x2: -80, z2: 14, r: 4.5, h: 2.5, falloff: 9 },
  { x1: -64, z1: 22, x2: -50, z2: 6, r: 4.5, h: 2.5, falloff: 9 },
  // A south plateau: toward the bot lane, and toward mid
  { x1: 22, z1: -64, x2: 14, z2: -80, r: 4.5, h: 2.5, falloff: 9 },
  { x1: 22, z1: -64, x2: 6, z2: -50, r: 4.5, h: 2.5, falloff: 9 },
  // B east plateau
  { x1: 64, z1: -22, x2: 80, z2: -14, r: 4.5, h: 2.5, falloff: 9 },
  { x1: 64, z1: -22, x2: 50, z2: -6, r: 4.5, h: 2.5, falloff: 9 },
  // B north plateau
  { x1: -22, z1: 64, x2: -14, z2: 80, r: 4.5, h: 2.5, falloff: 9 },
  { x1: -22, z1: 64, x2: -6, z2: 50, r: 4.5, h: 2.5, falloff: 9 },
];
// Core dais: a gentle raised platform under each nexus (walkable all around).
const CORE_DAIS: readonly MobaHeightDisc[] = [
  { x: MOBA_MAP.coreA.x, z: MOBA_MAP.coreA.z, r: 9, h: 2, falloff: 6 },
  { x: MOBA_MAP.coreB.x, z: MOBA_MAP.coreB.z, r: 9, h: 2, falloff: 6 },
];

function discHeight(d: MobaHeightDisc, x: number, z: number): number {
  const dist = Math.hypot(x - d.x, z - d.z);
  if (dist >= d.r + d.falloff) return 0;
  if (dist <= d.r) return d.h;
  return d.h * (1 - smoothstep01((dist - d.r) / d.falloff));
}

function capsuleHeight(c: MobaHeightCapsule, x: number, z: number): number {
  const dist = distToSegment(x, z, c.x1, c.z1, c.x2, c.z2);
  if (dist >= c.r + c.falloff) return 0;
  if (dist <= c.r) return c.h;
  return c.h * (1 - smoothstep01((dist - c.r) / c.falloff));
}

// THE heightfield: pure, rng-free, authored entirely from the shape data above.
// groundHeight (src/sim/world.ts) returns DUNGEON_FLOOR_Y + mobaHeightAt for
// the battleground band, so the sim, colliders, pathfinding, renderer terrain,
// and camera all ride one surface.
export function mobaHeightAt(x: number, z: number): number {
  // raised ground: plateaus (with their ramps) and the core daises, max-blended
  let up = 0;
  for (const d of MOBA_PLATEAUS) up = Math.max(up, discHeight(d, x, z));
  for (const c of MOBA_RAMPS) up = Math.max(up, capsuleHeight(c, x, z));
  for (const d of CORE_DAIS) up = Math.max(up, discHeight(d, x, z));

  // sunken ground: the river channel (eased flat at fords) and the boss pit
  let down = 0;
  const s = Math.abs(x + z);
  if (s < MOBA_RIVER.band) {
    const bank = s > MOBA_RIVER.band - MOBA_RIVER.bankBand
      ? 1 - smoothstep01((s - (MOBA_RIVER.band - MOBA_RIVER.bankBand)) / MOBA_RIVER.bankBand)
      : 1;
    let fordEase = 1;
    for (const f of MOBA_RIVER.fords) {
      const u = Math.abs(mobaFordAlongDist(f, x, z));
      if (u < f.r) { fordEase = Math.min(fordEase, 0.15 + 0.85 * smoothstep01(u / f.r)); }
    }
    down = MOBA_RIVER.bedDepth * bank * fordEase;
  }
  const pit = MOBA_BOSS_PIT;
  const dp = Math.hypot(x - pit.x, z - pit.z);
  if (dp < pit.r + pit.rimHalf + 1) {
    // the bowl floor (slightly below the riverbed it sits in)
    if (dp < pit.r) {
      const bowl = 1 - smoothstep01((dp - (pit.r - 1.5)) / 1.5);
      down = Math.min(down, pit.floor * bowl);
    }
    // the rim wall: a narrow raised ring at the bowl edge, broken at the mouths
    const ringT = Math.abs(dp - pit.r);
    if (ringT < pit.rimHalf) {
      let mouthEase = 1;
      for (const m of pit.mouths) {
        const dm = Math.hypot(x - m.x, z - m.z);
        if (dm < pit.mouthR) mouthEase = Math.min(mouthEase, smoothstep01(dm / pit.mouthR));
      }
      up = Math.max(up, pit.rimH * (1 - smoothstep01(ringT / pit.rimHalf)) * mouthEase);
    }
  }
  return up + down;
}

// --- Position classifiers ---

// Which team owns a position: the river line (x+z = 0) is the boundary; SW = A.
export function mobaTeamForPos(x: number, z: number): MobaTeam {
  return x + z < 0 ? 'A' : 'B';
}

// The nearest lane to a position (by distance to the three centrelines).
export function mobaLaneForPos(x: number, z: number): MobaLaneIndex {
  let best: MobaLaneIndex = 0;
  let bestD = Infinity;
  for (const lane of [0, 1, 2] as MobaLaneIndex[]) {
    const d = distToLane(lane, x, z);
    if (d < bestD) { bestD = d; best = lane; }
  }
  return best;
}

// Whether a corner base plaza owns this position ('A', 'B', or null).
export function mobaBaseAt(x: number, z: number): MobaTeam | null {
  const c = MOBA_MAP.baseCorner;
  if (x <= -c && z <= -c) return 'A';
  if (x >= c && z >= c) return 'B';
  return null;
}

// Ground-surface classifier: the single source for the rendered ground texture,
// the minimap painter, and jungle-tree placement. Lanes paint over the river at
// their fords; the ford class marks every walkable crossing.
export type MobaSurface = 'base' | 'lane' | 'ford' | 'river' | 'pit' | 'field';
export function mobaSurfaceAt(x: number, z: number): MobaSurface {
  if (Math.hypot(x - MOBA_BOSS_PIT.x, z - MOBA_BOSS_PIT.z) <= MOBA_BOSS_PIT.r) return 'pit';
  if (mobaBaseAt(x, z) !== null) return 'base';
  for (const lane of [0, 1, 2] as MobaLaneIndex[]) {
    if (distToLane(lane, x, z) <= MOBA_MAP.laneHalfW) return 'lane';
  }
  if (Math.abs(x + z) <= MOBA_MAP.riverBand) {
    for (const f of MOBA_RIVER.fords) {
      if (Math.abs(mobaFordAlongDist(f, x, z)) <= f.r) return 'ford';
    }
    return 'river';
  }
  return 'field';
}

// --- Walls + entrances: each lane is fenced off from the jungle by wall lines
// (offset curves of the lane spline) pierced ONLY by the authored entrance
// gaps, so lane<->jungle crossings happen at deliberate, contestable spots.
// side +1 offsets to the right of the A-oriented march direction. ---
export interface MobaEntranceDef {
  lane: MobaLaneIndex;
  side: 1 | -1;
  frac: number; // arc fraction along the A-oriented lane
  width: number; // gap width in yards
  kind: 'wide' | 'narrow' | 'elevated';
}
export const MOBA_LANE_ENTRANCES: readonly MobaEntranceDef[] = [
  // top lane, jungle (east) side: 4 authored gaps + the river ford break
  { lane: 0, side: 1, frac: 0.20, width: 12, kind: 'wide' },
  { lane: 0, side: 1, frac: 0.33, width: 6, kind: 'elevated' }, // below the A west plateau ramp
  { lane: 0, side: 1, frac: 0.64, width: 6, kind: 'narrow' },
  { lane: 0, side: 1, frac: 0.80, width: 12, kind: 'wide' },
  // mid lane: two gaps per flank
  { lane: 1, side: -1, frac: 0.30, width: 12, kind: 'wide' },
  { lane: 1, side: -1, frac: 0.68, width: 7, kind: 'narrow' },
  { lane: 1, side: 1, frac: 0.32, width: 7, kind: 'narrow' },
  { lane: 1, side: 1, frac: 0.70, width: 12, kind: 'wide' },
  // bot lane, jungle (north) side: mirror of top
  { lane: 2, side: -1, frac: 0.20, width: 12, kind: 'wide' },
  { lane: 2, side: -1, frac: 0.33, width: 6, kind: 'elevated' },
  { lane: 2, side: -1, frac: 0.64, width: 6, kind: 'narrow' },
  { lane: 2, side: -1, frac: 0.80, width: 12, kind: 'wide' },
];

// Which stretches of each lane get walls (the same sides the entrances pierce).
const WALL_SPECS: readonly { lane: MobaLaneIndex; side: 1 | -1 }[] = [
  { lane: 0, side: 1 },
  { lane: 1, side: -1 },
  { lane: 1, side: 1 },
  { lane: 2, side: -1 },
];
const WALL_OFFSET = MOBA_MAP.laneHalfW + 2.5; // wall line sits just off the lane paint
const WALL_FRAC_MIN = 0.12; // walls start outside the base gates
const WALL_FRAC_MAX = 0.88;
const WALL_SAMPLE_STEP = 3; // yards between wall posts

export interface MobaWallSegment { x1: number; z1: number; x2: number; z2: number }

// Sample a lane's offset curve into wall segments, skipping entrance gaps, the
// river channel, and the base plazas. Computed once; the SINGLE source for the
// wall colliders (sim/colliders.ts) and the rendered rampart props.
export const MOBA_WALL_SEGMENTS: readonly MobaWallSegment[] = (() => {
  const out: MobaWallSegment[] = [];
  for (const spec of WALL_SPECS) {
    const path = LANE_PATHS_A[spec.lane];
    const len = polylineLength(path);
    const gaps = MOBA_LANE_ENTRANCES.filter((e) => e.lane === spec.lane && e.side === spec.side);
    let prev: LanePoint | null = null;
    for (let arc = len * WALL_FRAC_MIN; arc <= len * WALL_FRAC_MAX; arc += WALL_SAMPLE_STEP) {
      const p = pointAlongPolyline(path, arc);
      const ahead = pointAlongPolyline(path, Math.min(len, arc + 1));
      const dx = ahead.x - p.x, dz = ahead.z - p.z;
      const dl = Math.hypot(dx, dz) || 1;
      const wx = p.x + (dz / dl) * WALL_OFFSET * spec.side;
      const wz = p.z - (dx / dl) * WALL_OFFSET * spec.side;
      const inGap = gaps.some((g) => Math.abs(arc - len * g.frac) < g.width / 2)
        || Math.abs(wx + wz) <= MOBA_MAP.riverBand + 3
        || mobaBaseAt(wx, wz) !== null
        || Math.abs(wx) > MOBA_MAP.half - 2 || Math.abs(wz) > MOBA_MAP.half - 2;
      if (inGap) { prev = null; continue; }
      if (prev) out.push({ x1: prev.x, z1: prev.z, x2: wx, z2: wz });
      prev = { x: wx, z: wz };
    }
  }
  return out;
})();

// --- Spawn / structure points ---

// Hero (re)spawn point for a team: the fountain pad behind its own core.
export function mobaHeroSpawn(team: MobaTeam): LanePoint {
  return team === 'A' ? { ...MOBA_MAP.heroSpawnA } : { ...MOBA_MAP.heroSpawnB };
}

// Minion spawn point for a team and lane: a fixed arc-length along the oriented
// lane path (just outside the base plaza gate).
const MINION_SPAWN_ARC = 30;
export function mobaMinionSpawn(team: MobaTeam, lane: MobaLaneIndex): LanePoint {
  return pointAlongPolyline(mobaLanePath(team, lane), MINION_SPAWN_ARC);
}

// Tower positions for a team and lane: fractions along the TEAM-ORIENTED lane
// path, [outer, middle, inner] from the river back toward the base. All < 0.5,
// so every tower stands on its owning half.
export const MOBA_TOWER_FRACS: readonly number[] = [0.42, 0.28, 0.15];
export function mobaTowerPoints(team: MobaTeam, lane: MobaLaneIndex): LanePoint[] {
  const path = mobaLanePath(team, lane);
  const len = polylineLength(path);
  return MOBA_TOWER_FRACS.map((f) => pointAlongPolyline(path, len * f));
}

// The enemy core a team is trying to destroy.
export function mobaEnemyCore(team: MobaTeam): LanePoint {
  return team === 'A' ? { ...MOBA_MAP.coreB } : { ...MOBA_MAP.coreA };
}

export function mobaEnemyTeam(team: MobaTeam): MobaTeam {
  return team === 'A' ? 'B' : 'A';
}

// The point a marching minion heads for: project onto the team-oriented lane
// path and walk toward the next vertex (with a small lookahead so a minion
// standing on a vertex targets the one after it); past the final stretch, head
// for the enemy core. Stateless: position in, target out.
const MARCH_LOOKAHEAD = 2;
export function mobaMinionMarchTarget(team: MobaTeam, lane: MobaLaneIndex, x: number, z: number): LanePoint {
  const path = mobaLanePath(team, lane);
  const { along } = projectOntoPolyline(path, x, z);
  // Walk vertex by vertex: target the first vertex whose arc-length exceeds the
  // minion's projection plus the lookahead.
  let walked = 0;
  for (let i = 1; i < path.length; i++) {
    walked += Math.hypot(path[i].x - path[i - 1].x, path[i].z - path[i - 1].z);
    if (walked > along + MARCH_LOOKAHEAD) {
      // The last vertex is the enemy fountain; divert to the core instead.
      if (i === path.length - 1) return mobaEnemyCore(team);
      return { ...path[i] };
    }
  }
  return mobaEnemyCore(team);
}

// --- Jungle: tiered neutral creep camps + deterministic tree cover ---

// Camp spots, point-mirrored for team fairness: per side two small, two
// medium, and one large camp spread across the two jungle pockets. mobs[]
// reference MOBA_MOBS templates in content/moba.ts.
export const MOBA_CAMP_RESPAWN_SEC = MOBA_TIMERS.campRespawnSec;
export type MobaCampTier = 'small' | 'medium' | 'large';
export interface MobaCampDef { x: number; z: number; tier: MobaCampTier; mobs: readonly string[] }
const CAMP_MOBS: Record<MobaCampTier, readonly string[]> = {
  small: ['moba_creep_raccoon', 'moba_creep_raccoon', 'moba_creep_raccoon'],
  medium: ['moba_creep_goose', 'moba_creep_goose', 'moba_creep_goose_foreman'],
  large: ['moba_creep_vendbot', 'moba_creep_raccoon', 'moba_creep_raccoon'],
};
export const MOBA_JUNGLE_CAMPS: readonly MobaCampDef[] = [
  // A side (x+z < 0): west pocket, then south pocket
  { x: -84, z: -36, tier: 'small', mobs: CAMP_MOBS.small },
  { x: -70, z: -6, tier: 'medium', mobs: CAMP_MOBS.medium },
  { x: -36, z: -84, tier: 'small', mobs: CAMP_MOBS.small },
  { x: -6, z: -70, tier: 'medium', mobs: CAMP_MOBS.medium },
  { x: -30, z: -68, tier: 'large', mobs: CAMP_MOBS.large },
  // B side (point-mirrored)
  { x: 84, z: 36, tier: 'small', mobs: CAMP_MOBS.small },
  { x: 70, z: 6, tier: 'medium', mobs: CAMP_MOBS.medium },
  { x: 36, z: 84, tier: 'small', mobs: CAMP_MOBS.small },
  { x: 6, z: 70, tier: 'medium', mobs: CAMP_MOBS.medium },
  { x: 30, z: 68, tier: 'large', mobs: CAMP_MOBS.large },
];

// Deterministic jungle tree cover: a jittered hash grid over the field, kept
// clear of lanes, the river, fords, bases, camps, walls, ramps, the boss pit,
// and the border. The SINGLE source for both the collision circles and the
// rendered trees. hash2 (never Math.random) keeps it reproducible everywhere.
const TREE_GRID_STEP = 9;
const TREE_SEED = 0x1eaf;
const TREE_LANE_CLEARANCE = 10;
const TREE_CAMP_CLEARANCE = 8;
export interface MobaTree { x: number; z: number; r: number }
export const MOBA_JUNGLE_TREES: readonly MobaTree[] = (() => {
  const out: MobaTree[] = [];
  const lim = MOBA_MAP.half - 4;
  for (let gx = -lim; gx <= lim; gx += TREE_GRID_STEP) {
    for (let gz = -lim; gz <= lim; gz += TREE_GRID_STEP) {
      const h = hash2(gx, gz, TREE_SEED);
      if (h < 0.45) continue; // thin the forest
      const jx = (hash2(gx, gz, TREE_SEED + 1) - 0.5) * (TREE_GRID_STEP - 3);
      const jz = (hash2(gx, gz, TREE_SEED + 2) - 0.5) * (TREE_GRID_STEP - 3);
      const x = gx + jx, z = gz + jz;
      if (Math.abs(x) > lim || Math.abs(z) > lim) continue;
      if (mobaBaseAt(x, z) !== null) continue;
      if (Math.abs(x + z) <= MOBA_MAP.riverBand + 2) continue; // keep the river open
      if (Math.hypot(x - MOBA_BOSS_PIT.x, z - MOBA_BOSS_PIT.z) < MOBA_BOSS_PIT.r + 4) continue;
      let clear = true;
      for (const lane of [0, 1, 2] as MobaLaneIndex[]) {
        if (distToLane(lane, x, z) < TREE_LANE_CLEARANCE) { clear = false; break; }
      }
      if (!clear) continue;
      for (const camp of MOBA_JUNGLE_CAMPS) {
        if (Math.hypot(x - camp.x, z - camp.z) < TREE_CAMP_CLEARANCE) { clear = false; break; }
      }
      if (!clear) continue;
      for (const c of MOBA_RAMPS) {
        if (distToSegment(x, z, c.x1, c.z1, c.x2, c.z2) < c.r + 2) { clear = false; break; }
      }
      if (!clear) continue;
      for (const f of MOBA_RIVER.fords) {
        if (Math.abs(mobaFordAlongDist(f, x, z)) < f.r + 3 && Math.abs(x + z) < MOBA_MAP.riverBand + 6) { clear = false; break; }
      }
      if (!clear) continue;
      out.push({ x: Math.round(x * 10) / 10, z: Math.round(z * 10) / 10, r: 0.7 });
    }
  }
  return out;
})();

// --- Timing / wave constants (ALL numbers live in content/moba_balance.ts) ---
export const MOBA_FIRST_WAVE_SEC = MOBA_TIMERS.firstWaveSec;
export const MOBA_WAVE_INTERVAL_SEC = MOBA_TIMERS.waveIntervalSec;
export const MOBA_MATCH_WARMUP_SEC = MOBA_TIMERS.warmupSec;

// --- Recall: the channel home to heal and shop. Stationary; damage or movement
// cancels it, and a fresh attempt waits out the cooldown (stamped at START, so a
// cancelled recall cannot be spammed). ---
export const MOBA_RECALL_CHANNEL_SEC = MOBA_TIMERS.recallChannelSec;
export { MOBA_FOUNTAIN, MOBA_SEPARATION, MOBA_OBJECTIVES } from './content/moba_balance';

// --- Soft unit separation (pure vector math; the sim applies the result) ---

export interface MobaBody { id: number; x: number; z: number; r: number }

// The capped push-apart step for one unit given its overlapping neighbors:
// half of each pairwise overlap, pushed away along the center line (perfectly
// stacked pairs tie-break on a fixed axis by id order so both sides separate
// deterministically). Returns null when nothing overlaps.
export function mobaSeparationStep(self: MobaBody, neighbors: readonly MobaBody[], maxStep: number): { x: number; z: number } | null {
  let px = 0;
  let pz = 0;
  for (const n of neighbors) {
    if (n.id === self.id) continue;
    const dx = self.x - n.x;
    const dz = self.z - n.z;
    const d = Math.hypot(dx, dz);
    const overlap = self.r + n.r - d;
    if (overlap <= 0) continue;
    if (d < 1e-6) {
      // exactly stacked: deterministic axis split by id order
      px += self.id < n.id ? overlap * 0.5 : -overlap * 0.5;
      continue;
    }
    px += (dx / d) * overlap * 0.5;
    pz += (dz / d) * overlap * 0.5;
  }
  if (px === 0 && pz === 0) return null;
  const len = Math.hypot(px, pz);
  if (len > maxStep) {
    px = (px / len) * maxStep;
    pz = (pz / len) * maxStep;
  }
  return { x: px, z: pz };
}
export const MOBA_RECALL_CD_SEC = MOBA_TIMERS.recallCdSec;

// --- Structure / minion levels (drive HP/damage via the mob templates) ---
export const MOBA_MINION_LEVEL = MOBA_MINION_BALANCE.level;
export const MOBA_TOWER_LEVEL = MOBA_TOWER_BALANCE.level;
export const MOBA_CORE_LEVEL = MOBA_CORE_BALANCE.level;
// Heroes seat at level 1 (one skill point, DotA-style) and level up on lane XP.
export const MOBA_HERO_LEVEL = MOBA_HERO_SEAT_LEVEL;

// --- Ability leveling: DotA-style skill points. One point per hero level (one at
// seat); each point learns a new ability or upgrades a learned one. Every ability
// has four ranks; rank N additionally requires the hero level in
// MOBA_RANK_HERO_LEVELS (1/3/5/7). ---
export const MOBA_MAX_ABILITY_RANK = MOBA_RANKS.maxRank;
export const MOBA_RANK_HERO_LEVELS: readonly number[] = MOBA_RANKS.rankHeroLevels;
// Effect power by rank (authored numbers are rank 2); crowd-control durations
// grow on their own gentler curve.
export const MOBA_RANK_POWER: readonly number[] = MOBA_RANKS.power;
export const MOBA_RANK_CC: readonly number[] = MOBA_RANKS.cc;

// Scale one ability effect to a rank, returning a NEW object (content defs are
// shared module data and must never be mutated). Damage/heal magnitudes follow
// MOBA_RANK_POWER; hard-CC durations follow MOBA_RANK_CC; everything else
// (slows, charges, buff multipliers) is rank-invariant.
export function mobaScaleEffectForRank(eff: AbilityEffect, rank: number): AbilityEffect {
  const r = Math.max(1, Math.min(MOBA_MAX_ABILITY_RANK, Math.floor(rank)));
  const p = MOBA_RANK_POWER[r - 1];
  const cc = MOBA_RANK_CC[r - 1];
  switch (eff.type) {
    case 'weaponDamage': return { ...eff, bonus: Math.round(eff.bonus * p) };
    case 'weaponStrike': return { ...eff, bonus: Math.round(eff.bonus * p) };
    case 'directDamage': return { ...eff, min: Math.round(eff.min * p), max: Math.round(eff.max * p) };
    case 'dot': return { ...eff, total: Math.round(eff.total * p) };
    case 'aoeDamage': return { ...eff, min: Math.round(eff.min * p), max: Math.round(eff.max * p) };
    case 'aoeRoot': return { ...eff, min: Math.round(eff.min * p), max: Math.round(eff.max * p), duration: Math.round(eff.duration * cc * 10) / 10 };
    case 'groundAoE': return { ...eff, min: Math.round(eff.min * p), max: Math.round(eff.max * p) };
    case 'drainTick': return { ...eff, min: Math.round(eff.min * p), max: Math.round(eff.max * p) };
    case 'finisherDamage': return { ...eff, base: Math.round(eff.base * p), perCombo: Math.round(eff.perCombo * p) };
    case 'heal': return { ...eff, min: Math.round(eff.min * p), max: Math.round(eff.max * p) };
    case 'hot': return { ...eff, total: Math.round(eff.total * p) };
    case 'absorb': return { ...eff, amount: Math.round(eff.amount * p) };
    case 'stun': return { ...eff, duration: Math.round(eff.duration * cc * 10) / 10 };
    case 'root': return { ...eff, duration: Math.round(eff.duration * cc * 10) / 10 };
    case 'incapacitate': return { ...eff, duration: Math.round(eff.duration * cc * 10) / 10 };
    case 'polymorph': return { ...eff, duration: Math.round(eff.duration * cc * 10) / 10 };
    default: return eff;
  }
}

// --- XP pacing: turbo (~2x a traditional MOBA). Kill XP is a fixed fraction of
// the level requirement so a steady farmer hits 6 fast and finishes a match at
// hero level ~10-12, independent of the vanilla anti-farm curves. ---
export const MOBA_MINION_XP_PCT = MOBA_XP.minionPct;
export const MOBA_TOWER_XP_PCT = MOBA_XP.towerPct;
export const MOBA_HERO_KILL_XP_PCT = MOBA_XP.heroKillPct;
export const MOBA_CAMP_XP_PCT = MOBA_XP.campPct;

// --- Bounties (copper) paid instantly to the last-hitter. XP is not listed here:
// kill XP flows through the engine's normal mobXpValue path, which is what levels
// heroes up over a match. Towers ALSO pay a team-wide bounty (towerTeamGold). ---
export const MOBA_MINION_GOLD = MOBA_ECONOMY.minionGold;
export const MOBA_TOWER_GOLD = MOBA_ECONOMY.towerGold;
export const MOBA_TOWER_TEAM_GOLD = MOBA_ECONOMY.towerTeamGold;
export const MOBA_HERO_GOLD_BASE = MOBA_ECONOMY.heroGoldBase;

// Hero-kill gold scales with the victim's level so late kills pay more.
export function mobaHeroKillGold(victimLevel: number): number {
  return MOBA_HERO_GOLD_BASE + Math.max(0, victimLevel) * MOBA_ECONOMY.heroGoldPerLevel;
}

// --- Respawn curve: MOBA-style, short early and longer as heroes level. ---
export const MOBA_RESPAWN_MIN = MOBA_TIMERS.respawnMin;
export const MOBA_RESPAWN_MAX = MOBA_TIMERS.respawnMax;
export function mobaRespawnSeconds(level: number): number {
  const s = MOBA_RESPAWN_MIN + Math.max(0, level) * MOBA_TIMERS.respawnPerLevel;
  return Math.min(MOBA_RESPAWN_MAX, Math.max(MOBA_RESPAWN_MIN, Math.round(s)));
}

// --- Team assignment: split player ids into two balanced sides, capped per side. ---
// Deterministic (input order preserved): fills A, B, A, B, ... up to teamSize each.
// Extra ids beyond 2*teamSize are dropped (the caller decides how to fill/queue).
export function assignMobaTeams(pids: number[], teamSize: number): Map<number, MobaTeam> {
  const cap = Math.max(1, Math.min(5, Math.floor(teamSize)));
  const out = new Map<number, MobaTeam>();
  let a = 0, b = 0;
  for (const pid of pids) {
    if (a <= b && a < cap) { out.set(pid, 'A'); a++; }
    else if (b < cap) { out.set(pid, 'B'); b++; }
    // else: no room on either side; skip (bench/queue is the caller's problem)
  }
  return out;
}

// How many bot fillers each team needs to reach teamSize, given current human counts.
export function mobaBotFill(humansA: number, humansB: number, teamSize: number): { A: number; B: number } {
  const cap = Math.max(1, Math.min(5, Math.floor(teamSize)));
  return { A: Math.max(0, cap - humansA), B: Math.max(0, cap - humansB) };
}

// --- Wave composition: which minion templates spawn in wave N (1-based). ---
// Base wave is three melee + one ranged; every third wave adds a melee, so lanes
// slowly escalate. Returned ids reference MOBA_MOBS in content/moba.ts.
export const MOBA_MINION_MELEE_ID = 'moba_minion_melee';
export const MOBA_MINION_RANGED_ID = 'moba_minion_ranged';
export function mobaWaveComposition(waveIndex: number): string[] {
  const n = Math.max(1, Math.floor(waveIndex));
  const melee = 3 + Math.floor(n / 3);
  const out: string[] = [];
  for (let i = 0; i < melee; i++) out.push(MOBA_MINION_MELEE_ID);
  out.push(MOBA_MINION_RANGED_ID);
  return out;
}

// --- Objective rules ---
// A team's core opens up once ANY one lane of its towers is fully destroyed
// (standingPerLane holds that team's standing-tower count per lane).
export function mobaCoreVulnerable(standingPerLane: number[]): boolean {
  return standingPerLane.some((n) => n <= 0);
}

// The winner, given whether each core still stands. Null while both stand.
export function mobaWinner(coreAAlive: boolean, coreBAlive: boolean): MobaTeam | null {
  if (!coreBAlive && coreAAlive) return 'A';
  if (!coreAAlive && coreBAlive) return 'B';
  return null;
}
