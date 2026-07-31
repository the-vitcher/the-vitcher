// Phase 2 seam: where candidate videos will come from.
//
// Nothing here calls the network yet. The scoring that consumes candidates
// (core/scoring.ts) is already written and tested, so wiring discovery up means
// adding one implementation of this interface and nothing else.
//
// Quota shape, which dictates the design when it lands. The YouTube Data API v3 is
// free with a default of 10,000 units per day:
//
//   search.list         100 units   expensive, roughly 100 calls a day
//   playlistItems.list    1 unit    walking a channel's uploads is nearly free
//   videos.list           1 unit    up to 50 ids per call, effectively free
//   channels.list         1 unit    resolves a channel's uploads playlist id
//
// So the cheap approach is: take the channels from the taste profile, resolve their
// uploads playlists, walk those at 1 unit each, batch-hydrate 50 ids at a time, and
// reserve search.list for a couple of profile-term queries a day.
//
// A plain API key is enough for public read data. A key shipped in an extension is
// visible to anyone who unpacks it, which is fine for a personal single-user tool as
// long as it is entered in the options page (stored in chrome.storage.local, never
// committed) and restricted to the YouTube Data API v3 in the Google Cloud console.

import type { Candidate, TasteProfile } from '../core/types';

export interface CandidateSource {
  readonly name: string;
  /** True when the source has what it needs, for example a configured API key. */
  isConfigured(): boolean;
  fetchCandidates(profile: TasteProfile): Promise<Candidate[]>;
}

/** The shipped source: discovery is not built, so there are no candidates. */
export class NullCandidateSource implements CandidateSource {
  readonly name = 'none';

  isConfigured(): boolean {
    return false;
  }

  async fetchCandidates(): Promise<Candidate[]> {
    return [];
  }
}

export function createCandidateSource(_apiKey: string): CandidateSource {
  return new NullCandidateSource();
}
