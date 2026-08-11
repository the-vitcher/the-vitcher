// The Grayscale state machine: focus transitions, the banked-minute economy,
// raid gating, and the determinism of a sent run.

import { describe, it, expect } from 'vitest';
import {
  activeSessionMinutes,
  bankedMinutes,
  characterOf,
  currentStreak,
  earnedMinutes,
  endFocus,
  initialState,
  raidAvailability,
  seedFor,
  sendOnRaid,
  sessionsAsOf,
  startFocus,
  todayMinutes,
  type GrayscaleState,
} from '../src/grayscale/core/progress';
import { DAILY_GOAL_MINUTES, MS_PER_MINUTE, dayStartMs } from '../src/grayscale/core/focus';
import { raidById, type RaidDef } from '../src/grayscale/core/raids';

const TZ = -300;
const T0 = dayStartMs(19_200, TZ) + 9 * 60 * MS_PER_MINUTE;
const CRYPT = raidById('hollow_crypt') as RaidDef;

const minutes = (n: number) => n * MS_PER_MINUTE;

/** Banks `n` minutes of focus ending at `endMs`. */
function withFocus(state: GrayscaleState, endMs: number, n: number): GrayscaleState {
  return endFocus(startFocus(state, endMs - minutes(n)), endMs);
}

describe('focus transitions', () => {
  it('starts idle', () => {
    const state = initialState();
    expect(state.activeSince).toBeNull();
    expect(earnedMinutes(state, T0)).toBe(0);
    expect(bankedMinutes(state, T0)).toBe(0);
  });

  it('starting twice does not restart the clock', () => {
    const started = startFocus(initialState(), T0);
    expect(startFocus(started, T0 + minutes(10))).toBe(started);
  });

  it('counts the session in flight toward live totals', () => {
    const started = startFocus(initialState(), T0);
    expect(activeSessionMinutes(started, T0 + minutes(25))).toBe(25);
    expect(earnedMinutes(started, T0 + minutes(25))).toBe(25);
    expect(sessionsAsOf(started, T0 + minutes(25))).toHaveLength(1);
  });

  it('banks a session on stop', () => {
    const state = withFocus(initialState(), T0 + minutes(40), 40);
    expect(state.activeSince).toBeNull();
    expect(state.sessions).toHaveLength(1);
    expect(earnedMinutes(state, T0 + minutes(40))).toBe(40);
  });

  it('discards a session shorter than a minute rather than logging it', () => {
    const state = endFocus(startFocus(initialState(), T0), T0 + 30_000);
    expect(state.sessions).toHaveLength(0);
    expect(state.activeSince).toBeNull();
  });

  it('stopping while idle is a no-op', () => {
    const state = initialState();
    expect(endFocus(state, T0)).toBe(state);
  });
});

describe('the banked-minute economy', () => {
  it('banked is earned minus spent', () => {
    const state = withFocus(initialState(), T0 + minutes(100), 100);
    expect(bankedMinutes(state, T0 + minutes(100))).toBe(100);
    expect(bankedMinutes({ ...state, spentMinutes: 45 }, T0 + minutes(100))).toBe(55);
  });

  it('never goes negative', () => {
    const state = { ...initialState(), spentMinutes: 500 };
    expect(bankedMinutes(state, T0)).toBe(0);
  });

  it('tracks today against the daily goal and the streak', () => {
    const state = withFocus(initialState(), T0 + minutes(DAILY_GOAL_MINUTES), DAILY_GOAL_MINUTES);
    const now = T0 + minutes(DAILY_GOAL_MINUTES);
    expect(todayMinutes(state, now, TZ)).toBe(DAILY_GOAL_MINUTES);
    expect(currentStreak(state, now, TZ)).toBe(1);
  });
});

describe('raidAvailability', () => {
  it('blocks on level before it blocks on minutes', () => {
    const entry = raidAvailability(initialState(), T0, TZ).find((a) => a.raid.id === 'nythraxis');
    expect(entry?.runnable).toBe(false);
    expect(entry?.blocker).toBe('level');
    expect(entry?.levelsShort).toBeGreaterThan(0);
  });

  it('blocks on minutes once the level gate is met', () => {
    // Enough lifetime focus to clear the level gate, but all of it already spent.
    const earned = withFocus(initialState(), T0 + minutes(600), 600);
    const broke = { ...earned, spentMinutes: 600 };
    const entry = raidAvailability(broke, T0 + minutes(600), TZ).find((a) => a.raid.id === CRYPT.id);
    expect(entry?.blocker).toBe('minutes');
    expect(entry?.minutesShort).toBe(CRYPT.costMinutes);
  });

  it('blocks while a session is still running', () => {
    const banked = withFocus(initialState(), T0 + minutes(600), 600);
    const focusing = startFocus(banked, T0 + minutes(600));
    const entry = raidAvailability(focusing, T0 + minutes(610), TZ).find((a) => a.raid.id === CRYPT.id);
    expect(entry?.runnable).toBe(false);
    expect(entry?.blocker).toBe('focusing');
  });

  it('is runnable once level and minutes are both satisfied', () => {
    const state = withFocus(initialState(), T0 + minutes(600), 600);
    const entry = raidAvailability(state, T0 + minutes(600), TZ).find((a) => a.raid.id === CRYPT.id);
    expect(entry?.runnable).toBe(true);
    expect(entry?.blocker).toBeNull();
    expect(entry?.minutesShort).toBe(0);
    expect(entry?.levelsShort).toBe(0);
  });

  it('covers every shipped raid', () => {
    expect(raidAvailability(initialState(), T0, TZ)).toHaveLength(3);
  });
});

