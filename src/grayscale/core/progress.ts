// The Grayscale state machine: focus in, raids out. This is the only module
// that knows the whole app's shape, and it stays pure. Every transition takes
// the current state plus an explicit `nowMs` and returns a new state; nothing
// here reads a clock, touches storage, or generates randomness of its own.
//
// The economy is deliberately one-way. Focus minutes are earned by being off
// the phone, they are banked, and raids spend them. There is no other source of
// minutes, so there is nothing to grind inside the app itself.

import {
  type Character,
  type FocusSession,
  DAILY_GOAL_MINUTES,
  MS_PER_MINUTE,
  characterFor,
  dayIndex,
  minutesByDay,
  sessionMinutes,
  streakDays,
  totalFocusMinutes,
} from './focus';
import { type RaidDef, RAIDS, raidById } from './raids';
import { type RaidRunResult, runRaid } from './raid_run';
import { Rng } from '../../sim/rng';

export interface GrayscaleState {
  /** Completed focus sessions, oldest first. */
  sessions: FocusSession[];
  /** Start of the session currently running, or null when idle. */
  activeSince: number | null;
  /** Banked minutes already spent on raids. */
  spentMinutes: number;
  /** Completed runs, oldest first. */
  runs: RaidRunResult[];
  /** Raids that have been fully cleared at least once. */
  clearedRaidIds: string[];
  /** Monotonic run count, the deterministic seed source for the next run. */
  runCounter: number;
}

export function initialState(): GrayscaleState {
  return {
    sessions: [],
    activeSince: null,
    spentMinutes: 0,
    runs: [],
    clearedRaidIds: [],
    runCounter: 0,
  };
}

/** Starts a focus session. Starting while one is already running is a no-op. */
export function startFocus(state: GrayscaleState, nowMs: number): GrayscaleState {
  if (state.activeSince !== null) return state;
  return { ...state, activeSince: nowMs };
}

/**
 * Ends the running session and banks it. A session shorter than a whole minute
 * is discarded rather than stored, so the log never fills with empty rows.
 */
export function endFocus(state: GrayscaleState, nowMs: number): GrayscaleState {
  if (state.activeSince === null) return state;
  const session: FocusSession = { startedAtMs: state.activeSince, endedAtMs: nowMs };
  if (sessionMinutes(session) <= 0) return { ...state, activeSince: null };
  return { ...state, activeSince: null, sessions: [...state.sessions, session] };
}

/** Sessions including the one in flight, so live totals tick up while focusing. */
export function sessionsAsOf(state: GrayscaleState, nowMs: number): FocusSession[] {
  if (state.activeSince === null) return state.sessions;
  return [...state.sessions, { startedAtMs: state.activeSince, endedAtMs: nowMs }];
}

/** Lifetime focus minutes, including the session in flight. */
export function earnedMinutes(state: GrayscaleState, nowMs: number): number {
  return totalFocusMinutes(sessionsAsOf(state, nowMs));
}

/** Minutes available to spend on raids. */
export function bankedMinutes(state: GrayscaleState, nowMs: number): number {
  return Math.max(0, earnedMinutes(state, nowMs) - state.spentMinutes);
}

/** Minutes of focus logged today, against the daily goal. */
export function todayMinutes(state: GrayscaleState, nowMs: number, tzOffsetMinutes: number): number {
  const byDay = minutesByDay(sessionsAsOf(state, nowMs), tzOffsetMinutes);
  return byDay.get(dayIndex(nowMs, tzOffsetMinutes)) ?? 0;
}

export function currentStreak(state: GrayscaleState, nowMs: number, tzOffsetMinutes: number): number {
  return streakDays(sessionsAsOf(state, nowMs), nowMs, tzOffsetMinutes, DAILY_GOAL_MINUTES);
}

/** The character as the accumulated focus and the live streak have made it. */
export function characterOf(state: GrayscaleState, nowMs: number, tzOffsetMinutes: number): Character {
  return characterFor(earnedMinutes(state, nowMs), currentStreak(state, nowMs, tzOffsetMinutes));
}

/** Why a raid cannot be run right now, or null when it can. */
export type RaidBlocker = 'level' | 'minutes' | 'focusing';

export interface RaidAvailability {
  raid: RaidDef;
  runnable: boolean;
  blocker: RaidBlocker | null;
  cleared: boolean;
  /** Banked minutes still needed, 0 when affordable. */
  minutesShort: number;
  /** Character levels still needed, 0 when unlocked. */
  levelsShort: number;
}

export function raidAvailability(
  state: GrayscaleState,
  nowMs: number,
  tzOffsetMinutes: number,
): RaidAvailability[] {
  const character = characterOf(state, nowMs, tzOffsetMinutes);
  const banked = bankedMinutes(state, nowMs);

  return RAIDS.map((raid) => {
    const levelsShort = Math.max(0, raid.minLevel - character.level);
    const minutesShort = Math.max(0, raid.costMinutes - banked);
    // A run resolves the moment it is sent, so it cannot share a clock with a
    // session that is still accumulating; the session has to be banked first.
    const blocker: RaidBlocker | null =
      state.activeSince !== null ? 'focusing'
        : levelsShort > 0 ? 'level'
        : minutesShort > 0 ? 'minutes'
        : null;

    return {
      raid,
      runnable: blocker === null,
      blocker,
      cleared: state.clearedRaidIds.includes(raid.id),
      minutesShort,
      levelsShort,
    };
  });
}

/**
 * Seed for the next run. Derived from the run counter and the raid id so the
 * host never has to supply randomness and a state can be replayed exactly.
 */
export function seedFor(state: GrayscaleState, raidId: string): number {
  let hash = 0x9e3779b9 ^ (state.runCounter >>> 0);
  for (let i = 0; i < raidId.length; i++) {
    hash = Math.imul(hash ^ raidId.charCodeAt(i), 0x01000193);
  }
  return hash >>> 0;
}

export interface SendResult {
  state: GrayscaleState;
  /** The resolved run, or null when the raid was not runnable. */
  result: RaidRunResult | null;
  blocker: RaidBlocker | null;
}

/**
 * Sends the character on a raid. Charges the banked minutes win or lose, then
 * records the run. Returns the untouched state plus a blocker when the raid was
 * not runnable, so callers never have to pre-check.
 */
export function sendOnRaid(
  state: GrayscaleState,
  raidId: string,
  nowMs: number,
  tzOffsetMinutes: number,
): SendResult {
  const raid = raidById(raidId);
  if (!raid) return { state, result: null, blocker: null };

  const availability = raidAvailability(state, nowMs, tzOffsetMinutes)
    .find((entry) => entry.raid.id === raidId);
  if (!availability || !availability.runnable) {
    return { state, result: null, blocker: availability?.blocker ?? null };
  }

  const character = characterOf(state, nowMs, tzOffsetMinutes);
  const result = runRaid(character, raid, new Rng(seedFor(state, raidId)));

  const clearedRaidIds = result.cleared && !state.clearedRaidIds.includes(raid.id)
    ? [...state.clearedRaidIds, raid.id]
    : state.clearedRaidIds;

  return {
    state: {
      ...state,
      spentMinutes: state.spentMinutes + result.minutesSpent,
      runs: [...state.runs, result],
      clearedRaidIds,
      runCounter: state.runCounter + 1,
    },
    result,
    blocker: null,
  };
}

/** Elapsed whole minutes of the session in flight, or 0 when idle. */
export function activeSessionMinutes(state: GrayscaleState, nowMs: number): number {
  if (state.activeSince === null) return 0;
  return Math.max(0, Math.floor((nowMs - state.activeSince) / MS_PER_MINUTE));
}
