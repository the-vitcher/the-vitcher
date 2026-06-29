import { describe, expect, it } from 'vitest';
import {
  RUN_DURATION_SEC, RUNS_PER_DAY, runIndexAt, runStartEpoch,
  secondsIntoRun, secondsLeftInRun, runOfDay, runSeed,
} from '../src/sim/crawl_run';

describe('The Crawl season clock', () => {
  it('runs one hour, 24 per day', () => {
    expect(RUN_DURATION_SEC).toBe(3600);
    expect(RUNS_PER_DAY).toBe(24);
    expect(RUN_DURATION_SEC * RUNS_PER_DAY).toBe(86400); // tiles a full day
  });

  it('increments the run index every hour, on the hour', () => {
    expect(runIndexAt(0)).toBe(0);
    expect(runIndexAt(3599)).toBe(0);
    expect(runIndexAt(3600)).toBe(1);
    expect(runIndexAt(7200)).toBe(2);
    expect(runStartEpoch(2)).toBe(7200);
  });

  it('reports time into and left in the current run', () => {
    expect(secondsIntoRun(0)).toBe(0);
    expect(secondsIntoRun(3601)).toBe(1);
    expect(secondsLeftInRun(0)).toBe(3600);
    expect(secondsLeftInRun(3599)).toBe(1);
    expect(secondsLeftInRun(3600)).toBe(3600); // wraps for the next run
  });

  it('cycles the day through 24 runs', () => {
    expect(runOfDay(0)).toBe(0);
    expect(runOfDay(23 * 3600)).toBe(23);
    expect(runOfDay(24 * 3600)).toBe(0); // 25th run is run 0 of the next day
    expect(runOfDay(25 * 3600)).toBe(1);
  });

  it('derives a distinct, deterministic world seed per run', () => {
    const base = 20061;
    expect(runSeed(base, 5)).toBe(runSeed(base, 5)); // reproducible
    expect(runSeed(base, 5)).not.toBe(runSeed(base, 6)); // fresh world each run
    // unsigned 32-bit
    for (let i = 0; i < 100; i++) {
      const s = runSeed(base, i);
      expect(Number.isInteger(s)).toBe(true);
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThanOrEqual(0xffffffff);
    }
  });
});
