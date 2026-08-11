// Shared types for Laugh. This module is pure data: no chrome APIs, no DOM.

/** Snapshot of a video, denormalized onto every moment so it survives deletion. */
export type VideoMeta = {
  videoId: string;
  title: string;
  channelName: string;
  channelId?: string;
  durationSec?: number;
  capturedAt: number;
};

/**
 * One keypress. `pressedAtSec` is the raw player time and is never adjusted;
 * `tSec` is the punchline estimate derived from it, so the lookback offset can be
 * re-tuned later without losing information.
 */
export type LaughMoment = {
  id: string;
  videoId: string;
  pressedAtSec: number;
  lookbackSec: number;
  tSec: number;
  markedAt: number;
  video: VideoMeta;
};

export type Settings = {
  lookbackSec: number;
  clusterWindowSec: number;
  showPlayerButton: boolean;
  inPageHotkey: boolean;
  apiKey: string;
};

export const DEFAULT_SETTINGS: Settings = {
  lookbackSec: 2.5,
  clusterWindowSec: 8,
  showPlayerButton: true,
  inPageHotkey: true,
  apiKey: '',
};

/** Consecutive presses inside one laugh, collapsed into a single event. */
export type LaughEpisode = {
  videoId: string;
  video: VideoMeta;
  tSec: number;
  intensity: number;
  moments: LaughMoment[];
  firstMarkedAt: number;
  lastMarkedAt: number;
};

export type ChannelAffinity = {
  channelKey: string;
  channelName: string;
  channelId?: string;
  episodes: number;
  videos: number;
  laughsPerVideo: number;
  weight: number;
};

export type TermWeight = {
  term: string;
  weight: number;
  videos: number;
};

/**
 * Bumped whenever the derived profile gains or changes a field, so cached profiles
 * from an older shape are recomputed. Deliberately separate from the storage
 * SCHEMA_VERSION: the moment format is unchanged by a profile change, and exports
 * should not claim a new schema because a derived statistic moved.
 */
export const PROFILE_VERSION = 2;

export type TasteProfile = {
  version: number;
  computedAt: number;
  momentCount: number;
  episodeCount: number;
  videoCount: number;
  channels: ChannelAffinity[];
  terms: TermWeight[];
  medianLaughsPerVideo: number;
  medianSecondsToFirstLaugh: number;
  /** Median runtime of the videos you laugh at. The anchor for judging length. */
  medianVideoDurationSec: number;
  /** 10 buckets over normalized position in the video, 0.0 to 1.0. */
  positionHistogram: number[];
  /**
   * Share of laughs landing in the first 30% of a video, 0 to 1. A uniform spread
   * gives 0.3. High means your payoff comes early, so runtime past that is dead
   * weight; low means longer videos keep earning.
   */
  frontLoadBias: number;
  /** 24 buckets over local hour of the mark. */
  hourHistogram: number[];
};

export type Candidate = {
  videoId: string;
  title: string;
  channelName: string;
  channelId?: string;
  publishedAt?: number;
  durationSec?: number;
};

export type ScoredCandidate = {
  candidate: Candidate;
  score: number;
  reasons: string[];
};
