// Display and link formatting. Pure, so the feed and the popup share one source.

/** m:ss below an hour, h:mm:ss at or above it. Negative input clamps to zero. */
export function formatTimestamp(sec: number): string {
  const total = Math.max(0, Math.floor(sec));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`;
}

/** Deep link that opens the video at the given second. */
export function watchUrl(videoId: string, tSec: number): string {
  const t = Math.max(0, Math.floor(tSec));
  return `https://www.youtube.com/watch?v=${videoId}&t=${t}s`;
}

export type ThumbnailQuality = 'default' | 'mq' | 'hq' | 'sd' | 'maxres';

const THUMB_FILE: Record<ThumbnailQuality, string> = {
  default: 'default.jpg',
  mq: 'mqdefault.jpg',
  hq: 'hqdefault.jpg',
  sd: 'sddefault.jpg',
  maxres: 'maxresdefault.jpg',
};

/** Static thumbnail host, needs no API key and no host permission. */
export function thumbnailUrl(videoId: string, quality: ThumbnailQuality = 'mq'): string {
  return `https://i.ytimg.com/vi/${videoId}/${THUMB_FILE[quality]}`;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** Coarse relative time. Good enough for a feed, no dependency needed. */
export function formatRelativeTime(then: number, now: number): string {
  const delta = Math.max(0, now - then);
  if (delta < MINUTE) return 'just now';
  if (delta < HOUR) {
    const m = Math.floor(delta / MINUTE);
    return m === 1 ? '1 minute ago' : `${m} minutes ago`;
  }
  if (delta < DAY) {
    const h = Math.floor(delta / HOUR);
    return h === 1 ? '1 hour ago' : `${h} hours ago`;
  }
  const d = Math.floor(delta / DAY);
  if (d === 1) return 'yesterday';
  if (d < 30) return `${d} days ago`;
  const months = Math.floor(d / 30);
  if (months < 12) return months === 1 ? '1 month ago' : `${months} months ago`;
  const years = Math.floor(d / 365);
  return years === 1 ? '1 year ago' : `${years} years ago`;
}

/** "2:00 pm" style label for the hour histogram in the profile panel. */
export function formatHour(hour: number): string {
  const h = ((hour % 24) + 24) % 24;
  const suffix = h < 12 ? 'am' : 'pm';
  const display = h % 12 === 0 ? 12 : h % 12;
  return `${display} ${suffix}`;
}