describe('sendOnRaid', () => {
  const ready = () => withFocus(initialState(), T0 + minutes(600), 600);
  const now = T0 + minutes(600);

  it('charges the cost, logs the run, and advances the seed counter', () => {
    const { state, result } = sendOnRaid(ready(), CRYPT.id, now, TZ);
    expect(result).not.toBeNull();
    expect(state.spentMinutes).toBe(CRYPT.costMinutes);
    expect(state.runs).toHaveLength(1);
    expect(state.runCounter).toBe(1);
    expect(bankedMinutes(state, now)).toBe(600 - CRYPT.costMinutes);
  });

  it('is deterministic from the state, with no host-supplied randomness', () => {
    const a = sendOnRaid(ready(), CRYPT.id, now, TZ);
    const b = sendOnRaid(ready(), CRYPT.id, now, TZ);
    expect(a.result).toEqual(b.result);
  });

  it('varies the run as the counter advances', () => {
    let state = ready();
    const shapes = new Set<string>();
    for (let i = 0; i < 4; i++) {
      // Top the bank back up so the only thing changing is the run counter.
      state = { ...state, spentMinutes: 0 };
      const sent = sendOnRaid(state, CRYPT.id, now, TZ);
      state = sent.state;
      shapes.add(JSON.stringify(sent.result?.bosses));
    }
    expect(shapes.size).toBeGreaterThan(1);
  });

  it('records a first clear once, without duplicating it', () => {
    // A capped character clears the crypt on any seed.
    let state = withFocus(initialState(), T0 + minutes(5_000), 5_000);
    const first = sendOnRaid(state, CRYPT.id, T0 + minutes(5_000), TZ);
    expect(first.result?.cleared).toBe(true);
    expect(first.state.clearedRaidIds).toEqual([CRYPT.id]);

    const second = sendOnRaid(first.state, CRYPT.id, T0 + minutes(5_000), TZ);
    expect(second.result?.cleared).toBe(true);
    expect(second.state.clearedRaidIds).toEqual([CRYPT.id]);
  });

  it('refuses a blocked raid and leaves the state untouched', () => {
    const state = initialState();
    const sent = sendOnRaid(state, 'nythraxis', T0, TZ);
    expect(sent.result).toBeNull();
    expect(sent.blocker).toBe('level');
    expect(sent.state).toBe(state);
  });

  it('refuses an unknown raid id', () => {
    const state = ready();
    const sent = sendOnRaid(state, 'not_a_raid', now, TZ);
    expect(sent.result).toBeNull();
    expect(sent.state).toBe(state);
  });

  it('does not mutate the state it was handed', () => {
    const state = ready();
    const snapshot = JSON.stringify(state);
    sendOnRaid(state, CRYPT.id, now, TZ);
    expect(JSON.stringify(state)).toBe(snapshot);
  });
});

describe('seedFor', () => {
  it('is stable for the same counter and raid', () => {
    const state = initialState();
    expect(seedFor(state, 'hollow_crypt')).toBe(seedFor(state, 'hollow_crypt'));
  });

  it('differs across raids and across runs', () => {
    const state = initialState();
    expect(seedFor(state, 'hollow_crypt')).not.toBe(seedFor(state, 'nythraxis'));
    expect(seedFor(state, 'hollow_crypt')).not.toBe(seedFor({ ...state, runCounter: 1 }, 'hollow_crypt'));
  });

  it('stays an unsigned 32-bit integer', () => {
    for (let counter = 0; counter < 200; counter++) {
      const seed = seedFor({ ...initialState(), runCounter: counter }, 'sunken_bastion');
      expect(Number.isInteger(seed)).toBe(true);
      expect(seed).toBeGreaterThanOrEqual(0);
      expect(seed).toBeLessThanOrEqual(0xffffffff);
    }
  });
});

describe('characterOf', () => {
  it('grows with banked focus and reflects the live streak', () => {
    const state = withFocus(initialState(), T0 + minutes(600), 600);
    const character = characterOf(state, T0 + minutes(600), TZ);
    expect(character.level).toBeGreaterThan(1);
    expect(character.might).toBeGreaterThan(0);
  });

  it('spending minutes on raids does not un-level the character', () => {
    const state = withFocus(initialState(), T0 + minutes(600), 600);
    const before = characterOf(state, T0 + minutes(600), TZ).level;
    const after = characterOf({ ...state, spentMinutes: 600 }, T0 + minutes(600), TZ).level;
    expect(after).toBe(before);
  });
});
