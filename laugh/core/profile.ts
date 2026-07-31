// Deriving a taste profile from laugh moments.
//
// The profile is always derived, never hand-maintained, so it cannot drift from the
// moments it describes. Recomputing over a few hundred moments is sub-millisecond,
// so it is cheap to rebuild whenever the moment count changes.
//
// True IDF would need a corpus of videos you did not mark, which we do not have.
// Instead terms are weighted by the number of DISTINCT videos containing them, so
// one wordy title cannot dominate the profile.

import { clusterMoments } from './cluster';
import { channelKey } from './metadata';
import { uniqueTokens } from './tokenize';
import type { ChannelAffinity, LaughMoment, TasteProfile, TermWeight } from './types';

/** Weight of a mark decays by half every 30 days, so taste can move. */
export const RECENCY_HALF_LIFE_MS = 30 * 24 * 60 * 60 * 1000;

export function recencyWeight(markedAt: number, now: number): number {
  const age = Math.max(0, now - markedAt);
  return Math.pow(0.5, age / RECENCY_HALF_LIFE_MS);
}

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

export type BuildProfileOptions = {
  clusterWindowSec: number;
  now: number;
  maxChannels?: number;
  maxTerms?: number;
};

export function buildProfile(moments: LaughMoment[], options: BuildProfileOptions): TasteProfile {
  const { now, clusterWindowSec } = options;
  const maxChannels = options.maxChannels ?? 20;
  const maxTerms = options.maxTerms ?? 40;

  const episodes = clusterMoments(moments, clusterWindowSec);

  const channelAccum = new Map<
    string,
    { name: string; id?: string; episodes: number; videos: Set<string>; weight: number }
  >();
  const termAccum = new Map<string, { weight: number; videos: Set<string> }>();
  const positionHistogram = new Array<number>(10).fill(0);
  const hourHistogram = new Array<number>(24).fill(0);
  const laughsPerVideo = new Map<string, number>();
  const firstLaughSec = new Map<string, number>();
  // Terms come from titles, which are per video, so each video contributes once.
  const countedVideosForTerms = new Set<string>();

  for (const episode of episodes) {
    const { video } = episode;
    const weight = recencyWeight(episode.lastMarkedAt, now) * Math.sqrt(episode.intensity);

    const key = channelKey(video);
    const channel = channelAccum.get(key);
    if (channel) {
      channel.episodes += 1;
      channel.videos.add(video.videoId);
      channel.weight += weight;
      if (!channel.id && video.channelId) channel.id = video.channelId;
    } else {
      channelAccum.set(key, {
        name: video.channelName,
        id: video.channelId,
        episodes: 1,
        videos: new Set([video.videoId]),
        weight,
      });
    }

    if (!countedVideosForTerms.has(video.videoId)) {
      countedVideosForTerms.add(video.videoId);
      for (const term of uniqueTokens(`${video.title} ${video.channelName}`)) {
        const entry = termAccum.get(term);
        if (entry) {
          entry.weight += weight;
          entry.videos.add(video.videoId);
        } else {
          termAccum.set(term, { weight, videos: new Set([video.videoId]) });
        }
      }
    }

    if (video.durationSec && video.durationSec > 0) {
      const fraction = Math.min(0.999, Math.max(0, episode.tSec / video.durationSec));
      positionHistogram[Math.floor(fraction * 10)] += 1;
    }

    hourHistogram[new Date(episode.lastMarkedAt).getHours()] += 1;

    laughsPerVideo.set(video.videoId, (laughsPerVideo.get(video.videoId) ?? 0) + 1);
    const currentFirst = firstLaughSec.get(video.videoId);
    if (currentFirst === undefined || episode.tSec < currentFirst) {
      firstLaughSec.set(video.videoId, episode.tSec);
    }
  }

  const channels: ChannelAffinity[] = [...channelAccum.entries()]
    .map(([key, value]) => ({
      channelKey: key,
      channelName: value.name,
      channelId: value.id,
      episodes: value.episodes,
      videos: value.videos.size,
      laughsPerVideo: value.episodes / value.videos.size,
      weight: value.weight,
    }))
    .sort((a, b) => b.weight - a.weight)
    .slice(0, maxChannels);

  const terms: TermWeight[] = [...termAccum.entries()]
    .map(([term, value]) => ({
      term,
      // Distinct-video count is the damped signal; raw weight only breaks ties.
      weight: value.weight * Math.log(1 + value.videos.size),
      videos: value.videos.size,
    }))
    .filter((entry) => entry.weight > 0)
    .sort((a, b) => b.weight - a.weight || a.term.localeCompare(b.term))
    .slice(0, maxTerms);

  return {
    version: 1,
    computedAt: now,
    momentCount: moments.length,
    episodeCount: episodes.length,
    videoCount: laughsPerVideo.size,
    channels,
    terms,
    medianLaughsPerVideo: median([...laughsPerVideo.values()]),
    medianSecondsToFirstLaugh: median([...firstLaughSec.values()]),
    positionHistogram,
    hourHistogram,
  };
}

/** Peak hour of the day for marks, or null when there is nothing to report. */
export function funniestHour(profile: TasteProfile): number | null {
  let best = -1;
  let bestCount = 0;
  profile.hourHistogram.forEach((count, hour) => {
    if (count > bestCount) {
      bestCount = count;
      best = hour;
    }
  });
  return bestCount > 0 ? best : null;
}

export function emptyProfile(now: number): TasteProfile {
  return {
    version: 1,
    computedAt: now,
    momentCount: 0,
    episodeCount: 0,
    videoCount: 0,
    channels: [],
    terms: [],
    medianLaughsPerVideo: 0,
    medianSecondsToFirstLaugh: 0,
    positionHistogram: new Array<number>(10).fill(0),
    hourHistogram: new Array<number>(24).fill(0),
  };
}
