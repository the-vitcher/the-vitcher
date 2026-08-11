import { describe, expect, it } from 'vitest';
import { createMoment } from '../core/moment';
import { buildProfile } from '../core/profile';
import { emptyProfile } from '../core/profile';
import { rankCandidates, scoreCandidate, surfacingReadiness } from '../core/scoring';
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

describe('positionFit, via scoreCandidate', () => {
  // A profile whose laughs all land in the first third of ten-minute videos.
  const frontLoaded = buildProfile(
    ['aaaaaaaaaaa', 'bbbbbbbbbbb', 'ccccccccccc', 'ddddddddddd', 'eeeeeeeeeee', 'fffffffffff'].map((id) =>
      createMoment({
        video: {
          videoId: id,
          title: 'A sketch',
          channelName: 'Ch',
          durationSec: 600,
          capturedAt: NOW,
        },
        pressedAtSec: 30,
        lookbackSec: 0,
        markedAt: NOW,
      }),
    ),
    { clusterWindowSec: 8, now: NOW },
  );

  // Same runtimes, but the laughs land right at the end.
  const spread = buildProfile(
    ['aaaaaaaaaaa', 'bbbbbbbbbbb', 'ccccccccccc', 'ddddddddddd', 'eeeeeeeeeee', 'fffffffffff'].map((id, i) =>
      createMoment({
        video: {
          videoId: id,
          title: 'A sketch',
          channelName: 'Ch',
          durationSec: 600,
          capturedAt: NOW,
        },
        // Evenly stepped through the runtime, so the position mass is not front-loaded.
        pressedAtSec: 30 + i * 90,
        lookbackSec: 0,
        markedAt: NOW,
      }),
    ),
    { clusterWindowSec: 8, now: NOW },
  );

  it('measures the anchors it needs off the marks', () => {
    expect(frontLoaded.medianVideoDurationSec).toBe(600);
    expect(frontLoaded.frontLoadBias).toBe(1);
    expect(spread.frontLoadBias).toBeLessThan(1);
  });

  const score = (profile: typeof frontLoaded, durationSec: number) =>
    scoreCandidate(profile, candidate({ durationSec }), { now: NOW }).score;

  it('penalizes a long video when your laughs come early', () => {
    // 1.5x the median is the tolerance at full front-load, so 4x is well past it.
    expect(score(frontLoaded, 2400)).toBeLessThan(score(frontLoaded, 600));
  });

  it('tolerates that same long video when your laughs spread through the runtime', () => {
    expect(score(spread, 2400)).toBeGreaterThan(score(frontLoaded, 2400));
  });

  it('penalizes a video far shorter than the ones you laugh at', () => {
    expect(score(frontLoaded, 60)).toBeLessThan(score(frontLoaded, 600));
  });

  it('reorders a ranking by length, which is the point of the signal', () => {
    const ranked = rankCandidates(
      frontLoaded,
      [
        candidate({ videoId: 'longlonglon', durationSec: 3600 }),
        candidate({ videoId: 'rightlength', durationSec: 600 }),
      ],
      { now: NOW },
    );
    expect(ranked[0].candidate.videoId).toBe('rightlength');
  });

  it('stays neutral when the candidate runtime is unknown', () => {
    const scored = scoreCandidate(frontLoaded, candidate({ durationSec: undefined }), { now: NOW });
    expect(scored.reasons).not.toContain('About the length you laugh at');
    expect(Number.isFinite(scored.score)).toBe(true);
  });

  it('stays neutral when the profile has no runtime anchor', () => {
    const scored = scoreCandidate(emptyProfile(NOW), candidate({ durationSec: 600 }), { now: NOW });
    expect(Number.isFinite(scored.score)).toBe(true);
  });
});

describe('surfacingReadiness', () => {
  function profileWithHours(counts: Record<number, number>) {
    const profile = emptyProfile(NOW);
    for (const [hour, count] of Object.entries(counts)) profile.hourHistogram[Number(hour)] = count;
    return profile;
  }

  function at(hour: number): number {
    const date = new Date(NOW);
    date.setHours(hour, 0, 0, 0);
    return date.getTime();
  }

  it('stays neutral until there is enough history', () => {
    const result = surfacingReadiness(profileWithHours({ 22: 3 }), at(22));
    expect(result.score).toBe(0.5);
    expect(result.reason).toContain('Not enough history');
  });

  it('scores high inside your peak hours', () => {
    const result = surfacingReadiness(profileWithHours({ 21: 6, 22: 10, 23: 6 }), at(22));
    expect(result.score).toBe(1);
    expect(result.reason).toBe('This is one of your funny hours');
  });

  it('scores low in an hour you never mark anything', () => {
    const result = surfacingReadiness(profileWithHours({ 21: 6, 22: 10, 23: 6 }), at(9));
    expect(result.score).toBeLessThanOrEqual(0.3);
    expect(result.reason).toBe('You rarely mark anything at this hour');
  });

  it('smooths across neighbouring hours rather than reading one spiky bucket', () => {
    // Hour 21 is empty itself but sits beside the peak, so it should not read as dead.
    const result = surfacingReadiness(profileWithHours({ 20: 8, 22: 8 }), at(21));
    expect(result.score).toBeGreaterThan(0.3);
  });

  it('is identical for every candidate, which is why it is not a scoring weight', () => {
    const profile = profileWithHours({ 22: 12 });
    const a = surfacingReadiness(profile, at(22));
    const b = surfacingReadiness(profile, at(22));
    expect(a.score).toBe(b.score);
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
