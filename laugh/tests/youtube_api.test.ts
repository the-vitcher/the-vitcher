// Exercises the discovery orchestrator with a fake fetch, so the whole quota-aware
// flow is covered without an API key and without touching the network.

import { describe, expect, it } from 'vitest';
import { createMoment } from '../core/moment';
import { buildProfile } from '../core/profile';
import { emptyLedger, quotaDay, DAILY_UNITS, SEARCH_RESERVE } from '../core/quota';
import { NullCandidateSource, YouTubeDataApiSource, type FetchLike } from '../ext/youtube_api';
import type { LaughMoment } from '../core/types';

const NOW = Date.parse('2026-03-10T20:00:00Z');

function moment(videoId: string, channelId: string): LaughMoment {
  return createMoment({
    video: {
      videoId,
      title: 'A deadpan sketch',
      channelName: `Channel ${channelId}`,
      channelId,
      durationSec: 600,
      capturedAt: NOW,
    },
    pressedAtSec: 100,
    lookbackSec: 0,
    markedAt: NOW,
  });
}

const PROFILE = buildProfile(
  [
    moment('aaaaaaaaaaa', 'UCaaaaaaaaaaaaaaaaaaaaaa'),
    moment('bbbbbbbbbbb', 'UCaaaaaaaaaaaaaaaaaaaaaa'),
    moment('ccccccccccc', 'UCbbbbbbbbbbbbbbbbbbbbbb'),
  ],
  { clusterWindowSec: 8, now: NOW },
);

/** Records every URL requested and replays canned payloads by endpoint. */
function fakeFetch(routes: Record<string, unknown>, options: { failOn?: string; status?: number } = {}) {
  const calls: string[] = [];

  const impl: FetchLike = async (url) => {
    calls.push(url);
    const endpoint = new URL(url).pathname.split('/').pop() ?? '';

    if (options.failOn === endpoint) {
      return {
        ok: false,
        status: options.status ?? 403,
        json: async () => ({ error: { message: 'nope', errors: [{ reason: 'quotaExceeded' }] } }),
      };
    }

    return { ok: true, status: 200, json: async () => routes[endpoint] ?? { items: [] } };
  };

  return { impl, calls };
}

const HAPPY_ROUTES = {
  channels: {
    items: [
      { id: 'UCaaaaaaaaaaaaaaaaaaaaaa', contentDetails: { relatedPlaylists: { uploads: 'UUaaa' } } },
      { id: 'UCbbbbbbbbbbbbbbbbbbbbbb', contentDetails: { relatedPlaylists: { uploads: 'UUbbb' } } },
    ],
  },
  playlistItems: { items: [{ contentDetails: { videoId: 'newvideo001' } }] },
  videos: {
    items: [
      {
        id: 'newvideo001',
        snippet: {
          title: 'Another deadpan sketch',
          channelTitle: 'Channel UCaaaaaaaaaaaaaaaaaaaaaa',
          channelId: 'UCaaaaaaaaaaaaaaaaaaaaaa',
          publishedAt: '2026-03-09T12:00:00Z',
        },
        contentDetails: { duration: 'PT9M' },
      },
    ],
  },
  search: { items: [{ id: { videoId: 'searchfound' } }] },
};

describe('NullCandidateSource', () => {
  it('reports itself unconfigured and spends nothing', async () => {
    const source = new NullCandidateSource();
    expect(source.isConfigured()).toBe(false);

    const result = await source.fetchCandidates(PROFILE, emptyLedger(NOW), NOW);
    expect(result.candidates).toEqual([]);
    expect(result.unitsSpent).toBe(0);
    expect(result.notes[0]).toContain('API key');
  });
});

