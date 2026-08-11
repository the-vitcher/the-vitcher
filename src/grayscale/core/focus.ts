// Grayscale focus core: turns raw focus sessions (phone in grayscale, screen
// face down) into character progression. Pure and host-agnostic: no DOM, no
// clock reads, no Math.random. Anything that needs "now" takes an explicit
// nowMs, so the whole module is trivially unit-testable and deterministic.
//
// Progression deliberately reuses the sim's real vanilla XP curve
// (XP_TABLE / xpForLevel in src/sim/types.ts) rather than inventing a second
// set of balance numbers: focus minutes convert to XP at a fixed rate and the
// classic curve does the leveling.

import { MAX_LEVEL, xpForLevel } from '../../sim/types';

export const MS_PER_MINUTE = 60_000;
export const MINUTES_PER_DAY = 1440;

/** One completed stretch of focus time. Half-open: [startedAtMs, endedAtMs). */
export interface FocusSession {
  startedAtMs: number;
  endedAtMs: number;
}

/**
 * XP granted per whole minute of focus. The character advances at the speed of
 * the habit, not at the speed of tapping: level 2 costs 8 minutes and the cap
 * costs 3344 (about four months of an unbroken 30 minute daily habit).
 *
 * 50 also divides every XP_TABLE entry, so every level-up lands on a whole
 * minute rather than mid-minute.
 */
export const XP_PER_FOCUS_MINUTE = 50;

/** Focus minutes a day needs before it counts toward the streak. */
export const DAILY_GOAL_MINUTES = 30;

/** Streak days past this stop adding might, so a long streak cannot trivialize raids. */
export const STREAK_MIGHT_CAP_DAYS = 7;

/** Whole minutes in a session. Partial minutes are dropped, never rounded up. */
export function sessionMinutes(session: FocusSession): number {
  const ms = session.endedAtMs - session.startedAtMs;
  return ms <= 0 ? 0 : Math.floor(ms / MS_PER_MINUTE);
}

export function totalFocusMinutes(sessions: readonly FocusSession[]): number {
  let total = 0;
  for (const session of sessions) total += sessionMinutes(session);
  return total;
}

/**
 * Local day as a whole number of days since the epoch. `tzOffsetMinutes` is
 * minutes to ADD to UTC to reach local time (the negation of
 * `Date.prototype.getTimezoneOffset`), passed in by the host so the core never
 * reads a clock or a timezone itself.
 */
export function dayIndex(atMs: number, tzOffsetMinutes: number): number {
  return Math.floor((atMs + tzOffsetMinutes * MS_PER_MINUTE) / (MINUTES_PER_DAY * MS_PER_MINUTE));
}

/** UTC ms at which the given local day begins. Inverse of `dayIndex`. */
export function dayStartMs(day: number, tzOffsetMinutes: number): number {
  return (day * MINUTES_PER_DAY - tzOffsetMinutes) * MS_PER_MINUTE;
}

/**
 * Focus minutes per local day. A session that straddles local midnight is split
 * across both days rather than being credited entirely to the day it started,
 * so an overnight session cannot silently carry a streak.
 *
 * Each day's slice floors independently, so the sum over days can be up to one
 * minute per crossed boundary below `totalFocusMinutes`. Streaks care about
 * per-day totals and the banked pool cares about the lifetime total, so the two
 * are computed from their own sources and never reconciled against each other.
 */
export function minutesByDay(
  sessions: readonly FocusSession[],
  tzOffsetMinutes: number,
): Map<number, number> {
  const byDay = new Map<number, number>();
  for (const session of sessions) {
    if (session.endedAtMs <= session.startedAtMs) continue;
    let cursor = session.startedAtMs;
    while (cursor < session.endedAtMs) {
      const day = dayIndex(cursor, tzOffsetMinutes);
      const sliceEnd = Math.min(dayStartMs(day + 1, tzOffsetMinutes), session.endedAtMs);
      const minutes = Math.floor((sliceEnd - cursor) / MS_PER_MINUTE);
      if (minutes > 0) byDay.set(day, (byDay.get(day) ?? 0) + minutes);
      cursor = sliceEnd;
    }
  }
  return byDay;
}

/**
 * Consecutive days meeting the daily goal, counting back from today. Today is
 * forgiving: a day that has not met the goal yet does not break a streak built
 * yesterday, it simply is not counted until it does.
 */
export function streakDays(
  sessions: readonly FocusSession[],
  nowMs: number,
  tzOffsetMinutes: number,
  goalMinutes: number = DAILY_GOAL_MINUTES,
): number {
  const byDay = minutesByDay(sessions, tzOffsetMinutes);
  const today = dayIndex(nowMs, tzOffsetMinutes);
  const met = (day: number): boolean => (byDay.get(day) ?? 0) >= goalMinutes;

  let day = met(today) ? today : today - 1;
  let streak = 0;
  while (met(day)) {
    streak++;
    day--;
  }
  return streak;
}

/** The raiding character a given amount of lifetime focus has earned. */
export interface Character {
  level: number;
  /** XP accumulated into the current level (keeps growing past the cap). */
  xp: number;
  /** XP needed to finish the current level, or 0 at MAX_LEVEL. */
  xpForNext: number;
  lifetimeXp: number;
  /** Offense: what `pullChance` weighs against a boss's power. */
  might: number;
  /** Defense: soaks wipes, spending shared raid attempts more slowly. */
  ward: number;
}

/** Might contributed by the current streak, capped at STREAK_MIGHT_CAP_DAYS. */
export function streakMight(streak: number): number {
  return Math.min(Math.max(streak, 0), STREAK_MIGHT_CAP_DAYS) * 3;
}

export function characterFor(totalMinutes: number, streak: number): Character {
  const lifetimeXp = Math.max(0, Math.floor(totalMinutes)) * XP_PER_FOCUS_MINUTE;

  let level = 1;
  let xp = lifetimeXp;
  while (level < MAX_LEVEL && xp >= xpForLevel(level)) {
    xp -= xpForLevel(level);
    level++;
  }

  return {
    level,
    xp,
    xpForNext: level >= MAX_LEVEL ? 0 : xpForLevel(level),
    lifetimeXp,
    might: level * 10 + streakMight(streak),
    ward: level * 8,
  };
}
