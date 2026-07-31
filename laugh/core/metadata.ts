// Choosing the best title and channel from the several places YouTube exposes them.
//
// The DOM adapter scrapes raw candidate strings in stability order and hands them
// here. Keeping the choice pure means the brittle part (selectors) stays in one thin
// file and the logic is unit-testable without a browser.

import type { VideoMeta } from './types';

const TITLE_SUFFIX = /\s+-\s+YouTube\s*$/;
const NOTIFICATION_PREFIX = /^\(\d+\)\s*/;

/** Strip the decorations YouTube adds to document.title. */
export function cleanTitle(raw: string): string {
  return raw.replace(NOTIFICATION_PREFIX, '').replace(TITLE_SUFFIX, '').trim();
}

const PLACEHOLDER_TITLES = new Set(['youtube', 'untitled video', '']);

function usableTitle(value: string | null | undefined): string | null {
  if (!value) return null;
  const cleaned = cleanTitle(value);
  if (PLACEHOLDER_TITLES.has(cleaned.toLowerCase())) return null;
  return cleaned;
}

/**
 * First usable candidate wins, so callers pass them most-stable first
 * (meta tags, then document.title, then ytd-* selectors).
 */
export function pickTitle(candidates: Array<string | null | undefined>): string {
  for (const candidate of candidates) {
    const title = usableTitle(candidate);
    if (title) return title;
  }
  return 'Untitled video';
}

const PLACEHOLDER_CHANNELS = new Set(['', 'youtube', 'unknown channel']);

function usableChannel(value: string | null | undefined): string | null {
  if (!value) return null;
  const cleaned = value.trim().replace(/^@/, '');
  if (PLACEHOLDER_CHANNELS.has(cleaned.toLowerCase())) return null;
  return cleaned;
}

export function pickChannelName(candidates: Array<string | null | undefined>): string {
  for (const candidate of candidates) {
    const name = usableChannel(candidate);
    if (name) return name;
  }
  return 'Unknown channel';
}

const CHANNEL_ID_PATTERN = /^UC[A-Za-z0-9_-]{22}$/;

/** Channel ids have a fixed shape, so a bad scrape is easy to reject. */
export function pickChannelId(candidates: Array<string | null | undefined>): string | undefined {
  for (const candidate of candidates) {
    if (!candidate) continue;
    const trimmed = candidate.trim();
    if (CHANNEL_ID_PATTERN.test(trimmed)) return trimmed;
    // Also accept a full channel URL and pull the id out of it.
    const match = trimmed.match(/\/channel\/(UC[A-Za-z0-9_-]{22})/);
    if (match) return match[1];
  }
  return undefined;
}

export type ScrapedMetadata = {
  videoId: string;
  titleCandidates: Array<string | null | undefined>;
  channelNameCandidates: Array<string | null | undefined>;
  channelIdCandidates: Array<string | null | undefined>;
  durationSec?: number;
  capturedAt: number;
};

export function buildVideoMeta(scraped: ScrapedMetadata): VideoMeta {
  const meta: VideoMeta = {
    videoId: scraped.videoId,
    title: pickTitle(scraped.titleCandidates),
    channelName: pickChannelName(scraped.channelNameCandidates),
    capturedAt: scraped.capturedAt,
  };
  const channelId = pickChannelId(scraped.channelIdCandidates);
  if (channelId) meta.channelId = channelId;
  if (typeof scraped.durationSec === 'number' && Number.isFinite(scraped.durationSec) && scraped.durationSec > 0) {
    meta.durationSec = scraped.durationSec;
  }
  return meta;
}

/** Group key for the profile: prefer the stable id, fall back to the display name. */
export function channelKey(meta: { channelId?: string; channelName: string }): string {
  return meta.channelId ? `id:${meta.channelId}` : `name:${meta.channelName.toLowerCase()}`;
}
