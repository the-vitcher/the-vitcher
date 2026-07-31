// Title tokenizing for the taste profile.

const STOPWORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'if', 'of', 'to', 'in', 'on', 'at', 'for',
  'with', 'from', 'by', 'as', 'is', 'are', 'was', 'were', 'be', 'been', 'it', 'its',
  'this', 'that', 'these', 'those', 'i', 'me', 'my', 'we', 'our', 'you', 'your',
  'he', 'she', 'they', 'them', 'his', 'her', 'their', 'not', 'no', 'so', 'too',
  'very', 'just', 'about', 'into', 'out', 'up', 'down', 'over', 'when', 'what',
  'why', 'how', 'who', 'do', 'does', 'did', 'get', 'got', 'can', 'will', 'would',
]);

// Words that appear on every other YouTube title and carry no taste signal.
const YOUTUBE_FILLER = new Set([
  'official', 'video', 'full', 'episode', 'ep', 'part', 'pt', 'hd', 'k', 'new',
  'watch', 'free', 'online', 'live', 'stream', 'clip', 'clips', 'compilation',
  'reaction', 'shorts', 'short', 'vs', 'ft', 'feat', 'featuring', 'season',
  'trailer', 'teaser', 'subscribe', 'channel', 'update', 'review', 'best', 'top',
]);

/**
 * Lowercase word tokens, three chars or longer, stopwords and YouTube filler
 * removed. Digits are dropped because episode numbers are noise.
 */
export function tokenize(text: string): string[] {
  if (!text) return [];
  return text
    .toLowerCase()
    .replace(/['’]/g, '')
    .split(/[^a-z0-9]+/)
    .filter((token) => {
      if (token.length < 3) return false;
      if (/^\d+$/.test(token)) return false;
      if (STOPWORDS.has(token)) return false;
      if (YOUTUBE_FILLER.has(token)) return false;
      return true;
    });
}

/** Unique tokens for one document, so a repeated word counts once per video. */
export function uniqueTokens(text: string): string[] {
  return [...new Set(tokenize(text))];
}

export function isStopword(token: string): boolean {
  return STOPWORDS.has(token) || YOUTUBE_FILLER.has(token);
}
