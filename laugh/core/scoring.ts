// Scoring a candidate video against the taste profile.
//
// Phase 2 (discovery via the YouTube Data API) is not wired up yet, but the scoring
// is pure and fully testable today against fixture candidates, so the API layer only
// has to supply candidates when it lands.
//
// Every score carries human-readable reasons so the feed can say WHY something was
// suggested. An unexplained recommendation is not trustworthy.

import { channelKey } from './metadata';
import { UNIFORM_FRONT_LOAD_BIAS } from './profile';
import { uniqueTokens } from './tokenize';
import type { Candidate, ScoredCandidate, TasteProfile } from './types';

export type ScoringWeights = {
  channel: number;
  terms: number;
  freshness: number;
  position: number;
};

export const DEFAULT_WEIGHTS: ScoringWeights = {
  channel: 0.42,
  terms: 0.33,
  freshness: 0.1,
  position: 0.15,
};

const FRESHNESS_HALF_LIFE_MS = 14 * 24 * 60 * 60 * 1000;

/** Below this many binned laughs the position shape is noise, not a preference. */
const MIN_POSITION_SAMPLES = 5;

/** Below this many marks the hour histogram is noise. */
const MIN_HOUR_SAMPLES = 10;

export type ScoreOptions = {
  now: number;
  weights?: ScoringWeights;
  /** Videos already marked or already suggested, excluded from results. */
  seenVideoIds?: ReadonlySet<string>;
};

/** 0 to 1, how much you laugh at this channel relative to your best one. */
function channelAffinity(profile: TasteProfile, candidate: Candidate): { score: number; name?: string } {
  if (profile.channels.length === 0) return { score: 0 };
  const key = channelKey(candidate);
  const match = profile.channels.find((c) => c.channelKey === key);
  if (!match) return { score: 0 };
  const best = profile.channels[0].weight;
  return { score: best > 0 ? match.weight / best : 0, name: match.channelName };
}

/** 0 to 1, share of the candidate's title terms that carry profile weight. */
function termOverlap(profile: TasteProfile, candidate: Candidate): { score: number; matched: string[] } {
  const tokens = uniqueTokens(candidate.title);
  if (tokens.length === 0 || profile.terms.length === 0) return { score: 0, matched: [] };

  const weights = new Map(profile.terms.map((t) => [t.term, t.weight]));
  const topWeight = profile.terms[0].weight || 1;

  let total = 0;
  const matched: string[] = [];
  for (const token of tokens) {
    const weight = weights.get(token);
    if (weight === undefined) continue;
    matched.push(token);
    total += weight / topWeight;
  }

  // Normalize by a fixed cap rather than token count, so a long title full of weak
  // matches cannot outrank a short title with one strong one.
  return { score: Math.min(1, total / 3), matched };
}

function freshness(candidate: Candidate, now: number): number {
  if (!candidate.publishedAt) return 0.5;
  const age = Math.max(0, now - candidate.publishedAt);
  return Math.pow(0.5, age / FRESHNESS_HALF_LIFE_MS);
}

const SHORT_RATIO_FLOOR = 0.4;

/**
 * Length judged against where your laughs actually land.
 *
 * The anchor is the median runtime of videos you laugh at. How much longer than that
 * is still acceptable depends on the shape of the position histogram: if your laughs
 * pile into the first third of a video (high front-load bias), runtime past that
 * point is dead weight and long videos should be penalized hard. If they spread
 * evenly, a longer video keeps earning and the tolerance widens.
 *
 * This is the one profile signal that varies per candidate, which is what makes it
 * able to reorder a ranking at all.
 */
