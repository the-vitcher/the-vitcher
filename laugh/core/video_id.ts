// Parsing YouTube video ids out of the many URL shapes YouTube uses.

const ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;

/** YouTube ids are exactly 11 chars of the URL-safe base64 alphabet. */
export function isVideoId(value: string | null | undefined): value is string {
  return typeof value === 'string' && ID_PATTERN.test(value);
}

const PATH_PREFIXES = ['/shorts/', '/embed/', '/live/', '/v/'];

/**
 * Accepts watch URLs, youtu.be short links, /shorts/, /embed/, /live/, and the
 * mobile host. Returns null for anything that is not a single video URL, for
 * example a channel page or the YouTube home page.
 */
export function parseVideoId(href: string | null | undefined): string | null {
  if (!href) return null;

  let url: URL;
  try {
    url = new URL(href);
  } catch {
    // Bare ids are accepted so callers can pass through a value they already have.
    return isVideoId(href) ? href : null;
  }

  const host = url.hostname.replace(/^www\./, '').replace(/^m\./, '');

  if (host === 'youtu.be') {
    const id = url.pathname.slice(1).split('/')[0];
    return isVideoId(id) ? id : null;
  }

  if (host !== 'youtube.com' && host !== 'youtube-nocookie.com') return null;

  const v = url.searchParams.get('v');
  if (isVideoId(v)) return v;

  for (const prefix of PATH_PREFIXES) {
    if (url.pathname.startsWith(prefix)) {
      const id = url.pathname.slice(prefix.length).split('/')[0];
      if (isVideoId(id)) return id;
    }
  }

  return null;
}

/** True when the URL is a page where marking makes sense. */
export function isWatchablePage(href: string | null | undefined): boolean {
  return parseVideoId(href) !== null;
}
