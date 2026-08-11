// ISO 8601 durations, which is how the YouTube API reports video length.
//
// Only the time-bearing designators can appear on a video (PT#H#M#S), but weeks and
// days are handled too so a malformed or unusual value degrades to a number rather
// than to NaN.

const PATTERN = /^P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?$/;

const WEEK = 7 * 24 * 60 * 60;
const DAY = 24 * 60 * 60;
const HOUR = 60 * 60;
const MINUTE = 60;

/**
 * Seconds, or undefined when the value is unparseable. Live streams report "P0D",
 * which correctly yields 0 and is then treated as an unknown runtime by callers.
 */
export function parseIso8601Duration(value: unknown): number | undefined {
  if (typeof value !== 'string') return undefined;

  const match = PATTERN.exec(value.trim());
  if (!match) return undefined;

  const [, weeks, days, hours, minutes, seconds] = match;
  // "P" or "PT" alone carries no components and is not a duration.
  if (!weeks && !days && !hours && !minutes && !seconds) return undefined;

  const total =
    Number(weeks ?? 0) * WEEK +
    Number(days ?? 0) * DAY +
    Number(hours ?? 0) * HOUR +
    Number(minutes ?? 0) * MINUTE +
    Number(seconds ?? 0);

  return Number.isFinite(total) ? total : undefined;
}
