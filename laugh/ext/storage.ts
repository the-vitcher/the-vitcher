// chrome.storage access, serialized.
//
// Two fast presses would otherwise both read the array, both write, and one would
// lose. Every mutation goes through one promise chain, and only the service worker
// imports the write half of this module.
//
// MV3 workers are killed when idle, so nothing here may rely on module state
// surviving between wakes. The chain only has to hold within a single wake, which is
// exactly as long as a read-modify-write takes.

import { clusterMoments } from '../core/cluster';
import { normalizeMoments, removeMoment, retimeAll, upsertMoment } from '../core/moment';
import {
  isProfileCacheValid,
  mergeMoments,
  normalizeSettings,
  STORAGE_KEYS,
  type ProfileCache,
} from '../core/schema';
import { buildProfile } from '../core/profile';
import type { LaughMoment, Settings, TasteProfile } from '../core/types';

let chain: Promise<unknown> = Promise.resolve();

/** Run `task` after every previously queued task, whether those settled or threw. */
function serialize<T>(task: () => Promise<T>): Promise<T> {
  const next = chain.then(task, task);
  // Swallow on the stored chain only, so one failure cannot poison the queue while
  // the caller still sees its own rejection.
  chain = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
}

export async function readSettings(): Promise<Settings> {
  const stored = await chrome.storage.local.get(STORAGE_KEYS.settings);
  return normalizeSettings(stored[STORAGE_KEYS.settings]);
}

export async function readMoments(): Promise<LaughMoment[]> {
  const stored = await chrome.storage.local.get(STORAGE_KEYS.moments);
  return normalizeMoments(stored[STORAGE_KEYS.moments], Date.now());
}

export function saveSettings(settings: Settings): Promise<Settings> {
  return serialize(async () => {
    const normalized = normalizeSettings(settings);
    await chrome.storage.local.set({ [STORAGE_KEYS.settings]: normalized });
    return normalized;
  });
}

export type AddMomentResult = {
  moment: LaughMoment;
  intensity: number;
  totalMoments: number;
};

/** Append a press and report the size of the episode it landed in. */
export function addMoment(moment: LaughMoment): Promise<AddMomentResult> {
  return serialize(async () => {
    const moments = await readMoments();
    const next = upsertMoment(moments, moment);
    await chrome.storage.local.set({ [STORAGE_KEYS.moments]: next });

    const settings = await readSettings();
    const episodes = clusterMoments(
      next.filter((m) => m.videoId === moment.videoId),
      settings.clusterWindowSec,
    );
    const episode = episodes.find((e) => e.moments.some((m) => m.id === moment.id));

    return { moment, intensity: episode?.intensity ?? 1, totalMoments: next.length };
  });
}

/**
 * Re-derive every stored punchline estimate under a new lookback. This is why the
 * raw press time is kept: retuning the offset fixes history instead of only
 * affecting future marks.
 */
export function retimeMoments(lookbackSec: number): Promise<LaughMoment[]> {
  return serialize(async () => {
    const next = retimeAll(await readMoments(), lookbackSec);
    await chrome.storage.local.set({ [STORAGE_KEYS.moments]: next });
    return next;
  });
}

export function deleteMoment(id: string): Promise<LaughMoment[]> {
  return serialize(async () => {
    const next = removeMoment(await readMoments(), id);
    await chrome.storage.local.set({ [STORAGE_KEYS.moments]: next });
    return next;
  });
}

export function deleteVideo(videoId: string): Promise<LaughMoment[]> {
  return serialize(async () => {
    const next = (await readMoments()).filter((m) => m.videoId !== videoId);
    await chrome.storage.local.set({ [STORAGE_KEYS.moments]: next });
    return next;
  });
}

/** Wipes moments and the cached profile. Settings, including the API key, survive. */
export function clearAllMoments(): Promise<void> {
  return serialize(async () => {
    await chrome.storage.local.set({ [STORAGE_KEYS.moments]: [] });
    await chrome.storage.local.remove(STORAGE_KEYS.profileCache);
  });
}

export function importMoments(incoming: LaughMoment[]): Promise<{ imported: number; total: number }> {
  return serialize(async () => {
    const existing = await readMoments();
    const merged = mergeMoments(existing, incoming);
    await chrome.storage.local.set({ [STORAGE_KEYS.moments]: merged });
    return { imported: merged.length - existing.length, total: merged.length };
  });
}

/**
 * The profile is derived, so it is cached only to avoid recomputing on every popup
 * open. The cache is keyed on the inputs that can change it.
 */
export async function getProfile(): Promise<TasteProfile> {
  const [moments, settings] = await Promise.all([readMoments(), readSettings()]);
  const stored = await chrome.storage.local.get(STORAGE_KEYS.profileCache);
  const cache = (stored[STORAGE_KEYS.profileCache] ?? null) as ProfileCache | null;

  if (isProfileCacheValid(cache, moments.length, settings.clusterWindowSec, settings.lookbackSec)) {
    return cache!.profile;
  }

  const profile = buildProfile(moments, {
    clusterWindowSec: settings.clusterWindowSec,
    now: Date.now(),
  });

  const nextCache: ProfileCache = {
    profile,
    momentCountAtCompute: moments.length,
    clusterWindowAtCompute: settings.clusterWindowSec,
    lookbackAtCompute: settings.lookbackSec,
  };
  await chrome.storage.local.set({ [STORAGE_KEYS.profileCache]: nextCache });

  return profile;
}
