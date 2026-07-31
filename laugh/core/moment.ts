// Building and normalizing laugh moments.
//
// The reaction-lag problem: you laugh, then you reach for the key, so the press
// lands one to three seconds after the punchline. We store the raw press time and
// derive the punchline estimate from it, which means the lookback can be re-tuned
// later and every historical moment re-derives correctly.

import type { LaughMoment, VideoMeta } from './types';
import { isVideoId } from './video_id';

/** Punchline estimate. Clamps at zero so the start of a video cannot go negative. */
export function deriveTSec(pressedAtSec: number, lookbackSec: number): number {
  if (!Number.isFinite(pressedAtSec)) return 0;
  const lookback = Number.isFinite(lookbackSec) ? Math.max(0, lookbackSec) : 0;
  return Math.max(0, round1(pressedAtSec - lookback));
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/**
 * Stable id, so double-firing the hotkey path (browser command plus in-page
 * listener) within the same second cannot create two rows for one press.
 */
export function momentId(videoId: string, pressedAtSec: number): string {
  return `${videoId}:${Math.round(Math.max(0, pressedAtSec))}`;
}

export type CreateMomentInput = {
  video: VideoMeta;
  pressedAtSec: number;
  lookbackSec: number;
  markedAt: number;
};

export function createMoment(input: CreateMomentInput): LaughMoment {
  const pressedAtSec = Math.max(0, round1(input.pressedAtSec));
  return {
    id: momentId(input.video.videoId, pressedAtSec),
    videoId: input.video.videoId,
    pressedAtSec,
    lookbackSec: Math.max(0, input.lookbackSec),
    tSec: deriveTSec(pressedAtSec, input.lookbackSec),
    markedAt: input.markedAt,
    video: input.video,
  };
}

/** Re-derive tSec under a new lookback. Used when the offset is changed in options. */
export function retimeMoment(moment: LaughMoment, lookbackSec: number): LaughMoment {
  return {
    ...moment,
    lookbackSec: Math.max(0, lookbackSec),
    tSec: deriveTSec(moment.pressedAtSec, lookbackSec),
  };
}

export function retimeAll(moments: LaughMoment[], lookbackSec: number): LaughMoment[] {
  return moments.map((m) => retimeMoment(m, lookbackSec));
}

/** Newest first, the order the feed wants. */
export function sortByMarkedAtDesc(moments: LaughMoment[]): LaughMoment[] {
  return [...moments].sort((a, b) => b.markedAt - a.markedAt);
}

/** Drop a moment by id, returning a new array. */
export function removeMoment(moments: LaughMoment[], id: string): LaughMoment[] {
  return moments.filter((m) => m.id !== id);
}

/**
 * Insert or replace by id. Replacing keeps imports and rapid re-presses idempotent
 * rather than growing duplicate rows.
 */
export function upsertMoment(moments: LaughMoment[], moment: LaughMoment): LaughMoment[] {
  const index = moments.findIndex((m) => m.id === moment.id);
  if (index === -1) return [...moments, moment];
  const next = [...moments];
  next[index] = moment;
  return next;
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function asFiniteNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/**
 * Validate untrusted input from storage or a JSON import. Returns null rather than
 * throwing so one bad row cannot take down the whole feed.
 */
export function normalizeMoment(raw: unknown, now: number): LaughMoment | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;

  const rawVideo = (r.video && typeof r.video === 'object' ? r.video : {}) as Record<string, unknown>;
  const videoId = isVideoId(asString(r.videoId))
    ? asString(r.videoId)
    : isVideoId(asString(rawVideo.videoId))
      ? asString(rawVideo.videoId)
      : null;
  if (!videoId) return null;

  const pressedAtSec = Math.max(0, round1(asFiniteNumber(r.pressedAtSec, asFiniteNumber(r.tSec, 0))));
  const lookbackSec = Math.max(0, asFiniteNumber(r.lookbackSec, 0));
  const durationSec = asFiniteNumber(rawVideo.durationSec, NaN);

  const video: VideoMeta = {
    videoId,
    title: asString(rawVideo.title) || 'Untitled video',
    channelName: asString(rawVideo.channelName) || 'Unknown channel',
    capturedAt: asFiniteNumber(rawVideo.capturedAt, now),
  };
  const channelId = asString(rawVideo.channelId);
  if (channelId) video.channelId = channelId;
  if (Number.isFinite(durationSec) && durationSec > 0) video.durationSec = durationSec;

  return {
    id: asString(r.id) || momentId(videoId, pressedAtSec),
    videoId,
    pressedAtSec,
    lookbackSec,
    tSec: Math.max(0, asFiniteNumber(r.tSec, deriveTSec(pressedAtSec, lookbackSec))),
    markedAt: asFiniteNumber(r.markedAt, now),
    video,
  };
}

/** Normalize a whole array, dropping unrecoverable rows and de-duplicating by id. */
export function normalizeMoments(raw: unknown, now: number): LaughMoment[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Map<string, LaughMoment>();
  for (const entry of raw) {
    const moment = normalizeMoment(entry, now);
    if (moment) seen.set(moment.id, moment);
  }
  return [...seen.values()];
}
