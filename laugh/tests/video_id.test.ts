import { describe, expect, it } from 'vitest';
import { isVideoId, isWatchablePage, parseVideoId } from '../core/video_id';

const ID = 'dQw4w9WgXcQ';

describe('isVideoId', () => {
  it('accepts an 11 char url-safe id', () => {
    expect(isVideoId(ID)).toBe(true);
    expect(isVideoId('_-aBcDeFgH1')).toBe(true);
  });

  it('rejects wrong lengths and illegal characters', () => {
    expect(isVideoId('short')).toBe(false);
    expect(isVideoId(`${ID}extra`)).toBe(false);
    expect(isVideoId('dQw4w9WgXc!')).toBe(false);
    expect(isVideoId(null)).toBe(false);
    expect(isVideoId(undefined)).toBe(false);
  });
});

describe('parseVideoId', () => {
  it('reads the v param from watch urls', () => {
    expect(parseVideoId(`https://www.youtube.com/watch?v=${ID}`)).toBe(ID);
  });

  it('ignores unrelated query params and the position of v', () => {
    expect(parseVideoId(`https://www.youtube.com/watch?list=PL123&v=${ID}&t=42s`)).toBe(ID);
  });

  it('handles youtu.be short links', () => {
    expect(parseVideoId(`https://youtu.be/${ID}`)).toBe(ID);
    expect(parseVideoId(`https://youtu.be/${ID}?t=30`)).toBe(ID);
  });

  it('handles shorts, embed, and live paths', () => {
    expect(parseVideoId(`https://www.youtube.com/shorts/${ID}`)).toBe(ID);
    expect(parseVideoId(`https://www.youtube.com/embed/${ID}`)).toBe(ID);
    expect(parseVideoId(`https://www.youtube.com/live/${ID}`)).toBe(ID);
  });

  it('handles the mobile host and the nocookie domain', () => {
    expect(parseVideoId(`https://m.youtube.com/watch?v=${ID}`)).toBe(ID);
    expect(parseVideoId(`https://www.youtube-nocookie.com/embed/${ID}`)).toBe(ID);
  });

  it('accepts a bare id so callers can pass a value through', () => {
    expect(parseVideoId(ID)).toBe(ID);
  });

  it('returns null for pages that are not a single video', () => {
    expect(parseVideoId('https://www.youtube.com/')).toBeNull();
    expect(parseVideoId('https://www.youtube.com/feed/subscriptions')).toBeNull();
    expect(parseVideoId('https://www.youtube.com/@somechannel')).toBeNull();
    expect(parseVideoId('https://example.com/watch?v=dQw4w9WgXcQ')).toBeNull();
    expect(parseVideoId('')).toBeNull();
    expect(parseVideoId(null)).toBeNull();
  });

  it('returns null when the v param is malformed', () => {
    expect(parseVideoId('https://www.youtube.com/watch?v=tooshort')).toBeNull();
  });
});

describe('isWatchablePage', () => {
  it('is true only where marking makes sense', () => {
    expect(isWatchablePage(`https://www.youtube.com/watch?v=${ID}`)).toBe(true);
    expect(isWatchablePage('https://www.youtube.com/feed/trending')).toBe(false);
  });
});
