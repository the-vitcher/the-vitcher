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
// THE MAP (instance-local coords, centered on the battleground origin):
// an outdoor square, side 2*MOBA_MAP.half (~134 m, ~18,000 m^2 — real-Dota scale).
// Team A holds the SW corner (x+z < 0), Team B the NE corner. Mid lane S-curves
// along the SW->NE diagonal (~216 m walked fountain to fountain); top runs the
// west then north edges, bot mirrors it along south then east. The RIVER crosses
// the map on the NW->SE anti-diagonal (x+z = 0) — it IS the team boundary. The
// jungle between the lanes carries deterministic tree cover and six neutral creep
// camps (Dota-style: farm them for gold and XP; they respawn after being cleared).
// Everything here is the single source for sim AI, colliders, the renderer's
// ground texture, and the minimap.

import type { AbilityEffect } from './types';
import { hash2 } from './rng';
import { MOBA_TIMERS, MOBA_ECONOMY, MOBA_XP, MOBA_RANKS, MOBA_MINION_BALANCE, MOBA_TOWER_BALANCE, MOBA_CORE_BALANCE, MOBA_HERO_SEAT_LEVEL } from './content/moba_balance';

export type MobaTeam = 'A' | 'B';
export type MobaLaneIndex = 0 | 1 | 2; // 0 = top (west+north edges), 1 = mid (diagonal), 2 = bot (south+east)

export interface LanePoint { x: number; z: number }

// --- Battleground geometry ---
export const MOBA_MAP = {
  half: 67, // map extent: x,z in [-67, +67] (side 134 -> ~17,956 m^2)
  // Fountains (hero spawn pads), tucked into the corners behind the cores.
  heroSpawnA: { x: -64, z: -64 } as LanePoint,
  heroSpawnB: { x: 64, z: 64 } as LanePoint,
  // Core / nexus per team (destroying the enemy core wins the match).
  coreA: { x: -56, z: -56 } as LanePoint,
  coreB: { x: 56, z: 56 } as LanePoint,
  // Shopkeepers, on the plaza beside each fountain.
  shopA: { x: -64, z: -56 } as LanePoint,
  shopB: { x: 64, z: 56 } as LanePoint,
  // River band: |x+z| <= riverBand around the anti-diagonal (~8.5 m true half-width).
  riverBand: 12,
  // Base plaza: the corner squares beyond this coord are team ground.
  baseCorner: 48,
  // Lane paint half-width (ground texture + minimap + tree keep-out).
  laneHalfW: 5,
} as const;

