import { describe, expect, it } from 'vitest';
import {
  batchIds,
  parseApiError,
  parsePlaylistVideoIds,
  parseSearchVideoIds,
  parseUploadsPlaylists,
  parseVideoCandidates,
} from '../core/youtube_parse';

const ID_A = 'dQw4w9WgXcQ';
const ID_B = 'aBcDeFgHiJk';

describe('parseApiError', () => {
  it('names an exhausted quota plainly', () => {
    const payload = { error: { message: 'quota', errors: [{ reason: 'quotaExceeded' }] } };
    expect(parseApiError(payload)).toBe('YouTube API quota is exhausted for today.');
  });

  it('names a rejected key plainly', () => {
    const payload = { error: { message: 'bad key', errors: [{ reason: 'keyInvalid' }] } };
    expect(parseApiError(payload)).toBe('That YouTube API key was rejected.');
  });

  it('passes through any other message', () => {
    expect(parseApiError({ error: { message: 'Something else' } })).toBe('Something else');
  });

  it('is null when there is no error', () => {
    expect(parseApiError({ items: [] })).toBeNull();
    expect(parseApiError(null)).toBeNull();
  });
});

describe('parseUploadsPlaylists', () => {
  it('maps channel ids to their uploads playlist', () => {
    const payload = {
      items: [
        { id: 'UC1', contentDetails: { relatedPlaylists: { uploads: 'UU1' } } },
        { id: 'UC2', contentDetails: { relatedPlaylists: { uploads: 'UU2' } } },
      ],
    };
    const result = parseUploadsPlaylists(payload);
    expect(result.get('UC1')).toBe('UU1');
    expect(result.size).toBe(2);
  });

  it('skips entries missing either half', () => {
    const payload = { items: [{ id: 'UC1' }, { contentDetails: { relatedPlaylists: { uploads: 'UU2' } } }] };
    expect(parseUploadsPlaylists(payload).size).toBe(0);
  });

  it('survives a wholly unexpected payload', () => {
    expect(parseUploadsPlaylists(null).size).toBe(0);
    expect(parseUploadsPlaylists({ items: 'nope' }).size).toBe(0);
  });
});

describe('parsePlaylistVideoIds', () => {
  it('pulls ids out of contentDetails', () => {
    const payload = { items: [{ contentDetails: { videoId: ID_A } }, { contentDetails: { videoId: ID_B } }] };
    expect(parsePlaylistVideoIds(payload)).toEqual([ID_A, ID_B]);
  });

  it('drops malformed ids', () => {
    const payload = { items: [{ contentDetails: { videoId: 'short' } }, { contentDetails: { videoId: ID_A } }] };
    expect(parsePlaylistVideoIds(payload)).toEqual([ID_A]);
  });

  it('survives junk', () => {
    expect(parsePlaylistVideoIds(undefined)).toEqual([]);
  });
});

describe('parseSearchVideoIds', () => {
  it('reads the nested id.videoId shape search returns', () => {
    const payload = { items: [{ id: { videoId: ID_A } }, { id: { kind: 'channel' } }] };
    expect(parseSearchVideoIds(payload)).toEqual([ID_A]);
  });
});

describe('parseVideoCandidates', () => {
  const item = (overrides: Record<string, unknown> = {}) => ({
    id: ID_A,
    snippet: {
      title: 'A deadpan sketch',
      channelTitle: 'Funny One',
      channelId: 'UC1',
      publishedAt: '2026-03-01T12:00:00Z',
      ...(overrides.snippet as object),
    },
    contentDetails: { duration: 'PT3M32S', ...(overrides.contentDetails as object) },
  });

  it('builds a candidate from a full item', () => {
    const [candidate] = parseVideoCandidates({ items: [item()] });
    expect(candidate).toEqual({
      videoId: ID_A,
      title: 'A deadpan sketch',
      channelName: 'Funny One',
      channelId: 'UC1',
      publishedAt: Date.parse('2026-03-01T12:00:00Z'),
      durationSec: 212,
    });
  });

  it('drops live broadcasts, which have no meaningful runtime', () => {
    const live = item({ snippet: { liveBroadcastContent: 'live' } });
    expect(parseVideoCandidates({ items: [live] })).toEqual([]);
  });

  it('keeps a candidate whose duration is unreadable, minus the duration', () => {
    const [candidate] = parseVideoCandidates({ items: [item({ contentDetails: { duration: 'nonsense' } })] });
    expect(candidate.durationSec).toBeUndefined();
    expect(candidate.title).toBe('A deadpan sketch');
  });

  it('drops items with no title or a malformed id', () => {
    expect(parseVideoCandidates({ items: [{ id: ID_A, snippet: {} }] })).toEqual([]);
    expect(parseVideoCandidates({ items: [{ id: 'short', snippet: { title: 'x' } }] })).toEqual([]);
  });

  it('falls back for a missing channel title', () => {
    const [candidate] = parseVideoCandidates({
      items: [{ id: ID_A, snippet: { title: 'x' }, contentDetails: { duration: 'PT1M' } }],
    });
    expect(candidate.channelName).toBe('Unknown channel');
  });

  it('survives junk', () => {
    expect(parseVideoCandidates(null)).toEqual([]);
  });
});

describe('batchIds', () => {
  it('splits into the 50 per call videos.list accepts', () => {
    const ids = Array.from({ length: 120 }, (_, i) => `id${i}`);
    expect(batchIds(ids).map((b) => b.length)).toEqual([50, 50, 20]);
  });

  it('de-duplicates before batching, since a video can appear twice', () => {
    expect(batchIds([ID_A, ID_A, ID_B])).toEqual([[ID_A, ID_B]]);
  });

  it('returns nothing for an empty list', () => {
    expect(batchIds([])).toEqual([]);
  });
});
