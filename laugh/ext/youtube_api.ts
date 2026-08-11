// Discovery: turning a taste profile into candidate videos.
//
// The quota shape drives the whole design. The free tier is 10,000 units a day and
// search.list costs 100 of them, while channels.list, playlistItems.list and
// videos.list cost 1 each (and videos.list takes 50 ids per call). So the cheap path
// is: resolve the uploads playlists of the channels you already laugh at, walk them,
// and batch-hydrate. A full refresh costs roughly 10 units, meaning hundreds of
// refreshes a day rather than a hundred.
//
// search.list is opt-in, off by default, and guarded by a reserve, because one
// careless loop through it burns the day.
//
// fetch is injected so the whole orchestrator is testable with no key and no network.

import {
  batchIds,
  parseApiError,
  parsePlaylistVideoIds,
  parseSearchVideoIds,
  parseUploadsPlaylists,
  parseVideoCandidates,
} from '../core/youtube_parse';
import { canAfford, charge, costOf, REFRESH_BUDGET, type QuotaLedger } from '../core/quota';
import type { Candidate, TasteProfile } from '../core/types';

const API_ROOT = 'https://www.googleapis.com/youtube/v3';

/** Channels to walk per refresh. Each one costs a single unit. */
const MAX_CHANNELS = 8;
/** Recent uploads to pull from each channel. */
const UPLOADS_PER_CHANNEL = 10;
/** Profile terms to feed one search query, when search is enabled. */
const SEARCH_TERMS = 3;

export type FetchLike = (url: string) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

export interface CandidateSource {
  readonly name: string;
  isConfigured(): boolean;
  fetchCandidates(profile: TasteProfile, ledger: QuotaLedger, now: number): Promise<CandidateResult>;
}

export type CandidateResult = {
  candidates: Candidate[];
  ledger: QuotaLedger;
  unitsSpent: number;
  /** Non-fatal notes worth showing, for example a partial result after an error. */
  notes: string[];
};

/** Shipped when no API key is configured. Discovery is simply unavailable. */
export class NullCandidateSource implements CandidateSource {
  readonly name = 'none';

  isConfigured(): boolean {
    return false;
  }

  async fetchCandidates(_profile: TasteProfile, ledger: QuotaLedger, _now: number): Promise<CandidateResult> {
    return {
      candidates: [],
      ledger,
      unitsSpent: 0,
      notes: ['Add a YouTube Data API key in settings to find new videos.'],
    };
  }
}

export type YouTubeSourceOptions = {
  apiKey: string;
  /** search.list costs 100 units, so it stays off unless explicitly enabled. */
  allowSearch: boolean;
  fetchImpl?: FetchLike;
};

export class YouTubeDataApiSource implements CandidateSource {
  readonly name = 'youtube-data-api';

  private readonly apiKey: string;
  private readonly allowSearch: boolean;
  private readonly fetchImpl: FetchLike;

  constructor(options: YouTubeSourceOptions) {
    this.apiKey = options.apiKey;
    this.allowSearch = options.allowSearch;
    this.fetchImpl = options.fetchImpl ?? ((url) => fetch(url));
  }

  isConfigured(): boolean {
    return this.apiKey.trim().length > 0;
  }

  private url(path: string, params: Record<string, string>): string {
    const query = new URLSearchParams({ ...params, key: this.apiKey });
    return `${API_ROOT}/${path}?${query.toString()}`;
  }

  /** Returns parsed JSON, or throws with a message fit to show a person. */
  private async get(path: string, params: Record<string, string>): Promise<unknown> {
    const response = await this.fetchImpl(this.url(path, params));
    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      throw new Error(parseApiError(payload) ?? `YouTube API request failed (${response.status}).`);
    }
    return payload;
  }

  async fetchCandidates(profile: TasteProfile, ledger: QuotaLedger, now: number): Promise<CandidateResult> {
    const notes: string[] = [];
    let currentLedger = ledger;
    let spent = 0;

    const spend = (call: Parameters<typeof costOf>[0], calls = 1): boolean => {
      const cost = costOf(call, calls);
      if (spent + cost > REFRESH_BUDGET) return false;
      if (!canAfford(currentLedger, now, call, calls)) return false;
      currentLedger = charge(currentLedger, now, call, calls);
      spent += cost;
      return true;
    };

    // Only channels with a real id can be resolved cheaply. A name-only channel
    // would need a search.list to find, which is not worth 100 units.
    const channelIds = profile.channels
      .map((channel) => channel.channelId)
      .filter((id): id is string => Boolean(id))
      .slice(0, MAX_CHANNELS);

    const videoIds: string[] = [];

    if (channelIds.length > 0 && spend('channels')) {
      try {
        const payload = await this.get('channels', {
          part: 'contentDetails',
          id: channelIds.join(','),
          maxResults: String(channelIds.length),
        });

        const playlists = parseUploadsPlaylists(payload);

        for (const playlistId of playlists.values()) {
          if (!spend('playlistItems')) {
            notes.push('Stopped early to stay inside the refresh budget.');
            break;
          }
          try {
            const items = await this.get('playlistItems', {
              part: 'contentDetails',
              playlistId,
              maxResults: String(UPLOADS_PER_CHANNEL),
            });
            videoIds.push(...parsePlaylistVideoIds(items));
          } catch (error) {
            // One dead playlist should not sink the whole refresh.
            notes.push(errorMessage(error));
          }
        }
      } catch (error) {
        notes.push(errorMessage(error));
      }
    } else if (channelIds.length === 0) {
      notes.push('No channels with a known id yet. Mark a few more videos first.');
    }

    if (this.allowSearch && profile.terms.length > 0 && spend('search')) {
      const query = profile.terms
        .slice(0, SEARCH_TERMS)
        .map((term) => term.term)
        .join(' ');
      try {
        const payload = await this.get('search', {
          part: 'snippet',
          type: 'video',
          q: query,
          order: 'date',
          maxResults: '20',
        });
        videoIds.push(...parseSearchVideoIds(payload));
      } catch (error) {
        notes.push(errorMessage(error));
      }
    }

    if (videoIds.length === 0) {
      return { candidates: [], ledger: currentLedger, unitsSpent: spent, notes };
    }

    const candidates: Candidate[] = [];
    for (const batch of batchIds(videoIds)) {
      if (!spend('videos')) {
        notes.push('Stopped early to stay inside the refresh budget.');
        break;
      }
      try {
        const payload = await this.get('videos', {
          part: 'snippet,contentDetails',
          id: batch.join(','),
          maxResults: String(batch.length),
        });
        candidates.push(...parseVideoCandidates(payload));
      } catch (error) {
        notes.push(errorMessage(error));
      }
    }

    return { candidates, ledger: currentLedger, unitsSpent: spent, notes };
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'YouTube API request failed.';
}

export function createCandidateSource(options: {
  apiKey: string;
  allowSearch: boolean;
  fetchImpl?: FetchLike;
}): CandidateSource {
  const source = new YouTubeDataApiSource(options);
  return source.isConfigured() ? source : new NullCandidateSource();
}
