// localStorage persistence for the Grayscale app. Host-side on purpose: the
// core is pure and never touches storage, so this is the only module that knows
// the app has a disk at all.
//
// Everything read back is untrusted (a user can edit localStorage by hand, and
// an older build may have written an older shape), so `load` revalidates every
// field and falls back to a fresh state rather than trusting what it finds.

import { type GrayscaleState, initialState } from './core';

const STORAGE_KEY = 'grayscale.state.v1';

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function sanitizeSessions(raw: unknown): GrayscaleState['sessions'] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((entry): entry is { startedAtMs: number; endedAtMs: number } =>
      !!entry && typeof entry === 'object'
      && isFiniteNumber((entry as { startedAtMs?: unknown }).startedAtMs)
      && isFiniteNumber((entry as { endedAtMs?: unknown }).endedAtMs))
    .filter((entry) => entry.endedAtMs > entry.startedAtMs)
    .map((entry) => ({ startedAtMs: entry.startedAtMs, endedAtMs: entry.endedAtMs }));
}

function sanitizeStringList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((entry): entry is string => typeof entry === 'string');
}

/** Reads the stored state, or a fresh one when there is nothing valid to read. */
export function load(): GrayscaleState {
  let parsed: unknown;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return initialState();
    parsed = JSON.parse(stored);
  } catch {
    // Storage blocked, quota-evicted, or holding malformed JSON: start clean.
    return initialState();
  }
  if (!parsed || typeof parsed !== 'object') return initialState();

  const raw = parsed as Record<string, unknown>;
  const base = initialState();
  return {
    sessions: sanitizeSessions(raw.sessions),
    activeSince: isFiniteNumber(raw.activeSince) ? raw.activeSince : null,
    spentMinutes: isFiniteNumber(raw.spentMinutes) ? Math.max(0, Math.floor(raw.spentMinutes)) : 0,
    // Run records are render-only history; a malformed log costs a log, not a save.
    runs: Array.isArray(raw.runs) ? (raw.runs as GrayscaleState['runs']) : base.runs,
    clearedRaidIds: sanitizeStringList(raw.clearedRaidIds),
    runCounter: isFiniteNumber(raw.runCounter) ? Math.max(0, Math.floor(raw.runCounter)) : 0,
  };
}

/** Persists the state. Returns false when storage is unavailable or full. */
export function save(state: GrayscaleState): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}
