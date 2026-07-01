// The Clash: MOBA-mode pure core.
//
// Host-agnostic, DOM/Sim-free helpers for the single-lane MOBA mode ("The Clash").
// This module owns the lane GEOMETRY (bases, towers, spawn/aim points) and the
// deterministic PROGRESSION MATH (team assignment, wave composition, respawn curve,
// gold/XP bounties, core-vulnerability and win rules). The Sim orchestrates entities
// and combat around these numbers; keeping them here (like threat.ts / pathfind.ts)
// makes the mode reproducible and unit-testable without a live world.
//
// Coordinates are INSTANCE-LOCAL. The lane runs down the central aisle of the shared
// 'crypt' interior (x = 0, pillars/tombs sit at |x| = 14/19, so the aisle is clear).
// Team A holds the low-z end, Team B the high-z end; A pushes toward +z, B toward -z.

export type MobaTeam = 'A' | 'B';

export interface LanePoint { x: number; z: number }

// --- Lane geometry (instance-local; fits the crypt nave z ~ -19..112, |x| < 23) ---
export const MOBA_LANE = {
  // Core / nexus per team (destroying the enemy core wins the match).
  coreA: { x: 0, z: 8 } as LanePoint,
  coreB: { x: 0, z: 102 } as LanePoint,
  // Two towers per team, guarding the approach to their core. Inner sits closer to
  // the core, outer closer to mid; the core is invulnerable until BOTH are down.
  towersA: [{ x: 0, z: 26 }, { x: 0, z: 44 }] as LanePoint[], // [inner, outer]
  towersB: [{ x: 0, z: 84 }, { x: 0, z: 66 }] as LanePoint[], // [inner, outer]
  // Minion spawn points (just in front of each core) and lane midpoint.
  spawnA: { x: 0, z: 12 } as LanePoint,
  spawnB: { x: 0, z: 98 } as LanePoint,
  midZ: 55,
} as const;

// Hero (re)spawn point for a team: at the foot of its own core.
export function mobaHeroSpawn(team: MobaTeam): LanePoint {
  return team === 'A' ? { ...MOBA_LANE.coreA } : { ...MOBA_LANE.coreB };
}

// Minion spawn point for a team.
export function mobaMinionSpawn(team: MobaTeam): LanePoint {
  return team === 'A' ? { ...MOBA_LANE.spawnA } : { ...MOBA_LANE.spawnB };
}

// The point a team's minions march toward (the enemy core).
export function mobaEnemyCore(team: MobaTeam): LanePoint {
  return team === 'A' ? { ...MOBA_LANE.coreB } : { ...MOBA_LANE.coreA };
}

export function mobaEnemyTeam(team: MobaTeam): MobaTeam {
  return team === 'A' ? 'B' : 'A';
}

// Which team a structure at instance-local z belongs to (low-z half = A).
export function mobaTeamForZ(z: number): MobaTeam {
  return z < MOBA_LANE.midZ ? 'A' : 'B';
}

// --- Timing / wave constants ---
export const MOBA_FIRST_WAVE_SEC = 15; // first minion wave after match start
export const MOBA_WAVE_INTERVAL_SEC = 30; // a wave from each base every 30s
export const MOBA_MATCH_WARMUP_SEC = 5; // pre-match countdown before waves/combat

// --- Structure / minion levels (drive HP/damage via the mob templates) ---
export const MOBA_MINION_LEVEL = 12;
export const MOBA_TOWER_LEVEL = 18;
export const MOBA_CORE_LEVEL = 20;
// Heroes play at a fixed level so matches are gear/level-neutral; bounties scale off it.
export const MOBA_HERO_LEVEL = 15;

// --- Bounties (copper for gold, xp) awarded to the last-hitter ---
export const MOBA_MINION_GOLD = 30;
export const MOBA_MINION_XP = 45;
export const MOBA_TOWER_GOLD = 200;
export const MOBA_TOWER_XP = 260;
export const MOBA_HERO_GOLD_BASE = 120;
export const MOBA_HERO_XP = 200;

// Hero-kill gold scales a little with the victim's level so late kills pay more.
export function mobaHeroKillGold(victimLevel: number): number {
  return MOBA_HERO_GOLD_BASE + Math.max(0, victimLevel) * 10;
}

// --- Respawn curve: MOBA-style, short early and longer as heroes level. ---
export const MOBA_RESPAWN_MIN = 5;
export const MOBA_RESPAWN_MAX = 45;
export function mobaRespawnSeconds(level: number): number {
  const s = MOBA_RESPAWN_MIN + Math.max(0, level) * 2;
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
// A team's core is only vulnerable once all of that team's towers are destroyed.
export function mobaCoreVulnerable(standingTowers: number): boolean {
  return standingTowers <= 0;
}

// The winner, given whether each core still stands. Null while both stand.
export function mobaWinner(coreAAlive: boolean, coreBAlive: boolean): MobaTeam | null {
  if (!coreBAlive && coreAAlive) return 'A';
  if (!coreAAlive && coreBAlive) return 'B';
  return null;
}
