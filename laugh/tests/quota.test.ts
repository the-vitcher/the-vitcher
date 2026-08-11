import { describe, expect, it } from 'vitest';
import { parseIso8601Duration } from '../core/duration';
import {
  canAfford,
  charge,
  costOf,
  DAILY_UNITS,
  emptyLedger,
  normalizeLedger,
  quotaDay,
  remaining,
  SEARCH_RESERVE,
} from '../core/quota';

// Midday Pacific, safely inside one calendar day in that zone.
const NOW = Date.parse('2026-03-10T20:00:00Z');

describe('parseIso8601Duration', () => {
  it('reads the shapes YouTube emits', () => {
    expect(parseIso8601Duration('PT3M32S')).toBe(212);
    expect(parseIso8601Duration('PT1H2M3S')).toBe(3723);
    expect(parseIso8601Duration('PT45S')).toBe(45);
    expect(parseIso8601Duration('PT2H')).toBe(7200);
  });

  it('handles days and weeks', () => {
    expect(parseIso8601Duration('P1D')).toBe(86_400);
    expect(parseIso8601Duration('P1W')).toBe(604_800);
  });

  it('reads fractional seconds', () => {
    expect(parseIso8601Duration('PT1.5S')).toBe(1.5);
  });

  it('rejects junk rather than returning NaN', () => {
    expect(parseIso8601Duration('nonsense')).toBeUndefined();
    expect(parseIso8601Duration('')).toBeUndefined();
    expect(parseIso8601Duration('PT')).toBeUndefined();
    expect(parseIso8601Duration('P')).toBeUndefined();
    expect(parseIso8601Duration(null)).toBeUndefined();
    expect(parseIso8601Duration(42)).toBeUndefined();
  });

  it('reads the P0D a live stream reports as zero', () => {
    expect(parseIso8601Duration('P0D')).toBe(0);
  });
});

describe('quotaDay', () => {
  it('rolls at midnight Pacific standard time, an 08:00 UTC boundary in winter', () => {
    expect(quotaDay(Date.parse('2026-01-15T07:59:00Z'))).toBe('2026-01-14');
    expect(quotaDay(Date.parse('2026-01-15T08:00:00Z'))).toBe('2026-01-15');
  });

  it('follows the shift to daylight time, a 07:00 UTC boundary in summer', () => {
    // Proves the boundary tracks the zone rather than a hardcoded offset: the same
    // 07:30 UTC instant falls on different sides of it in January and in July.
    expect(quotaDay(Date.parse('2026-07-15T06:59:00Z'))).toBe('2026-07-14');
    expect(quotaDay(Date.parse('2026-07-15T07:00:00Z'))).toBe('2026-07-15');
    expect(quotaDay(Date.parse('2026-01-15T07:30:00Z'))).toBe('2026-01-14');
    expect(quotaDay(Date.parse('2026-07-15T07:30:00Z'))).toBe('2026-07-15');
  });

  it('is not simply the UTC date', () => {
    expect(quotaDay(Date.parse('2026-01-15T03:00:00Z'))).toBe('2026-01-14');
  });
});

describe('normalizeLedger', () => {
  it('starts fresh for junk', () => {
    expect(normalizeLedger(null, NOW)).toEqual({ day: quotaDay(NOW), spent: 0 });
    expect(normalizeLedger('nope', NOW)).toEqual({ day: quotaDay(NOW), spent: 0 });
  });

  it('keeps today spend', () => {
    const ledger = { day: quotaDay(NOW), spent: 250 };
    expect(normalizeLedger(ledger, NOW)).toEqual(ledger);
  });

  it('rolls over when the Pacific date has moved on', () => {
    const yesterday = { day: '2026-03-09', spent: 9_000 };
    expect(normalizeLedger(yesterday, NOW).spent).toBe(0);
  });

  it('refuses a negative spend', () => {
    expect(normalizeLedger({ day: quotaDay(NOW), spent: -5 }, NOW).spent).toBe(0);
  });
});

describe('costOf', () => {
  it('prices the expensive call apart from the cheap ones', () => {
    expect(costOf('search')).toBe(100);
    expect(costOf('videos')).toBe(1);
    expect(costOf('channels')).toBe(1);
    expect(costOf('playlistItems')).toBe(1);
    expect(costOf('playlistItems', 8)).toBe(8);
  });
});

describe('canAfford and charge', () => {
  it('allows cheap calls out of a fresh budget', () => {
    expect(canAfford(emptyLedger(NOW), NOW, 'playlistItems', 8)).toBe(true);
  });

  it('accumulates spend', () => {
    let ledger = emptyLedger(NOW);
    ledger = charge(ledger, NOW, 'channels');
    ledger = charge(ledger, NOW, 'playlistItems', 6);
    ledger = charge(ledger, NOW, 'videos', 2);
    expect(ledger.spent).toBe(9);
    expect(remaining(ledger, NOW)).toBe(DAILY_UNITS - 9);
  });

  it('refuses a search that would eat into the reserve', () => {
    const nearlySpent = { day: quotaDay(NOW), spent: DAILY_UNITS - SEARCH_RESERVE - 50 };
    expect(canAfford(nearlySpent, NOW, 'search')).toBe(false);
    // The cheap calls may still run below the reserve.
    expect(canAfford(nearlySpent, NOW, 'videos')).toBe(true);
  });

  it('allows a search while the reserve stays intact', () => {
    const ledger = { day: quotaDay(NOW), spent: 100 };
    expect(canAfford(ledger, NOW, 'search')).toBe(true);
  });

  it('refuses everything once the day is exhausted', () => {
    const spent = { day: quotaDay(NOW), spent: DAILY_UNITS };
    expect(canAfford(spent, NOW, 'videos')).toBe(false);
    expect(remaining(spent, NOW)).toBe(0);
  });

  it('treats a stale ledger as a fresh day', () => {
    const stale = { day: '2026-01-01', spent: DAILY_UNITS };
    expect(canAfford(stale, NOW, 'search')).toBe(true);
  });
});