// Lane centrelines, authored A -> B, fountain to fountain. Mid takes a gentle S
// through the river crossing at map center (so the walked distance matches the
// real-Dota ~225 m fountain run); top/bot hug the edges with chamfered corners.
const LANE_PATHS_A: readonly (readonly LanePoint[])[] = [
  // top (lane 0): west edge, NW corner, north edge
  [{ x: -64, z: -64 }, { x: -60, z: -48 }, { x: -60, z: 48 }, { x: -48, z: 60 }, { x: 48, z: 60 }, { x: 64, z: 64 }],
  // mid (lane 1): S-curved diagonal
  [{ x: -64, z: -64 }, { x: -52, z: -52 }, { x: -46, z: -8 }, { x: 0, z: 0 }, { x: 46, z: 8 }, { x: 52, z: 52 }, { x: 64, z: 64 }],
  // bot (lane 2): south edge, SE corner, east edge (mirror of top across the diagonal)
  [{ x: -64, z: -64 }, { x: -48, z: -60 }, { x: 48, z: -60 }, { x: 60, z: -48 }, { x: 60, z: 48 }, { x: 64, z: 64 }],
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
// the crossings (they bridge it).
export type MobaSurface = 'base' | 'lane' | 'river' | 'field';
export function mobaSurfaceAt(x: number, z: number): MobaSurface {
  if (mobaBaseAt(x, z) !== null) return 'base';
  for (const lane of [0, 1, 2] as MobaLaneIndex[]) {
    if (distToLane(lane, x, z) <= MOBA_MAP.laneHalfW) return 'lane';
  }
  if (Math.abs(x + z) <= MOBA_MAP.riverBand) return 'river';
  return 'field';
}

// --- Spawn / structure points ---

// Hero (re)spawn point for a team: the fountain pad behind its own core.
export function mobaHeroSpawn(team: MobaTeam): LanePoint {
  return team === 'A' ? { ...MOBA_MAP.heroSpawnA } : { ...MOBA_MAP.heroSpawnB };
}

// Minion spawn point for a team and lane: a fixed arc-length along the oriented
// lane path (just outside the base plaza gate).
const MINION_SPAWN_ARC = 20;
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

// --- Jungle: deterministic tree cover + six neutral creep camps ---

// Neutral camp spots (mirrored +-pairs for team fairness; one small/medium/large
// pack per side). mobs[] reference MOBA_MOBS templates in content/moba.ts.
export const MOBA_CAMP_RESPAWN_SEC = MOBA_TIMERS.campRespawnSec;
export interface MobaCampDef { x: number; z: number; mobs: readonly string[] }
export const MOBA_JUNGLE_CAMPS: readonly MobaCampDef[] = [
  // A side (x+z < 0)
  { x: -42, z: 2, mobs: ['moba_creep_raccoon', 'moba_creep_raccoon', 'moba_creep_raccoon'] },
  { x: -34, z: -18, mobs: ['moba_creep_goose', 'moba_creep_goose', 'moba_creep_goose_foreman'] },
  { x: 2, z: -42, mobs: ['moba_creep_vendbot'] },
  // B side (point-mirrored)
  { x: 42, z: -2, mobs: ['moba_creep_raccoon', 'moba_creep_raccoon', 'moba_creep_raccoon'] },
  { x: 34, z: 18, mobs: ['moba_creep_goose', 'moba_creep_goose', 'moba_creep_goose_foreman'] },
  { x: -2, z: 42, mobs: ['moba_creep_vendbot'] },
];

// Deterministic jungle tree cover: a jittered hash grid over the field, kept
// clear of lanes, the river, base plazas, camps, and the map border. The SINGLE
// source for both the collision circles and the rendered trees. hash2 (never
// Math.random) keeps it reproducible across hosts.
const TREE_GRID_STEP = 9;
const TREE_SEED = 0x1eaf;
const TREE_LANE_CLEARANCE = 9;
const TREE_CAMP_CLEARANCE = 7;
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
      let clear = true;
      for (const lane of [0, 1, 2] as MobaLaneIndex[]) {
        if (distToLane(lane, x, z) < TREE_LANE_CLEARANCE) { clear = false; break; }
      }
      if (!clear) continue;
      for (const camp of MOBA_JUNGLE_CAMPS) {
        if (Math.hypot(x - camp.x, z - camp.z) < TREE_CAMP_CLEARANCE) { clear = false; break; }
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
export const MOBA_RECALL_CD_SEC = MOBA_TIMERS.recallCdSec;

// --- Structure / minion levels (drive HP/damage via the mob templates) ---
export const MOBA_MINION_LEVEL = MOBA_MINION_BALANCE.level;
export const MOBA_TOWER_LEVEL = MOBA_TOWER_BALANCE.level;
export const MOBA_CORE_LEVEL = MOBA_CORE_BALANCE.level;
// Heroes seat at level 1 (one skill point, DotA-style) and level up on lane XP.
export const MOBA_HERO_LEVEL = MOBA_HERO_SEAT_LEVEL;

// --- Ability leveling: DotA-style skill points. One point per hero level (one at
// seat); each point learns a new basic ability or upgrades a learned one. The
// LAST kit slot is the hero's ultimate: single-rank, locked until hero level 6. ---
export const MOBA_MAX_ABILITY_RANK = MOBA_RANKS.maxRank;
export const MOBA_ULT_RANKS = MOBA_RANKS.ultRanks;
export const MOBA_ULT_HERO_LEVEL = MOBA_RANKS.ultHeroLevel;
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
