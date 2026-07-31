import { describe, expect, it } from 'vitest';
import { createMoment } from '../core/moment';
import { buildProfile } from '../core/profile';
import { rankCandidates, scoreCandidate } from '../core/scoring';
import type { Candidate, LaughMoment, VideoMeta } from '../core/types';

const NOW = 1_700_000_000_000;
const DAY = 24 * 60 * 60 * 1000;

function moment(videoId: string, meta: Partial<VideoMeta> = {}): LaughMoment {
  const video: VideoMeta = {
    videoId,
    title: 'A deadpan sketch',
    channelName: 'Funny One',
    channelId: 'UCuAXFkgsw1L7xaCfnd5JJOw',
    durationSec: 600,
    capturedAt: NOW,
    ...meta,
  };
  return createMoment({ video, pressedAtSec: 100, lookbackSec: 0, markedAt: NOW });
}

// A profile built from three deadpan sketches on one channel.
const PROFILE = buildProfile(
  [
    moment('aaaaaaaaaaa', { title: 'A deadpan sketch' }),
    moment('bbbbbbbbbbb', { title: 'Deadpan interview' }),
    moment('ccccccccccc', { title: 'Deadpan panel' }),
    moment('ddddddddddd', { title: 'Slapstick chaos', channelName: 'Other', channelId: undefined }),
  ],
  { clusterWindowSec: 8, now: NOW },
);

function candidate(overrides: Partial<Candidate> = {}): Candidate {
  return {
    videoId: 'zzzzzzzzzzz',
    title: 'Something unrelated',
    channelName: 'Nobody',
    ...overrides,
  };
}

describe('scoreCandidate', () => {
  it('scores a video from a channel you laugh at above an unknown one', () => {
    const known = scoreCandidate(
      PROFILE,
      candidate({ channelName: 'Funny One', channelId: 'UCuAXFkgsw1L7xaCfnd5JJOw' }),
      { now: NOW },
    );
    const unknown = scoreCandidate(PROFILE, candidate(), { now: NOW });
    expect(known.score).toBeGreaterThan(unknown.score);
  });

  it('scores a title matching your terms above one that does not', () => {
    const matching = scoreCandidate(PROFILE, candidate({ title: 'A deadpan sketch about nothing' }), { now: NOW });
    const other = scoreCandidate(PROFILE, candidate({ title: 'Cooking tutorial' }), { now: NOW });
    expect(matching.score).toBeGreaterThan(other.score);
  });

  it('explains itself, so a suggestion is never unattributed', () => {
    const scored = scoreCandidate(
      PROFILE,
      candidate({ channelName: 'Funny One', channelId: 'UCuAXFkgsw1L7xaCfnd5JJOw', title: 'New deadpan sketch' }),
      { now: NOW },
    );
    expect(scored.reasons.some((r) => r.includes('Funny One'))).toBe(true);
    expect(scored.reasons.some((r) => r.includes('deadpan'))).toBe(true);
  });

  it('prefers a fresh upload over an old one, all else equal', () => {
    const fresh = scoreCandidate(PROFILE, candidate({ publishedAt: NOW - DAY }), { now: NOW });
    const old = scoreCandidate(PROFILE, candidate({ publishedAt: NOW - 400 * DAY }), { now: NOW });
    expect(fresh.score).toBeGreaterThan(old.score);
    expect(fresh.reasons).toContain('Posted recently');
  });

  it('does not claim recency when the publish date is unknown', () => {
    const scored = scoreCandidate(PROFILE, candidate(), { now: NOW });
    expect(scored.reasons).not.toContain('Posted recently');
  });

  it('never exceeds the sum of its weights', () => {
    const best = scoreCandidate(
      PROFILE,
      candidate({
        channelName: 'Funny One',
        channelId: 'UCuAXFkgsw1L7xaCfnd5JJOw',
        title: 'Deadpan sketch interview panel',
        publishedAt: NOW,
        durationSec: 600,
      }),
      { now: NOW },
    );
    expect(best.score).toBeLessThanOrEqual(1.0001);
    expect(best.score).toBeGreaterThan(0);
  });

  it('cannot let a long title of weak matches beat one strong match', () => {
    const stuffed = scoreCandidate(PROFILE, candidate({ title: 'panel panel interview interview sketch sketch' }), {
      now: NOW,
    });
    expect(stuffed.score).toBeLessThanOrEqual(1.0001);
  });

  it('returns a zero-ish score against an empty profile without throwing', () => {
    const empty = buildProfile([], { clusterWindowSec: 8, now: NOW });
    const scored = scoreCandidate(empty, candidate(), { now: NOW });
    expect(Number.isFinite(scored.score)).toBe(true);
    expect(scored.reasons).toEqual([]);
  });
});

describe('rankCandidates', () => {
  it('sorts best first', () => {
    const ranked = rankCandidates(
      PROFILE,
      [
        candidate({ videoId: 'unrelated00', title: 'Cooking tutorial' }),
        candidate({ videoId: 'ondeadpan00', title: 'Deadpan sketch', channelName: 'Funny One', channelId: 'UCuAXFkgsw1L7xaCfnd5JJOw' }),
      ],
      { now: NOW },
    );
    expect(ranked[0].candidate.videoId).toBe('ondeadpan00');
  });

  it('excludes videos you have already marked', () => {
    const ranked = rankCandidates(PROFILE, [candidate({ videoId: 'aaaaaaaaaaa' }), candidate({ videoId: 'newnewnew00' })], {
      now: NOW,
      seenVideoIds: new Set(['aaaaaaaaaaa']),
    });
    expect(ranked.map((r) => r.candidate.videoId)).toEqual(['newnewnew00']);
  });

  it('handles an empty candidate list', () => {
    expect(rankCandidates(PROFILE, [], { now: NOW })).toEqual([]);
  });
});
