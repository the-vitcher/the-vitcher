// Public surface of the Grayscale core. The host imports from here, never from
// the individual modules, so the internals stay free to move.

export {
  type Character,
  type FocusSession,
  DAILY_GOAL_MINUTES,
  MINUTES_PER_DAY,
  MS_PER_MINUTE,
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
} from './focus';

export {
  type RaidBossDef,
  type RaidDef,
  type RaidLootDef,
  RAIDS,
  raidById,
} from './raids';

export {
  type BossOutcome,
  type RaidRunResult,
  MAX_PULLS_PER_BOSS,
  MAX_PULL_CHANCE,
  MIN_PULL_CHANCE,
  pullChance,
  runRaid,
  soakChance,
} from './raid_run';

export {
  type GrayscaleState,
  type RaidAvailability,
  type RaidBlocker,
  type SendResult,
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
} from './progress';
