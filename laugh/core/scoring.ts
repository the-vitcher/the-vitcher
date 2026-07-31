// Scoring a candidate video against the taste profile.
//
// Phase 2 (discovery via the YouTube Data API) is not wired up yet, but the scoring
// is pure and fully testable today against fixture candidates, so the API layer only
// has to supply candidates when it lands.
//
// Every score carries human-readable reasons so the feed can say WHY something was
// suggested. An unexplained recommendation is not trustworthy.

import { channelKey } from './metadata';
import { uniqueTokens } from './tokenize';
import type { Candidate, ScoredCandidate, TasteProfile } from './types';

export type ScoringWeights = {
  channel: number;
  terms: number;
  freshness: number;
  duration: number;
};

export const DEFAULT_WEIGHTS: ScoringWeights = {
  channel: 0.45,
  terms: 0.35,
  freshness: 0.12,
  duration: 0.08,
};

const FRESHNESS_HALF_LIFE_MS = 14 * 24 * 60 * 60 * 1000;

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

/** Prefer lengths near the videos you actually laugh at. */
function durationFit(profile: TasteProfile, candidate: Candidate): number {
  if (!candidate.durationSec || profile.medianSecondsToFirstLaugh <= 0) return 0.5;
  // If you typically laugh within the first N seconds, a video far shorter than
  // that rarely gets the chance to land.
  const ratio = candidate.durationSec / Math.max(30, profile.medianSecondsToFirstLaugh * 4);
  if (ratio >= 0.5 && ratio <= 3) return 1;
  return ratio < 0.5 ? Math.max(0, ratio * 2) : Math.max(0, 1 - (ratio - 3) / 6);
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

  const fit = durationFit(profile, candidate);

  const score =
    weights.channel * channel.score +
    weights.terms * terms.score +
    weights.freshness * fresh +
    weights.duration * fit;

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
