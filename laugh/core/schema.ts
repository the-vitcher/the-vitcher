// Storage envelope and forward migration.
//
// Keys are version-prefixed so the shape can change without losing data. Everything
// here is pure: the chrome.storage calls live in ext/storage.ts.

import { normalizeMoments } from './moment';
import { DEFAULT_SETTINGS } from './types';
import type { LaughMoment, Settings, TasteProfile } from './types';

export const SCHEMA_VERSION = 1;

export const STORAGE_KEYS = {
  moments: 'laugh:v1:moments',
  settings: 'laugh:v1:settings',
  profileCache: 'laugh:v1:profileCache',
} as const;

export type ProfileCache = {
  profile: TasteProfile;
  momentCountAtCompute: number;
  clusterWindowAtCompute: number;
};

function clampNumber(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

/** Validate settings read back from storage or a JSON import. */
export function normalizeSettings(raw: unknown): Settings {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_SETTINGS };
  const r = raw as Record<string, unknown>;
  return {
    lookbackSec: clampNumber(r.lookbackSec, DEFAULT_SETTINGS.lookbackSec, 0, 15),
    clusterWindowSec: clampNumber(r.clusterWindowSec, DEFAULT_SETTINGS.clusterWindowSec, 0, 60),
    showPlayerButton: asBoolean(r.showPlayerButton, DEFAULT_SETTINGS.showPlayerButton),
    inPageHotkey: asBoolean(r.inPageHotkey, DEFAULT_SETTINGS.inPageHotkey),
    apiKey: typeof r.apiKey === 'string' ? r.apiKey.trim() : '',
  };
}

/** True when the cached profile can still be trusted. */
export function isProfileCacheValid(
  cache: ProfileCache | null,
  momentCount: number,
  clusterWindowSec: number,
): boolean {
  if (!cache || !cache.profile) return false;
  if (cache.profile.version !== SCHEMA_VERSION) return false;
  return cache.momentCountAtCompute === momentCount && cache.clusterWindowAtCompute === clusterWindowSec;
}

export type ExportBundle = {
  app: 'laugh';
  schemaVersion: number;
  exportedAt: number;
  moments: LaughMoment[];
  settings: Settings;
};

export function buildExportBundle(moments: LaughMoment[], settings: Settings, now: number): ExportBundle {
  // The API key is a credential, not data. It never leaves storage in an export.
  const { apiKey: _apiKey, ...safeSettings } = settings;
  return {
    app: 'laugh',
    schemaVersion: SCHEMA_VERSION,
    exportedAt: now,
    moments,
    settings: { ...safeSettings, apiKey: '' },
  };
}

export type ImportResult = {
  ok: boolean;
  moments: LaughMoment[];
  settings: Settings | null;
  error?: string;
};

/** Parse an import bundle defensively. A malformed file must never wipe stored data. */
export function parseImportBundle(raw: unknown, now: number): ImportResult {
  if (!raw || typeof raw !== 'object') {
    return { ok: false, moments: [], settings: null, error: 'File is not a Laugh export.' };
  }
  const r = raw as Record<string, unknown>;
  if (r.app !== 'laugh') {
    return { ok: false, moments: [], settings: null, error: 'File is not a Laugh export.' };
  }
  const moments = normalizeMoments(r.moments, now);
  if (moments.length === 0) {
    return { ok: false, moments: [], settings: null, error: 'No usable moments in that file.' };
  }
  return {
    ok: true,
    moments,
    settings: r.settings ? normalizeSettings(r.settings) : null,
  };
}

/** Merge imported moments into existing ones, preferring the newer mark on a clash. */
export function mergeMoments(existing: LaughMoment[], incoming: LaughMoment[]): LaughMoment[] {
  const byId = new Map(existing.map((m) => [m.id, m]));
  for (const moment of incoming) {
    const current = byId.get(moment.id);
    if (!current || moment.markedAt > current.markedAt) byId.set(moment.id, moment);
  }
  return [...byId.values()];
}
