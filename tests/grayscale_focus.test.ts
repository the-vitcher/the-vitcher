// Focus core: minute accounting, local-day bucketing across midnight, streaks,
// and the focus-minutes to character mapping.

import { describe, it, expect } from 'vitest';
import {
  DAILY_GOAL_MINUTES,
  MS_PER_MINUTE,
  MINUTES_PER_DAY,
  STREAK_MIGHT_CAP_DAYS,
  XP_PER_FOCUS_MINUTE,
  characterFor,
  dayIndex,
  dayStartMs,
  minutesByDay,
  sessionMinutes,
  streakDays,
  streakMight,
  totalFocusMinutes,
} from '../src/grayscale/core/focus';
import { MAX_LEVEL, XP_TABLE, xpForLevel } from '../src/sim/types';

const DAY_MS = MINUTES_PER_DAY * MS_PER_MINUTE;
// UTC-05:00, so local midnight is 05:00 UTC. Non-zero on purpose: a zero offset
// hides every sign error in the day math.
const TZ = -300;

function sessionOfMinutes(startMs: number, minutes: number) {
  return { startedAtMs: startMs, endedAtMs: startMs + minutes * MS_PER_MINUTE };
}

describe('sessionMinutes', () => {
  it('floors partial minutes and never rounds up', () => {
    expect(sessionMinutes({ startedAtMs: 0, endedAtMs: 59_999 })).toBe(0);
    expect(sessionMinutes({ startedAtMs: 0, endedAtMs: 60_000 })).toBe(1);
    expect(sessionMinutes({ startedAtMs: 0, endedAtMs: 119_999 })).toBe(1);
  });

  it('treats a zero-length or inverted session as zero', () => {
    expect(sessionMinutes({ startedAtMs: 1_000, endedAtMs: 1_000 })).toBe(0);
    expect(sessionMinutes({ startedAtMs: 5_000, endedAtMs: 1_000 })).toBe(0);
  });
});

describe('totalFocusMinutes', () => {
  it('sums whole minutes across sessions', () => {
    const sessions = [sessionOfMinutes(0, 30), sessionOfMinutes(DAY_MS, 45)];
    expect(totalFocusMinutes(sessions)).toBe(75);
  });

  it('is zero for no sessions', () => {
    expect(totalFocusMinutes([])).toBe(0);
  });
});

describe('dayIndex / dayStartMs', () => {
  it('round-trips: the start of a day is in that day', () => {
    for (const day of [-1, 0, 1, 19_000]) {
      expect(dayIndex(dayStartMs(day, TZ), TZ)).toBe(day);
    }
  });

  it('rolls over at local midnight, not UTC midnight', () => {
    const localMidnight = dayStartMs(19_000, TZ);
    expect(dayIndex(localMidnight - 1, TZ)).toBe(18_999);
    expect(dayIndex(localMidnight, TZ)).toBe(19_000);
    // Local midnight at UTC-05:00 is 05:00 UTC, so UTC midnight is still the day before.
    expect(dayIndex(localMidnight - 5 * 60 * MS_PER_MINUTE, TZ)).toBe(18_999);
  });
});

describe('minutesByDay', () => {
  it('buckets a session into its local day', () => {
    const start = dayStartMs(19_000, TZ) + 9 * 60 * MS_PER_MINUTE;
    const byDay = minutesByDay([sessionOfMinutes(start, 40)], TZ);
    expect(byDay.get(19_000)).toBe(40);
    expect(byDay.size).toBe(1);
  });

  it('splits a session that straddles local midnight across both days', () => {
    // Starts 20 minutes before local midnight, runs 50 minutes.
    const start = dayStartMs(19_001, TZ) - 20 * MS_PER_MINUTE;
    const byDay = minutesByDay([sessionOfMinutes(start, 50)], TZ);
    expect(byDay.get(19_000)).toBe(20);
    expect(byDay.get(19_001)).toBe(30);
  });

  it('accumulates several sessions on the same day', () => {
    const dayStart = dayStartMs(19_000, TZ);
    const byDay = minutesByDay(
      [sessionOfMinutes(dayStart + 60_000, 10), sessionOfMinutes(dayStart + 10 * DAY_MS / 24, 25)],
      TZ,
    );
    expect(byDay.get(19_000)).toBe(35);
  });

  it('ignores empty and inverted sessions', () => {
    const byDay = minutesByDay(
      [{ startedAtMs: 5_000, endedAtMs: 5_000 }, { startedAtMs: 9_000, endedAtMs: 1_000 }],
      TZ,
    );
    expect(byDay.size).toBe(0);
  });
});

