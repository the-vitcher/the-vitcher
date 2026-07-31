// Collapsing rapid presses into laugh episodes.
//
// Three presses across one long laugh are one funny moment of intensity 3, not three
// separate moments. Without this the feed fills with near-duplicate rows and the
// profile over-weights whatever made you laugh hardest instead of most often.

import type { LaughEpisode, LaughMoment } from './types';

/**
 * Groups moments in the same video whose punchline estimates fall within
 * `clusterWindowSec` of the previous press. Returned newest episode first.
 */
export function clusterMoments(moments: LaughMoment[], clusterWindowSec: number): LaughEpisode[] {
  const window = Math.max(0, clusterWindowSec);
  const byVideo = new Map<string, LaughMoment[]>();

  for (const moment of moments) {
    const bucket = byVideo.get(moment.videoId);
    if (bucket) bucket.push(moment);
    else byVideo.set(moment.videoId, [moment]);
  }

  const episodes: LaughEpisode[] = [];

  for (const group of byVideo.values()) {
    // Chronological within the video so the chain walk below is well defined.
    const ordered = [...group].sort((a, b) => a.tSec - b.tSec);
    let current: LaughMoment[] = [];

    for (const moment of ordered) {
      if (current.length === 0) {
        current = [moment];
        continue;
      }
      const previous = current[current.length - 1];
      // Chain from the previous press, not the cluster start, so a sustained laugh
      // stays one episode instead of splitting at an arbitrary boundary.
      if (moment.tSec - previous.tSec <= window) current.push(moment);
      else {
        episodes.push(toEpisode(current));
        current = [moment];
      }
    }

    if (current.length > 0) episodes.push(toEpisode(current));
  }

  return episodes.sort((a, b) => b.lastMarkedAt - a.lastMarkedAt);
}

function toEpisode(moments: LaughMoment[]): LaughEpisode {
  const markedAts = moments.map((m) => m.markedAt);
  return {
    videoId: moments[0].videoId,
    // The most recent snapshot has the freshest title and channel.
    video: moments.reduce((best, m) => (m.video.capturedAt > best.video.capturedAt ? m : best)).video,
    tSec: moments[0].tSec,
    intensity: moments.length,
    moments,
    firstMarkedAt: Math.min(...markedAts),
    lastMarkedAt: Math.max(...markedAts),
  };
}

export type VideoGroup = {
  videoId: string;
  video: LaughEpisode['video'];
  episodes: LaughEpisode[];
  totalMoments: number;
  lastMarkedAt: number;
};

/** Episodes rolled up per video, which is how the feed lays itself out. */
export function groupByVideo(episodes: LaughEpisode[]): VideoGroup[] {
  const groups = new Map<string, VideoGroup>();

  for (const episode of episodes) {
    const existing = groups.get(episode.videoId);
    if (!existing) {
      groups.set(episode.videoId, {
        videoId: episode.videoId,
        video: episode.video,
        episodes: [episode],
        totalMoments: episode.intensity,
        lastMarkedAt: episode.lastMarkedAt,
      });
      continue;
    }
    existing.episodes.push(episode);
    existing.totalMoments += episode.intensity;
    if (episode.lastMarkedAt > existing.lastMarkedAt) {
      existing.lastMarkedAt = episode.lastMarkedAt;
      existing.video = episode.video;
    }
  }

  for (const group of groups.values()) {
    group.episodes.sort((a, b) => a.tSec - b.tSec);
  }

  return [...groups.values()].sort((a, b) => b.lastMarkedAt - a.lastMarkedAt);
}
