import { describe, expect, it } from 'vitest';
import {
  createMoment,
  deriveTSec,
  momentId,
  normalizeMoment,
  normalizeMoments,
  removeMoment,
  retimeAll,
  retimeMoment,
  upsertMoment,
} from '../core/moment';
import type { VideoMeta } from '../core/types';

const VIDEO: VideoMeta = {
  videoId: 'dQw4w9WgXcQ',
  title: 'A very funny bit',
  channelName: 'Some Channel',
  durationSec: 600,
  capturedAt: 1_000,
};

describe('deriveTSec', () => {
  it('rewinds by the lookback so the link lands on the punchline, not the aftermath', () => {
    expect(deriveTSec(100, 2.5)).toBe(97.5);
  });

  it('clamps at zero near the start of a video', () => {
    expect(deriveTSec(1, 2.5)).toBe(0);
    expect(deriveTSec(0, 2.5)).toBe(0);
  });

  it('treats a zero lookback as no adjustment', () => {
    expect(deriveTSec(42.4, 0)).toBe(42.4);
  });

  it('ignores a negative lookback rather than fast-forwarding', () => {
    expect(deriveTSec(100, -5)).toBe(100);
  });

  it('survives non-finite input', () => {
    expect(deriveTSec(Number.NaN, 2.5)).toBe(0);
    expect(deriveTSec(100, Number.NaN)).toBe(100);
  });
});

describe('createMoment', () => {
  it('keeps the raw press time alongside the derived punchline estimate', () => {
    const moment = createMoment({ video: VIDEO, pressedAtSec: 100, lookbackSec: 2.5, markedAt: 5_000 });
    expect(moment.pressedAtSec).toBe(100);
    expect(moment.tSec).toBe(97.5);
    expect(moment.lookbackSec).toBe(2.5);
    expect(moment.videoId).toBe(VIDEO.videoId);
  });

  it('gives the same id to two presses inside the same second', () => {
    const a = createMoment({ video: VIDEO, pressedAtSec: 100.1, lookbackSec: 2.5, markedAt: 1 });
    const b = createMoment({ video: VIDEO, pressedAtSec: 100.4, lookbackSec: 2.5, markedAt: 2 });
    expect(a.id).toBe(b.id);
  });

  it('scopes the id to the video', () => {
    expect(momentId('aaaaaaaaaaa', 100)).not.toBe(momentId('bbbbbbbbbbb', 100));
  });
});

describe('retimeMoment', () => {
  it('re-derives tSec from the untouched raw press time', () => {
    const original = createMoment({ video: VIDEO, pressedAtSec: 100, lookbackSec: 2.5, markedAt: 1 });
    const retimed = retimeMoment(original, 5);
    expect(retimed.pressedAtSec).toBe(100);
    expect(retimed.tSec).toBe(95);
    expect(retimed.lookbackSec).toBe(5);
  });

  it('round-trips back to the original when the old offset is restored', () => {
    const original = createMoment({ video: VIDEO, pressedAtSec: 100, lookbackSec: 2.5, markedAt: 1 });
    expect(retimeMoment(retimeMoment(original, 6), 2.5).tSec).toBe(original.tSec);
  });

  it('retimes a whole array', () => {
    const moments = [
      createMoment({ video: VIDEO, pressedAtSec: 100, lookbackSec: 2.5, markedAt: 1 }),
      createMoment({ video: VIDEO, pressedAtSec: 200, lookbackSec: 2.5, markedAt: 2 }),
    ];
    expect(retimeAll(moments, 1).map((m) => m.tSec)).toEqual([99, 199]);
  });
});

describe('upsertMoment and removeMoment', () => {
  it('replaces rather than duplicating on a repeat id', () => {
    const first = createMoment({ video: VIDEO, pressedAtSec: 100, lookbackSec: 2.5, markedAt: 1 });
    const second = createMoment({ video: VIDEO, pressedAtSec: 100.2, lookbackSec: 2.5, markedAt: 9 });
    const list = upsertMoment(upsertMoment([], first), second);
    expect(list).toHaveLength(1);
    expect(list[0].markedAt).toBe(9);
  });

  it('removes by id', () => {
    const moment = createMoment({ video: VIDEO, pressedAtSec: 100, lookbackSec: 2.5, markedAt: 1 });
    expect(removeMoment([moment], moment.id)).toEqual([]);
    expect(removeMoment([moment], 'nope')).toHaveLength(1);
  });
});

describe('normalizeMoment', () => {
  const now = 10_000;

  it('rejects rows without a usable video id', () => {
    expect(normalizeMoment(null, now)).toBeNull();
    expect(normalizeMoment({}, now)).toBeNull();
    expect(normalizeMoment({ videoId: 'bad' }, now)).toBeNull();
  });

  it('recovers the video id from the nested snapshot', () => {
    const moment = normalizeMoment({ video: { videoId: VIDEO.videoId } }, now);
    expect(moment?.videoId).toBe(VIDEO.videoId);
  });

  it('fills placeholders for missing title and channel instead of throwing', () => {
    const moment = normalizeMoment({ videoId: VIDEO.videoId }, now);
    expect(moment?.video.title).toBe('Untitled video');
    expect(moment?.video.channelName).toBe('Unknown channel');
    expect(moment?.markedAt).toBe(now);
  });

  it('back-fills pressedAtSec from a legacy row that only had tSec', () => {
    const moment = normalizeMoment({ videoId: VIDEO.videoId, tSec: 50 }, now);
    expect(moment?.pressedAtSec).toBe(50);
    expect(moment?.tSec).toBe(50);
  });

  it('drops a zero or negative duration', () => {
    const moment = normalizeMoment({ videoId: VIDEO.videoId, video: { videoId: VIDEO.videoId, durationSec: 0 } }, now);
    expect(moment?.video.durationSec).toBeUndefined();
  });

  it('skips bad rows and de-duplicates the rest', () => {
    const good = createMoment({ video: VIDEO, pressedAtSec: 100, lookbackSec: 2.5, markedAt: 1 });
    const result = normalizeMoments([good, good, null, { nope: true }, 7], now);
    expect(result).toHaveLength(1);
  });

  it('returns an empty array for non-array input', () => {
    expect(normalizeMoments('nope', now)).toEqual([]);
  });
});