describe('streakDays', () => {
  const today = 19_100;
  const nowMs = dayStartMs(today, TZ) + 12 * 60 * MS_PER_MINUTE;
  const goalSessionOn = (day: number) =>
    sessionOfMinutes(dayStartMs(day, TZ) + 60 * MS_PER_MINUTE, DAILY_GOAL_MINUTES);

  it('counts consecutive goal-meeting days back from today', () => {
    const sessions = [goalSessionOn(today - 2), goalSessionOn(today - 1), goalSessionOn(today)];
    expect(streakDays(sessions, nowMs, TZ)).toBe(3);
  });

  it('does not break the streak just because today is not done yet', () => {
    const sessions = [goalSessionOn(today - 2), goalSessionOn(today - 1)];
    expect(streakDays(sessions, nowMs, TZ)).toBe(2);
  });

  it('stops at a missed day', () => {
    const sessions = [goalSessionOn(today - 3), goalSessionOn(today - 1), goalSessionOn(today)];
    expect(streakDays(sessions, nowMs, TZ)).toBe(2);
  });

  it('ignores days below the goal', () => {
    const short = sessionOfMinutes(dayStartMs(today - 1, TZ) + 60 * MS_PER_MINUTE, DAILY_GOAL_MINUTES - 1);
    expect(streakDays([short, goalSessionOn(today)], nowMs, TZ)).toBe(1);
  });

  it('is zero with no sessions', () => {
    expect(streakDays([], nowMs, TZ)).toBe(0);
  });
});

describe('streakMight', () => {
  it('caps so a long streak cannot trivialize raids', () => {
    expect(streakMight(0)).toBe(0);
    expect(streakMight(STREAK_MIGHT_CAP_DAYS)).toBe(STREAK_MIGHT_CAP_DAYS * 3);
    expect(streakMight(500)).toBe(STREAK_MIGHT_CAP_DAYS * 3);
  });

  it('treats a negative streak as zero', () => {
    expect(streakMight(-4)).toBe(0);
  });
});

describe('characterFor', () => {
  it('starts at level 1 with nothing banked', () => {
    const character = characterFor(0, 0);
    expect(character.level).toBe(1);
    expect(character.xp).toBe(0);
    expect(character.lifetimeXp).toBe(0);
    expect(character.xpForNext).toBe(xpForLevel(1));
  });

  it('levels on the real vanilla XP curve', () => {
    // Exactly enough focus for the level 1 to 2 step, and not a minute more.
    const minutes = XP_TABLE[0] / XP_PER_FOCUS_MINUTE;
    expect(Number.isInteger(minutes)).toBe(true);
    expect(characterFor(minutes - 1, 0).level).toBe(1);
    const leveled = characterFor(minutes, 0);
    expect(leveled.level).toBe(2);
    expect(leveled.xp).toBe(0);
    expect(leveled.xpForNext).toBe(xpForLevel(2));
  });

  it('holds at the cap and keeps banking overflow XP', () => {
    const capped = characterFor(1_000_000, 0);
    expect(capped.level).toBe(MAX_LEVEL);
    expect(capped.xpForNext).toBe(0);
    expect(capped.xp).toBeGreaterThan(0);
  });

  it('folds the streak into might but not into ward', () => {
    const cold = characterFor(0, 0);
    const hot = characterFor(0, 5);
    expect(hot.might - cold.might).toBe(streakMight(5));
    expect(hot.ward).toBe(cold.ward);
  });

  it('clamps negative focus rather than producing negative levels', () => {
    const character = characterFor(-500, 0);
    expect(character.level).toBe(1);
    expect(character.lifetimeXp).toBe(0);
  });
});