describe('YouTubeDataApiSource', () => {
  it('is unconfigured without a key', () => {
    expect(new YouTubeDataApiSource({ apiKey: '  ', allowSearch: false }).isConfigured()).toBe(false);
    expect(new YouTubeDataApiSource({ apiKey: 'k', allowSearch: false }).isConfigured()).toBe(true);
  });

  it('walks channels to uploads to hydration, and returns candidates', async () => {
    const { impl, calls } = fakeFetch(HAPPY_ROUTES);
    const source = new YouTubeDataApiSource({ apiKey: 'k', allowSearch: false, fetchImpl: impl });

    const result = await source.fetchCandidates(PROFILE, emptyLedger(NOW), NOW);

    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].title).toBe('Another deadpan sketch');
    expect(result.candidates[0].durationSec).toBe(540);

    const endpoints = calls.map((url) => new URL(url).pathname.split('/').pop());
    expect(endpoints).toEqual(['channels', 'playlistItems', 'playlistItems', 'videos']);
  });

  it('costs about ten units for a full refresh, not a hundred', async () => {
    const { impl } = fakeFetch(HAPPY_ROUTES);
    const source = new YouTubeDataApiSource({ apiKey: 'k', allowSearch: false, fetchImpl: impl });

    const result = await source.fetchCandidates(PROFILE, emptyLedger(NOW), NOW);
    // 1 channels + 2 playlistItems + 1 videos.
    expect(result.unitsSpent).toBe(4);
    expect(result.ledger.spent).toBe(4);
  });

  it('never calls search unless it is explicitly allowed', async () => {
    const { impl, calls } = fakeFetch(HAPPY_ROUTES);
    const source = new YouTubeDataApiSource({ apiKey: 'k', allowSearch: false, fetchImpl: impl });

    await source.fetchCandidates(PROFILE, emptyLedger(NOW), NOW);
    expect(calls.some((url) => url.includes('/search'))).toBe(false);
  });

  it('calls search when allowed, and charges the full hundred units', async () => {
    const { impl, calls } = fakeFetch(HAPPY_ROUTES);
    const source = new YouTubeDataApiSource({ apiKey: 'k', allowSearch: true, fetchImpl: impl });

    const result = await source.fetchCandidates(PROFILE, emptyLedger(NOW), NOW);
    expect(calls.some((url) => url.includes('/search'))).toBe(true);
    expect(result.unitsSpent).toBe(104);
  });

  it('refuses to search once the reserve would be broken, but still walks channels', async () => {
    const { impl, calls } = fakeFetch(HAPPY_ROUTES);
    const source = new YouTubeDataApiSource({ apiKey: 'k', allowSearch: true, fetchImpl: impl });

    const nearlySpent = { day: quotaDay(NOW), spent: DAILY_UNITS - SEARCH_RESERVE - 10 };
    const result = await source.fetchCandidates(PROFILE, nearlySpent, NOW);

    expect(calls.some((url) => url.includes('/search'))).toBe(false);
    expect(calls.some((url) => url.includes('/channels'))).toBe(true);
    expect(result.candidates).toHaveLength(1);
  });

  it('sends the key on every request', async () => {
    const { impl, calls } = fakeFetch(HAPPY_ROUTES);
    const source = new YouTubeDataApiSource({ apiKey: 'secret', allowSearch: false, fetchImpl: impl });

    await source.fetchCandidates(PROFILE, emptyLedger(NOW), NOW);
    expect(calls.every((url) => new URL(url).searchParams.get('key') === 'secret')).toBe(true);
  });

  it('surfaces a quota error as a readable note instead of throwing', async () => {
    const { impl } = fakeFetch(HAPPY_ROUTES, { failOn: 'channels' });
    const source = new YouTubeDataApiSource({ apiKey: 'k', allowSearch: false, fetchImpl: impl });

    const result = await source.fetchCandidates(PROFILE, emptyLedger(NOW), NOW);
    expect(result.candidates).toEqual([]);
    expect(result.notes).toContain('YouTube API quota is exhausted for today.');
  });

  it('keeps going when one playlist fails', async () => {
    const calls: string[] = [];
    let playlistCalls = 0;
    const impl: FetchLike = async (url) => {
      calls.push(url);
      const endpoint = new URL(url).pathname.split('/').pop() ?? '';
      if (endpoint === 'playlistItems') {
        playlistCalls += 1;
        // First playlist is dead, second is fine.
        if (playlistCalls === 1) {
          return { ok: false, status: 404, json: async () => ({ error: { message: 'Playlist not found' } }) };
        }
      }
      return { ok: true, status: 200, json: async () => (HAPPY_ROUTES as Record<string, unknown>)[endpoint] ?? { items: [] } };
    };

    const source = new YouTubeDataApiSource({ apiKey: 'k', allowSearch: false, fetchImpl: impl });
    const result = await source.fetchCandidates(PROFILE, emptyLedger(NOW), NOW);

    expect(result.notes).toContain('Playlist not found');
    expect(result.candidates).toHaveLength(1);
  });

  it('says so when no channel has a resolvable id', async () => {
    const nameOnly = buildProfile(
      [
        createMoment({
          video: { videoId: 'aaaaaaaaaaa', title: 'x', channelName: 'No Id', durationSec: 600, capturedAt: NOW },
          pressedAtSec: 100,
          lookbackSec: 0,
          markedAt: NOW,
        }),
      ],
      { clusterWindowSec: 8, now: NOW },
    );

    const { impl, calls } = fakeFetch(HAPPY_ROUTES);
    const source = new YouTubeDataApiSource({ apiKey: 'k', allowSearch: false, fetchImpl: impl });

    const result = await source.fetchCandidates(nameOnly, emptyLedger(NOW), NOW);
    expect(calls).toEqual([]);
    expect(result.unitsSpent).toBe(0);
    expect(result.notes.join(' ')).toContain('No channels with a known id');
  });

  it('spends nothing when the day is already exhausted', async () => {
    const { impl, calls } = fakeFetch(HAPPY_ROUTES);
    const source = new YouTubeDataApiSource({ apiKey: 'k', allowSearch: true, fetchImpl: impl });

    const spent = { day: quotaDay(NOW), spent: DAILY_UNITS };
    const result = await source.fetchCandidates(PROFILE, spent, NOW);

    expect(calls).toEqual([]);
    expect(result.unitsSpent).toBe(0);
  });
});
