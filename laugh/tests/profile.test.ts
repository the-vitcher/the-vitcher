import { describe, expect, it } from 'vitest';
import { createMoment } from '../core/moment';
import { buildProfile, emptyProfile, funniestHour, median, recencyWeight, RECENCY_HALF_LIFE_MS } from '../core/profile';
import type { LaughMoment, VideoMeta } from '../core/types';

const NOW = 1_700_000_000_000;

function moment(
  videoId: string,
  pressedAtSec: number,
  markedAt: number,
  meta: Partial<VideoMeta> = {},
): LaughMoment {
  const video: VideoMeta = {
    videoId,
    title: 'A funny sketch',
    channelName: 'Some Channel',
    durationSec: 600,
    capturedAt: markedAt,
    ...meta,
  };
  return createMoment({ video, pressedAtSec, lookbackSec: 0, markedAt });
}

const OPTIONS = { clusterWindowSec: 8, now: NOW };

describe('median', () => {
  it('handles odd, even, and empty inputs', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(median([])).toBe(0);
  });
});

describe('recencyWeight', () => {
  it('is 1 for a mark made now and 0.5 at one half life', () => {
    expect(recencyWeight(NOW, NOW)).toBe(1);
    expect(recencyWeight(NOW - RECENCY_HALF_LIFE_MS, NOW)).toBeCloseTo(0.5, 10);
  });

  it('does not exceed 1 for a future timestamp', () => {
    expect(recencyWeight(NOW + 1_000, NOW)).toBe(1);
  });
});

