import { describe, expect, it } from 'vitest';
import { formatHour, formatRelativeTime, formatTimestamp, thumbnailUrl, watchUrl } from '../core/format';

describe('formatTimestamp', () => {
  it('uses m:ss below an hour', () => {
    expect(formatTimestamp(0)).toBe('0:00');
    expect(formatTimestamp(9)).toBe('0:09');
    expect(formatTimestamp(754)).toBe('12:34');
  });

  it('uses h:mm:ss at or above an hour', () => {
    expect(formatTimestamp(3600)).toBe('1:00:00');
    expect(formatTimestamp(3725)).toBe('1:02:05');
  });

  it('floors fractional seconds and clamps negatives', () => {
    expect(formatTimestamp(97.9)).toBe('1:37');
    expect(formatTimestamp(-5)).toBe('0:00');
  });
});

describe('watchUrl', () => {
  it('deep links to a whole second', () => {
    expect(watchUrl('dQw4w9WgXcQ', 97.5)).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=97s');
  });

  it('clamps a negative timestamp to the start', () => {
    expect(watchUrl('dQw4w9WgXcQ', -3)).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=0s');
  });
});

describe('thumbnailUrl', () => {
  it('defaults to the medium still', () => {
    expect(thumbnailUrl('dQw4w9WgXcQ')).toBe('https://i.ytimg.com/vi/dQw4w9WgXcQ/mqdefault.jpg');
  });

  it('supports other qualities', () => {
    expect(thumbnailUrl('dQw4w9WgXcQ', 'maxres')).toContain('maxresdefault.jpg');
  });
});

describe('formatRelativeTime', () => {
  const now = 1_700_000_000_000;
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;

  it('describes recent marks', () => {
    expect(formatRelativeTime(now, now)).toBe('just now');
    expect(formatRelativeTime(now - 30_000, now)).toBe('just now');
    expect(formatRelativeTime(now - minute, now)).toBe('1 minute ago');
    expect(formatRelativeTime(now - 5 * minute, now)).toBe('5 minutes ago');
  });

  it('describes hours and days', () => {
    expect(formatRelativeTime(now - hour, now)).toBe('1 hour ago');
    expect(formatRelativeTime(now - 5 * hour, now)).toBe('5 hours ago');
    expect(formatRelativeTime(now - day, now)).toBe('yesterday');
    expect(formatRelativeTime(now - 5 * day, now)).toBe('5 days ago');
  });

  it('describes months and years', () => {
    expect(formatRelativeTime(now - 60 * day, now)).toBe('2 months ago');
    expect(formatRelativeTime(now - 400 * day, now)).toBe('1 year ago');
  });

  it('clamps a future timestamp', () => {
    expect(formatRelativeTime(now + 10_000, now)).toBe('just now');
  });
});

describe('formatHour', () => {
  it('reads as a wall clock hour', () => {
    expect(formatHour(0)).toBe('12 am');
    expect(formatHour(9)).toBe('9 am');
    expect(formatHour(12)).toBe('12 pm');
    expect(formatHour(22)).toBe('10 pm');
  });
});
