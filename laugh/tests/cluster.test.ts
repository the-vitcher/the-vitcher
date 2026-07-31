import { describe, expect, it } from 'vitest';
import { clusterMoments, groupByVideo } from '../core/cluster';
import { createMoment } from '../core/moment';
import type { LaughMoment, VideoMeta } from '../core/types';

function video(videoId: string, overrides: Partial<VideoMeta> = {}): VideoMeta {
  return {
    videoId,
    title: 'Funny thing',
    channelName: 'Some Channel',
    durationSec: 600,
    capturedAt: 1_000,
    ...overrides,
  };
}

function press(videoId: string, pressedAtSec: number, markedAt: number, meta?: Partial<VideoMeta>): LaughMoment {
  return createMoment({
    video: video(videoId, meta),
    pressedAtSec,
    lookbackSec: 0,
    markedAt,
  });
}

const A = 'dQw4w9WgXcQ';
const B = 'aBcDeFgHiJk';

describe('clusterMoments', () => {
  it('collapses a burst of presses into one episode with intensity', () => {
    const episodes = clusterMoments([press(A, 100, 1), press(A, 102, 2), press(A, 104, 3)], 8);
    expect(episodes).toHaveLength(1);
    expect(episodes[0].intensity).toBe(3);
  });

  it('anchors the episode at the earliest punchline estimate', () => {
    const episodes = clusterMoments([press(A, 104, 3), press(A, 100, 1), press(A, 102, 2)], 8);
    expect(episodes[0].tSec).toBe(100);
  });

  it('keeps distant presses in the same video separate', () => {
    const episodes = clusterMoments([press(A, 100, 1), press(A, 400, 2)], 8);
    expect(episodes).toHaveLength(2);
    expect(episodes.every((e) => e.intensity === 1)).toBe(true);
  });

  it('chains from the previous press, so a sustained laugh stays one episode', () => {
    // Each gap is 6s, under the window, but the span is 18s overall.
    const episodes = clusterMoments([press(A, 100, 1), press(A, 106, 2), press(A, 112, 3), press(A, 118, 4)], 8);
    expect(episodes).toHaveLength(1);
    expect(episodes[0].intensity).toBe(4);
  });

  it('splits exactly when a gap exceeds the window', () => {
    expect(clusterMoments([press(A, 100, 1), press(A, 108, 2)], 8)).toHaveLength(1);
    expect(clusterMoments([press(A, 100, 1), press(A, 108.5, 2)], 8)).toHaveLength(2);
  });

  it('never merges across videos even at the same timestamp', () => {
    const episodes = clusterMoments([press(A, 100, 1), press(B, 100, 2)], 8);
    expect(episodes).toHaveLength(2);
  });

  it('treats a zero window as no clustering', () => {
    expect(clusterMoments([press(A, 100, 1), press(A, 101, 2)], 0)).toHaveLength(2);
  });

  it('returns newest episode first', () => {
    const episodes = clusterMoments([press(A, 100, 1_000), press(B, 100, 5_000)], 8);
    expect(episodes[0].videoId).toBe(B);
  });

  it('carries the freshest video snapshot onto the episode', () => {
    const episodes = clusterMoments(
      [
        press(A, 100, 1, { title: 'Old title', capturedAt: 10 }),
        press(A, 102, 2, { title: 'New title', capturedAt: 900 }),
      ],
      8,
    );
    expect(episodes[0].video.title).toBe('New title');
  });

  it('handles an empty input', () => {
    expect(clusterMoments([], 8)).toEqual([]);
  });
});

describe('groupByVideo', () => {
  it('rolls episodes up per video and totals the presses', () => {
    const episodes = clusterMoments([press(A, 100, 1), press(A, 102, 2), press(A, 400, 3), press(B, 10, 4)], 8);
    const groups = groupByVideo(episodes);
    expect(groups).toHaveLength(2);

    const groupA = groups.find((g) => g.videoId === A);
    expect(groupA?.episodes).toHaveLength(2);
    expect(groupA?.totalMoments).toBe(3);
  });

  it('orders episodes within a video by timestamp', () => {
    const episodes = clusterMoments([press(A, 400, 9), press(A, 100, 1)], 8);
    const groups = groupByVideo(episodes);
    expect(groups[0].episodes.map((e) => e.tSec)).toEqual([100, 400]);
  });

  it('orders videos by most recent activity', () => {
    const episodes = clusterMoments([press(A, 100, 1_000), press(B, 100, 9_000)], 8);
    expect(groupByVideo(episodes)[0].videoId).toBe(B);
  });
});
