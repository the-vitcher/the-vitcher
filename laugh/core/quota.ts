// YouTube Data API quota accounting.
//
// The free tier is 10,000 units a day and the costs are wildly uneven, so spending
// has to be tracked rather than hoped about. A single careless search.list loop
// burns the day; a playlist walk costs almost nothing.
//
// Google resets the quota at midnight Pacific, not UTC and not local, so the ledger
// is keyed on the Pacific calendar date.

export const DAILY_UNITS = 10_000;

export const COSTS = {
  /** The expensive one. Roughly 100 calls a day and the budget is gone. */
  search: 100,
  /** Up to 50 ids per call, so hydration is effectively free. */
  videos: 1,
  channels: 1,
  playlistItems: 1,
} as const;

export type QuotaCall = keyof typeof COSTS;

export type QuotaLedger = {
  /** Pacific calendar date, YYYY-MM-DD. */
  day: string;
  spent: number;
};

/**
 * Never spend below this many remaining units on a search. It keeps a reserve for
 * the cheap calls that actually produce candidates.
 */
export const SEARCH_RESERVE = 2_000;

const PACIFIC_DAY = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Los_Angeles',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

export function quotaDay(now: number): string {
  return PACIFIC_DAY.format(new Date(now));
}

export function emptyLedger(now: number): QuotaLedger {
  return { day: quotaDay(now), spent: 0 };
}

/** Reads a ledger back, rolling it over when the Pacific date has moved on. */
export function normalizeLedger(raw: unknown, now: number): QuotaLedger {
  const today = quotaDay(now);
  if (!raw || typeof raw !== 'object') return { day: today, spent: 0 };

  const r = raw as Record<string, unknown>;
  if (typeof r.day !== 'string' || r.day !== today) return { day: today, spent: 0 };

  const spent = typeof r.spent === 'number' && Number.isFinite(r.spent) ? Math.max(0, r.spent) : 0;
  return { day: today, spent };
}

export function remaining(ledger: QuotaLedger, now: number): number {
  const current = normalizeLedger(ledger, now);
  return Math.max(0, DAILY_UNITS - current.spent);
}

export function costOf(call: QuotaCall, calls = 1): number {
  return COSTS[call] * Math.max(0, calls);
}

export function canAfford(ledger: QuotaLedger, now: number, call: QuotaCall, calls = 1): boolean {
  const need = costOf(call, calls);
  const left = remaining(ledger, now);
  // A search must leave the reserve intact; the cheap calls may spend down to zero.
  return call === 'search' ? left - need >= SEARCH_RESERVE : left >= need;
}

export function charge(ledger: QuotaLedger, now: number, call: QuotaCall, calls = 1): QuotaLedger {
  const current = normalizeLedger(ledger, now);
  return { day: current.day, spent: current.spent + costOf(call, calls) };
}

/**
 * How many units a refresh may spend in one go. Well under the daily budget, so a
 * user leaning on the refresh button cannot exhaust the day in a few clicks.
 */
export const REFRESH_BUDGET = 150;