describe('buildProfile', () => {
  it('reports an empty profile for no moments', () => {
    const profile = buildProfile([], OPTIONS);
    expect(profile.momentCount).toBe(0);
    expect(profile.channels).toEqual([]);
    expect(profile.terms).toEqual([]);
    expect(profile.videoCount).toBe(0);
  });

  it('counts episodes, not raw presses, for laughs per video', () => {
    // One burst of three presses is one laugh, not three.
    const moments = [
      moment('aaaaaaaaaaa', 100, NOW),
      moment('aaaaaaaaaaa', 102, NOW),
      moment('aaaaaaaaaaa', 104, NOW),
    ];
    const profile = buildProfile(moments, OPTIONS);
    expect(profile.momentCount).toBe(3);
    expect(profile.episodeCount).toBe(1);
    expect(profile.medianLaughsPerVideo).toBe(1);
  });

  it('ranks the channel you laugh at more often above the other', () => {
    const moments = [
      moment('aaaaaaaaaaa', 100, NOW, { channelName: 'Funny One' }),
      moment('bbbbbbbbbbb', 100, NOW, { channelName: 'Funny One' }),
      moment('ccccccccccc', 100, NOW, { channelName: 'Funny One' }),
      moment('ddddddddddd', 100, NOW, { channelName: 'Other' }),
    ];
    const profile = buildProfile(moments, OPTIONS);
    expect(profile.channels[0].channelName).toBe('Funny One');
    expect(profile.channels[0].videos).toBe(3);
  });

  it('weights a recent channel above an equally marked but older one', () => {
    const old = NOW - 4 * RECENCY_HALF_LIFE_MS;
    const moments = [
      moment('aaaaaaaaaaa', 100, NOW, { channelName: 'Recent' }),
      moment('bbbbbbbbbbb', 100, old, { channelName: 'Stale' }),
    ];
    const profile = buildProfile(moments, OPTIONS);
    expect(profile.channels[0].channelName).toBe('Recent');
  });

  it('groups a channel by id even when its display name changed', () => {
    const moments = [
      moment('aaaaaaaaaaa', 100, NOW, { channelName: 'Old Name', channelId: 'UCuAXFkgsw1L7xaCfnd5JJOw' }),
      moment('bbbbbbbbbbb', 100, NOW, { channelName: 'New Name', channelId: 'UCuAXFkgsw1L7xaCfnd5JJOw' }),
    ];
    const profile = buildProfile(moments, OPTIONS);
    expect(profile.channels).toHaveLength(1);
    expect(profile.channels[0].videos).toBe(2);
  });

  it('lets a term appearing across many videos outrank one repeated in a single title', () => {
    const moments = [
      moment('aaaaaaaaaaa', 100, NOW, { title: 'deadpan sketch' }),
      moment('bbbbbbbbbbb', 100, NOW, { title: 'deadpan interview' }),
      moment('ccccccccccc', 100, NOW, { title: 'deadpan panel show' }),
      moment('ddddddddddd', 100, NOW, { title: 'puppets puppets puppets puppets' }),
    ];
    const profile = buildProfile(moments, OPTIONS);
    const deadpan = profile.terms.find((t) => t.term === 'deadpan');
    const puppets = profile.terms.find((t) => t.term === 'puppets');
    expect(deadpan?.videos).toBe(3);
    expect(puppets?.videos).toBe(1);
    expect(deadpan!.weight).toBeGreaterThan(puppets!.weight);
  });

  it('counts a title once per video no matter how many episodes it has', () => {
    const moments = [
      moment('aaaaaaaaaaa', 100, NOW, { title: 'deadpan sketch' }),
      moment('aaaaaaaaaaa', 400, NOW, { title: 'deadpan sketch' }),
    ];
    const profile = buildProfile(moments, OPTIONS);
    expect(profile.episodeCount).toBe(2);
    expect(profile.terms.find((t) => t.term === 'deadpan')?.videos).toBe(1);
  });

  it('drops stopwords and YouTube filler from the term list', () => {
    const moments = [moment('aaaaaaaaaaa', 100, NOW, { title: 'The official full episode of a sketch' })];
    const terms = buildProfile(moments, OPTIONS).terms.map((t) => t.term);
    expect(terms).toContain('sketch');
    expect(terms).not.toContain('the');
    expect(terms).not.toContain('official');
    expect(terms).not.toContain('episode');
  });

  it('bins the in-video position of each laugh', () => {
    const moments = [
      moment('aaaaaaaaaaa', 30, NOW, { durationSec: 600 }),
      moment('bbbbbbbbbbb', 570, NOW, { durationSec: 600 }),
    ];
    const profile = buildProfile(moments, OPTIONS);
    expect(profile.positionHistogram[0]).toBe(1);
    expect(profile.positionHistogram[9]).toBe(1);
  });

  it('skips the position histogram when duration is unknown', () => {
    const moments = [moment('aaaaaaaaaaa', 30, NOW, { durationSec: undefined })];
    const profile = buildProfile(moments, OPTIONS);
    expect(profile.positionHistogram.reduce((a, b) => a + b, 0)).toBe(0);
  });

  it('records one hour bucket per episode', () => {
    const moments = [moment('aaaaaaaaaaa', 100, NOW), moment('bbbbbbbbbbb', 100, NOW)];
    const profile = buildProfile(moments, OPTIONS);
    expect(profile.hourHistogram.reduce((a, b) => a + b, 0)).toBe(2);
    expect(profile.hourHistogram).toHaveLength(24);
  });

  it('reports the median seconds to the first laugh in a video', () => {
    const moments = [
      moment('aaaaaaaaaaa', 60, NOW),
      moment('aaaaaaaaaaa', 300, NOW),
      moment('bbbbbbbbbbb', 20, NOW),
    ];
    expect(buildProfile(moments, OPTIONS).medianSecondsToFirstLaugh).toBe(40);
  });

  it('honours the channel and term caps', () => {
    const moments = Array.from({ length: 30 }, (_, i) =>
      moment(`v${String(i).padStart(10, '0')}`, 100, NOW, { channelName: `Channel ${i}`, title: `word${i} sketch` }),
    );
    const profile = buildProfile(moments, { ...OPTIONS, maxChannels: 5, maxTerms: 3 });
    expect(profile.channels).toHaveLength(5);
    expect(profile.terms).toHaveLength(3);
  });
});

describe('funniestHour', () => {
  it('is null with no data', () => {
    expect(funniestHour(emptyProfile(NOW))).toBeNull();
  });

  it('returns the peak bucket', () => {
    const profile = emptyProfile(NOW);
    profile.hourHistogram[22] = 4;
    profile.hourHistogram[9] = 1;
    expect(funniestHour(profile)).toBe(22);
  });
});
