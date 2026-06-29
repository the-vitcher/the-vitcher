// The Crawl "season" clock: a fresh run starts every hour, 24 per day.
//
// Pure and host-agnostic. The deterministic sim must never read wall-clock time
// (see sim/CLAUDE.md), so the SERVER passes a wall-clock epoch (seconds) into
// these helpers to decide which run is live and when the next one begins; the sim
// itself only acts when told to (Sim.startCrawlRun). Every function here is a pure
// function of its inputs, so runs are reproducible and testable.

/** Length of one Crawl run, in seconds. One hour. */
export const RUN_DURATION_SEC = 3600;

/** Runs per day. 24 one-hour runs tile a 24-hour day exactly. */
export const RUNS_PER_DAY = 24;

/** Absolute run index since the epoch (monotonic; increments every hour). */
export function runIndexAt(epochSec: number): number {
  return Math.floor(epochSec / RUN_DURATION_SEC);
}

/** Epoch-seconds at which a given run index began. */
export function runStartEpoch(runIndex: number): number {
  return runIndex * RUN_DURATION_SEC;
}

/** Seconds elapsed into the current run [0, RUN_DURATION_SEC). */
export function secondsIntoRun(epochSec: number): number {
  return epochSec - runStartEpoch(runIndexAt(epochSec));
}

/** Seconds remaining until the current run ends and the next begins (1..RUN_DURATION_SEC). */
export function secondsLeftInRun(epochSec: number): number {
  return RUN_DURATION_SEC - secondsIntoRun(epochSec);
}

/** Which of the day's 24 runs this is (0..23), for display ("Run 14 of 24"). */
export function runOfDay(epochSec: number): number {
  return ((runIndexAt(epochSec) % RUNS_PER_DAY) + RUNS_PER_DAY) % RUNS_PER_DAY;
}

/**
 * Deterministic per-run world seed: mixes a fixed base seed with the run index so
 * each hourly run generates a fresh, reproducible world. mulberry32-style integer
 * mix, kept in unsigned 32-bit space to match sim/rng.ts.
 */
export function runSeed(baseSeed: number, runIndex: number): number {
  let h = (baseSeed ^ Math.imul(runIndex + 1, 0x9e3779b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}