function positionFit(profile: TasteProfile, candidate: Candidate): number {
  if (!candidate.durationSec || profile.medianVideoDurationSec <= 0) return 0.5;

  const samples = profile.positionHistogram.reduce((sum, count) => sum + count, 0);
  const bias = samples >= MIN_POSITION_SAMPLES ? profile.frontLoadBias : UNIFORM_FRONT_LOAD_BIAS;

  // bias 1.0 (all laughs up front) -> tolerate 1.5x the median runtime.
  // bias 0.3 (uniform)             -> tolerate 3.6x.
  // bias 0.0 (laughs land late)    -> tolerate 4.5x.
  const upper = 1.5 + 3 * (1 - bias);
  const ratio = candidate.durationSec / profile.medianVideoDurationSec;

  if (ratio >= SHORT_RATIO_FLOOR && ratio <= upper) return 1;
  if (ratio < SHORT_RATIO_FLOOR) return Math.max(0, ratio / SHORT_RATIO_FLOOR);
  // Decays to zero at twice the tolerated length.
  return Math.max(0, 1 - (ratio - upper) / upper);
}

/**
 * How receptive you tend to be right now, from the hour histogram.
 *
 * Deliberately NOT one of the scoring weights. This value is identical for every
 * candidate in a single ranking call, so folding it into the score would scale all
 * candidates equally and reorder nothing. It answers "is now a good moment to
 * surface anything", not "which of these is best", so it belongs to whatever decides
 * whether and how prominently to show suggestions.
 */
export function surfacingReadiness(profile: TasteProfile, now: number): { score: number; reason: string } {
  const histogram = profile.hourHistogram;
  const total = histogram.reduce((sum, count) => sum + count, 0);

  if (total < MIN_HOUR_SAMPLES) {
    return { score: 0.5, reason: 'Not enough history yet to know your comedy hours' };
  }

  // A few hundred marks over 24 buckets is spiky, so blend the neighbouring hours.
  const smoothed = (hour: number): number => {
    const previous = histogram[(hour + 23) % 24];
    const next = histogram[(hour + 1) % 24];
    return (previous + 2 * histogram[hour] + next) / 4;
  };

  const peak = Math.max(...Array.from({ length: 24 }, (_, hour) => smoothed(hour)));
  if (peak <= 0) return { score: 0.5, reason: 'Not enough history yet to know your comedy hours' };

  const score = smoothed(new Date(now).getHours()) / peak;

  if (score >= 0.7) return { score, reason: 'This is one of your funny hours' };
  if (score <= 0.3) return { score, reason: 'You rarely mark anything at this hour' };
  return { score, reason: 'An average hour for you' };
}

export function scoreCandidate(
  profile: TasteProfile,
  candidate: Candidate,
  options: ScoreOptions,
): ScoredCandidate {
  const weights = options.weights ?? DEFAULT_WEIGHTS;
  const reasons: string[] = [];

  const channel = channelAffinity(profile, candidate);
  if (channel.score > 0.15 && channel.name) {
    reasons.push(`You laugh at ${channel.name}`);
  }

  const terms = termOverlap(profile, candidate);
  if (terms.matched.length > 0) {
    reasons.push(`Matches your taste for ${terms.matched.slice(0, 3).join(', ')}`);
  }

  const fresh = freshness(candidate, options.now);
  if (fresh > 0.7) reasons.push('Posted recently');

  const fit = positionFit(profile, candidate);
  if (fit >= 1 && candidate.durationSec) reasons.push('About the length you laugh at');

  const score =
    weights.channel * channel.score +
    weights.terms * terms.score +
    weights.freshness * fresh +
    weights.position * fit;

  return { candidate, score, reasons };
}

/** Score, drop anything already seen, and return best first. */
export function rankCandidates(
  profile: TasteProfile,
  candidates: Candidate[],
  options: ScoreOptions,
): ScoredCandidate[] {
  const seen = options.seenVideoIds ?? new Set<string>();
  return candidates
    .filter((candidate) => !seen.has(candidate.videoId))
    .map((candidate) => scoreCandidate(profile, candidate, options))
    .sort((a, b) => b.score - a.score);
}
