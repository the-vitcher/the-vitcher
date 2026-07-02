// The Clash: MOBA-mode pure core.
//
// Host-agnostic, DOM/Sim-free helpers for the three-lane MOBA mode ("The Clash").
// This module owns the battleground GEOMETRY (lanes, bases, towers, spawn and march
// points) and the deterministic PROGRESSION MATH (team assignment, wave composition,
// respawn curve, gold/XP bounties, core-vulnerability and win rules). The Sim
// orchestrates entities and combat around these numbers; keeping them here (like
// threat.ts / pathfind.ts) makes the mode reproducible and unit-testable without a
// live world.
//
// Coordinates are INSTANCE-LOCAL, inside the oversized 'clash' interior
// (sim/dungeon_layout CLASH_LAYOUT: z -10..150, |x| < 70). Three lanes run along z
// at x = -45 / 0 / +45, divided by broken pillar rows at |x| = 22. Team A holds the
// low-z end, Team B the high-z end; A pushes toward +z, B toward -z.

export type MobaTeam = 'A' | 'B';
export type MobaLaneIndex = 0 | 1 | 2; // 0 = top (x -45), 1 = mid (x 0), 2 = bot (x +45)

export interface LanePoint { x: number; z: number }

// --- Battleground geometry (instance-local; fits CLASH_LAYOUT) ---
export const MOBA_LANE_XS: readonly number[] = [-45, 0, 45];
export const MOBA_MAP = {
  // Core / nexus per team (destroying the enemy core wins the match).
  coreA: { x: 0, z: 12 } as LanePoint,
  coreB: { x: 0, z: 128 } as LanePoint,
  // Hero (re)spawn pads, tucked behind each core.
  heroSpawnA: { x: 0, z: 6 } as LanePoint,
  heroSpawnB: { x: 0, z: 134 } as LanePoint,
  // Tower z per team, [inner, outer]; each lane gets one tower at each z.
  towerZA: [34, 54] as readonly number[],
  towerZB: [106, 86] as readonly number[],
  // Minion spawn z per team (waves fan out to each lane's x at this z).
  minionSpawnZA: 20,
  minionSpawnZB: 120,
  // Where a marching minion swings out of its lane toward the enemy core.
  laneTurnZA: 26, // B minions marching toward core A turn here
  laneTurnZB: 114, // A minions marching toward core B turn here
  midZ: 70,
} as const;

// Hero (re)spawn point for a team: the pad behind its own core.
export function mobaHeroSpawn(team: MobaTeam): LanePoint {
  return team === 'A' ? { ...MOBA_MAP.heroSpawnA } : { ...MOBA_MAP.heroSpawnB };
}

// Minion spawn point for a team and lane.
export function mobaMinionSpawn(team: MobaTeam, lane: MobaLaneIndex): LanePoint {
  return { x: MOBA_LANE_XS[lane], z: team === 'A' ? MOBA_MAP.minionSpawnZA : MOBA_MAP.minionSpawnZB };
}

// Tower positions for a team and lane, [inner, outer].
export function mobaTowerPoints(team: MobaTeam, lane: MobaLaneIndex): LanePoint[] {
  const zs = team === 'A' ? MOBA_MAP.towerZA : MOBA_MAP.towerZB;
  return zs.map((z) => ({ x: MOBA_LANE_XS[lane], z }));
}

// The enemy core a team is trying to destroy.
export function mobaEnemyCore(team: MobaTeam): LanePoint {
  return team === 'A' ? { ...MOBA_MAP.coreB } : { ...MOBA_MAP.coreA };
}

export function mobaEnemyTeam(team: MobaTeam): MobaTeam {
  return team === 'A' ? 'B' : 'A';
}

// Which team a structure at instance-local z belongs to (low-z half = A).
export function mobaTeamForZ(z: number): MobaTeam {
  return z < MOBA_MAP.midZ ? 'A' : 'B';
}

// Which lane an instance-local x belongs to (nearest lane centreline).
export function mobaLaneForX(x: number): MobaLaneIndex {
  let best: MobaLaneIndex = 0;
  let bestD = Infinity;
  for (let i = 0; i < MOBA_LANE_XS.length; i++) {
    const d = Math.abs(x - MOBA_LANE_XS[i]);
    if (d < bestD) { bestD = d; best = i as MobaLaneIndex; }
  }
  return best;
}

// The point a marching minion heads for, given its team, lane, and current
// instance-local z. Two segments: hold the lane centreline until the far turn
// point, then swing toward the enemy core.
export function mobaMinionMarchTarget(team: MobaTeam, lane: MobaLaneIndex, localZ: number): LanePoint {
  if (team === 'A') {
    if (localZ < MOBA_MAP.laneTurnZB) return { x: MOBA_LANE_XS[lane], z: MOBA_MAP.laneTurnZB };
    return { ...MOBA_MAP.coreB };
  }
  if (localZ > MOBA_MAP.laneTurnZA) return { x: MOBA_LANE_XS[lane], z: MOBA_MAP.laneTurnZA };
  return { ...MOBA_MAP.coreA };
}

// --- Timing / wave constants ---
export const MOBA_FIRST_WAVE_SEC = 15; // first minion wave after match start
export const MOBA_WAVE_INTERVAL_SEC = 30; // a wave down every lane every 30s
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
