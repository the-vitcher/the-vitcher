// Parsing YouTube Data API responses.
//
// Everything here treats the payload as untrusted: it is network JSON, and one
// unexpected shape must not take down a refresh. Every parser skips what it cannot
// read rather than throwing, and every parser is pure so it can be tested against
// fixtures with no network.

import { parseIso8601Duration } from './duration';
import { isVideoId } from './video_id';
import type { Candidate } from './types';

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/** An API error body carries a message worth surfacing rather than swallowing. */
export function parseApiError(payload: unknown): string | null {
  const error = asRecord(asRecord(payload).error);
  const message = asString(error.message);
  if (!message) return null;

  const reason = asString(asRecord(asArray(error.errors)[0]).reason);
  if (reason === 'quotaExceeded') return 'YouTube API quota is exhausted for today.';
  if (reason === 'keyInvalid' || reason === 'badRequest') return 'That YouTube API key was rejected.';
  return message;
}

/** channels.list?part=contentDetails -> channel id to uploads playlist id. */
export function parseUploadsPlaylists(payload: unknown): Map<string, string> {
  const result = new Map<string, string>();

  for (const item of asArray(asRecord(payload).items)) {
    const record = asRecord(item);
    const channelId = asString(record.id);
    const playlistId = asString(asRecord(asRecord(record.contentDetails).relatedPlaylists).uploads);
    if (channelId && playlistId) result.set(channelId, playlistId);
  }

  return result;
}

/** playlistItems.list?part=contentDetails -> video ids, newest first as returned. */
export function parsePlaylistVideoIds(payload: unknown): string[] {
  const ids: string[] = [];

  for (const item of asArray(asRecord(payload).items)) {
    const id = asString(asRecord(asRecord(item).contentDetails).videoId);
    if (isVideoId(id)) ids.push(id);
  }

  return ids;
}

/** search.list?part=snippet&type=video -> video ids. */
export function parseSearchVideoIds(payload: unknown): string[] {
  const ids: string[] = [];

  for (const item of asArray(asRecord(payload).items)) {
    const id = asString(asRecord(asRecord(item).id).videoId);
    if (isVideoId(id)) ids.push(id);
  }

  return ids;
}

/**
 * videos.list?part=snippet,contentDetails -> candidates.
 *
 * Live broadcasts and anything without a readable runtime are dropped: the position
 * signal needs a duration, and a live stream has no meaningful one.
 */
export function parseVideoCandidates(payload: unknown): Candidate[] {
  const candidates: Candidate[] = [];

  for (const item of asArray(asRecord(payload).items)) {
    const record = asRecord(item);
    const videoId = asString(record.id);
    if (!isVideoId(videoId)) continue;

    const snippet = asRecord(record.snippet);
    const title = asString(snippet.title);
    if (!title) continue;

    if (asString(snippet.liveBroadcastContent) === 'live') continue;

    const candidate: Candidate = {
      videoId,
      title,
      channelName: asString(snippet.channelTitle) || 'Unknown channel',
    };

    const channelId = asString(snippet.channelId);
    if (channelId) candidate.channelId = channelId;

    const publishedAt = Date.parse(asString(snippet.publishedAt));
    if (Number.isFinite(publishedAt)) candidate.publishedAt = publishedAt;

    const durationSec = parseIso8601Duration(asRecord(record.contentDetails).duration);
    if (durationSec !== undefined && durationSec > 0) candidate.durationSec = durationSec;

    candidates.push(candidate);
  }

  return candidates;
}

/** Split ids into the 50-per-call batches videos.list accepts. */
export function batchIds(ids: string[], size = 50): string[][] {
  const unique = [...new Set(ids)];
  const batches: string[][] = [];
  for (let i = 0; i < unique.length; i += size) batches.push(unique.slice(i, i + size));
  return batches;
}
